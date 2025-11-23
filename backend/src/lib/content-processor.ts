import type { D1Database } from "@cloudflare/workers-types";
import OpenAI from "openai";
import { extractContentFromUrl, isGitHubUrl } from "./web-extractor";
import { fetchMarkdownFromGitHub } from "./github";
import {
  splitMarkdownByHeaders,
  determineProcessingStrategy,
  type Chunk,
} from "./semantic-chunker";
import {
  parseQuestionsWithOpenAI,
  deduplicateQuestions,
  type ParsedQuestion,
  hasPrewrittenAnswersWithAI,
  parsePrewrittenQA,
} from "./openai-parser";
import { createExtractionPrompt, ATOMIC_FLASHCARD_SYSTEM_PROMPT } from "./prompts";
import { batchUpsertQuestions, type UpsertResult } from "./questions";

export interface ProcessingOptions {
  openaiApiKey: string;
  openaiModel?: string;
  githubToken?: string;
  maxConcurrentChunks?: number;
}

export interface ProcessingResult {
  success: boolean;
  url: string;
  strategy: "github_prewritten" | "github_extracted" | "web_single" | "web_chunked";
  questionsExtracted: number;
  chunksProcessed?: number;
  wordCount: number;
  error?: string;
  upsertResult?: UpsertResult;
}

/**
 * Main orchestrator for processing any URL (GitHub or web) into Q&A pairs
 * Implements the full "Distill & Chunk" pipeline
 */
export async function processUrlToQuestions(
  db: D1Database,
  url: string,
  options: ProcessingOptions
): Promise<ProcessingResult> {
  const { openaiApiKey, openaiModel = "gpt-4o-mini", githubToken } = options;

  try {
    // PHASE 1: Smart Extraction
    let markdown: string;
    let wordCount: number;
    let isGithub = false;

    if (isGitHubUrl(url)) {
      console.log("  🔍 Detected GitHub URL - using GitHub API");
      isGithub = true;

      if (!githubToken) {
        return {
          success: false,
          url,
          strategy: "github_prewritten",
          questionsExtracted: 0,
          wordCount: 0,
          error: "GitHub token required for GitHub URLs",
        };
      }

      const { content } = await fetchMarkdownFromGitHub(url, githubToken);
      markdown = content;
      wordCount = content.split(/\s+/).filter(Boolean).length;
    } else {
      console.log("  🌐 Processing web URL with smart extraction");
      const extractionResult = await extractContentFromUrl(url);

      if (!extractionResult.success || !extractionResult.data) {
        return {
          success: false,
          url,
          strategy: "web_single",
          questionsExtracted: 0,
          wordCount: 0,
          error: extractionResult.error || "Content extraction failed",
        };
      }

      markdown = extractionResult.data.content;
      wordCount = extractionResult.data.wordCount;
      console.log(`  ✓ Extracted ${wordCount} words from main content`);
    }

    // PHASE 2: Token Budget Check
    const strategy = determineProcessingStrategy(wordCount);

    if (strategy === "reject") {
      return {
        success: false,
        url,
        strategy: "web_single",
        questionsExtracted: 0,
        wordCount,
        error: `Content too small (${wordCount} words). Minimum 50 words required.`,
      };
    }

    let questions: ParsedQuestion[] = [];
    let processingStrategy: ProcessingResult["strategy"] = "web_single";
    let chunksProcessed: number | undefined = undefined;

    // Check if content has pre-written answers (GitHub optimization)
    if (isGithub) {
      console.log("  🔍 Checking for pre-written answers with AI...");
      const hasAnswers = await hasPrewrittenAnswersWithAI(
        markdown,
        openaiApiKey,
        openaiModel
      );

      if (hasAnswers) {
        console.log("  ✓ Pre-written answers detected, parsing directly...");
        questions = parsePrewrittenQA(markdown);
        processingStrategy = "github_prewritten";
        console.log(`  ✓ Parsed ${questions.length} questions directly`);
      } else {
        // No pre-written answers - fall through to extraction logic
        isGithub = false; // Treat as regular content
      }
    }

    if (!isGithub) {
      if (strategy === "single_pass") {
        // SINGLE PASS: Content is small enough to process in one go
        console.log("  🤖 Content fits in single pass, extracting with OpenAI...");
        processingStrategy = "web_single";

        questions = await parseQuestionsWithOpenAI(markdown, openaiApiKey, openaiModel);
        console.log(`  ✓ Extracted ${questions.length} questions`);
      } else {
        // PHASE 3: Semantic Chunking
        console.log("  📦 Content large, using semantic chunking...");
        processingStrategy = isGithub ? "github_extracted" : "web_chunked";

        const chunks = splitMarkdownByHeaders(markdown);
        chunksProcessed = chunks.length;
        console.log(`  ✓ Split into ${chunks.length} semantic chunks`);

        // PHASE 4: Parallel LLM Extraction
        console.log("  🤖 Processing chunks in parallel...");
        const chunkResults = await processChunksInParallel(
          chunks,
          openaiApiKey,
          openaiModel,
          options.maxConcurrentChunks || 3
        );

        // Combine and deduplicate
        const allQuestions = chunkResults.flat();
        questions = deduplicateQuestions(allQuestions);

        const duplicates = allQuestions.length - questions.length;
        if (duplicates > 0) {
          console.log(`  ✓ Removed ${duplicates} duplicate(s) across chunks`);
        }

        console.log(
          `  ✓ Extracted ${questions.length} unique questions from ${chunks.length} chunks`
        );
      }
    }

    // Upsert to database
    console.log("  💾 Upserting to database...");
    const upsertResult = await batchUpsertQuestions(db, questions, url);
    console.log(
      `  ✓ Inserted: ${upsertResult.inserted}, Updated: ${upsertResult.updated}`
    );

    return {
      success: true,
      url,
      strategy: processingStrategy,
      questionsExtracted: questions.length,
      chunksProcessed,
      wordCount,
      upsertResult,
    };
  } catch (error) {
    console.error("Processing error:", error);
    return {
      success: false,
      url,
      strategy: "web_single",
      questionsExtracted: 0,
      wordCount: 0,
      error: error instanceof Error ? error.message : "Unknown processing error",
    };
  }
}

/**
 * Processes chunks in parallel with concurrency limit
 */
async function processChunksInParallel(
  chunks: Chunk[],
  apiKey: string,
  model: string,
  maxConcurrent: number
): Promise<ParsedQuestion[][]> {
  const results: ParsedQuestion[][] = [];

  // Process in batches to respect concurrency limit
  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);

    const batchPromises = batch.map(async (chunk) => {
      const prompt = createExtractionPrompt(chunk.content, {
        headers: chunk.metadata.headers,
      });

      // Use custom prompt with system message
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: ATOMIC_FLASHCARD_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

      return questions.filter(
        (q: any): q is ParsedQuestion =>
          typeof q === "object" &&
          q !== null &&
          "question" in q &&
          "answer" in q &&
          typeof q.question === "string" &&
          typeof q.answer === "string"
      );
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    console.log(`    Processed batch ${Math.floor(i / maxConcurrent) + 1}`);
  }

  return results;
}
