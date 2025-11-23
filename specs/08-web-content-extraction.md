# Enhanced Web Content Extraction & Q&A Generation Spec

## Overview

This document describes the "Distill & Chunk" pipeline - a robust architectural approach for extracting content from arbitrary web URLs and generating high-quality Q&A pairs. This extends the existing GitHub-specific sync functionality to support any web content while respecting context limits and filtering out garbage input.

## Problem Statement

The current implementation is limited to:
- GitHub repositories only
- Simple line-based chunking (not semantic)
- No content quality validation (can process empty/low-value pages)
- No smart extraction (processes raw HTML including navbars, ads, sidebars)

**Key Challenges:**
1. **Context Limits**: Cannot dump entire `<body>` tags into LLM - we need intelligent filtering and compression
2. **Garbage Input**: Landing pages, homepages, and sites with minimal content waste tokens and produce poor results
3. **Loss of Context**: Arbitrary chunking can split questions from answers

## The "Distill & Chunk" Pipeline Architecture

Instead of treating websites as one giant string, we treat them as a collection of **semantic sections**.

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT: Web URL or GitHub                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Smart Extraction (No LLM)                         │
│  - Detect source type (GitHub vs. general web)              │
│  - Use Readability.js/DOM parsing to extract main content   │
│  - For GitHub: Use GitHub API for clean markdown            │
│  - Strip ads, navbars, footers, sidebars                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Token Budget Check (The Guardrail)               │
│  - Count words/tokens in extracted content                  │
│  - < 50 words: REJECT (too small/no content)               │
│  - 50-3000 words: SINGLE PASS (send to LLM in one go)      │
│  - > 3000 words: CHUNKING MODE (proceed to Phase 3)        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Semantic Chunking                                 │
│  - Split by headings (H1, H2, H3) to preserve context       │
│  - Keep topics and explanations together                    │
│  - Maintain code blocks within chunks                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Parallel LLM Extraction                           │
│  - Process chunks in parallel for speed                     │
│  - Use optimized atomic prompts                             │
│  - Extract Q&A pairs as JSON                                │
│  - Deduplicate across chunks                                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT: Q&A Pairs                        │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Existing GitHub sync implementation (spec 03)
- Database setup (spec 01)
- OpenAI API access
- Node.js environment with Cloudflare Workers

## Implementation Tasks

### 1. Install Dependencies

#### 1.1 Add content extraction libraries

**Location:** `backend/package.json`

```bash
cd backend
npm install @mozilla/readability linkedom turndown
npm install --save-dev @types/turndown
```

**Libraries:**
- `@mozilla/readability`: Mozilla's smart content extraction (like Reader View)
- `linkedom`: Lightweight DOM implementation for Node.js/Workers
- `turndown`: HTML to Markdown converter

**Acceptance Criteria:**
- [ ] Dependencies installed
- [ ] TypeScript types available
- [ ] Compatible with Cloudflare Workers runtime

### 2. Smart Content Extraction (Phase 1)

#### 2.1 Create web content fetcher with smart extraction

**Location:** `backend/src/lib/web-extractor.ts`

```typescript
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export interface ExtractedContent {
  title: string;
  content: string; // Clean markdown
  textContent: string; // Plain text for word counting
  wordCount: number;
  url: string;
  byline?: string; // Author if available
  excerpt?: string; // Summary
  siteName?: string;
}

export interface ExtractionResult {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
  errorType?: "too_small" | "fetch_failed" | "parse_failed" | "empty_content";
}

/**
 * Fetches and extracts main content from a web URL
 * Uses Mozilla Readability for smart extraction (removes ads, navbars, etc.)
 */
export async function extractContentFromUrl(
  url: string,
  userAgent: string = "Anki-Interview-App/1.0"
): Promise<ExtractionResult> {
  try {
    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        errorType: "fetch_failed",
      };
    }

    const html = await response.text();

    // Parse HTML and extract main content using Readability
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article || !article.content) {
      return {
        success: false,
        error: "No main content found. This might be a landing page or login wall.",
        errorType: "empty_content",
      };
    }

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Preserve code blocks
    turndownService.addRule("preserveCode", {
      filter: ["pre", "code"],
      replacement: (content, node) => {
        if (node.nodeName === "PRE") {
          const codeElement = node.querySelector("code");
          const language = codeElement?.className.match(/language-(\w+)/)?.[1] || "";
          return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
        }
        return `\`${content}\``;
      },
    });

    const markdown = turndownService.turndown(article.content);
    const textContent = article.textContent || "";
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    // Phase 2 Guardrail: Check word count
    if (wordCount < 50) {
      return {
        success: false,
        error: `Insufficient content (${wordCount} words). Page may be too small or content unavailable.`,
        errorType: "too_small",
      };
    }

    return {
      success: true,
      data: {
        title: article.title || "Untitled",
        content: markdown,
        textContent,
        wordCount,
        url,
        byline: article.byline,
        excerpt: article.excerpt,
        siteName: article.siteName,
      },
    };
  } catch (error) {
    console.error("Content extraction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
      errorType: "parse_failed",
    };
  }
}

/**
 * Determines if URL is a GitHub URL and should use GitHub API instead
 */
export function isGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "github.com" ||
      urlObj.hostname === "raw.githubusercontent.com"
    );
  } catch {
    return false;
  }
}

/**
 * Estimates token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
```

**Acceptance Criteria:**
- [ ] Extracts main content only (no ads, navbars, footers)
- [ ] Converts HTML to clean markdown
- [ ] Returns word count and metadata
- [ ] Implements < 50 word guardrail
- [ ] Handles fetch failures gracefully
- [ ] Detects GitHub URLs
- [ ] 30-second timeout for hanging requests

### 3. Semantic Chunking (Phase 3)

#### 3.1 Create markdown header-based splitter

**Location:** `backend/src/lib/semantic-chunker.ts`

```typescript
export interface Chunk {
  content: string;
  metadata: {
    headers: string[]; // Breadcrumb of headers (e.g., ["Introduction", "Basic Concepts"])
    level: number; // Deepest header level in this chunk
    startLine?: number;
    endLine?: number;
  };
  wordCount: number;
  estimatedTokens: number;
}

export interface ChunkingOptions {
  maxWordsPerChunk?: number; // Default: 750 (roughly 1000 tokens)
  minWordsPerChunk?: number; // Default: 50
  preserveCodeBlocks?: boolean; // Default: true
}

/**
 * Splits markdown content by headers (H1, H2, H3) to preserve semantic context
 * This ensures questions aren't separated from their answers
 */
export function splitMarkdownByHeaders(
  markdown: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const {
    maxWordsPerChunk = 750,
    minWordsPerChunk = 50,
    preserveCodeBlocks = true,
  } = options;

  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentHeaders: string[] = [];
  let headerStack: Array<{ level: number; text: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Check if we should create a new chunk
      const currentWordCount = currentChunk.join("\n").split(/\s+/).filter(Boolean).length;

      if (currentWordCount >= maxWordsPerChunk && currentChunk.length > 0) {
        // Save current chunk
        const chunkContent = currentChunk.join("\n");
        if (chunkContent.trim()) {
          chunks.push(createChunk(chunkContent, [...currentHeaders]));
        }
        currentChunk = [];
      }

      // Update header stack
      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, text: headerText });

      // Update current headers breadcrumb
      currentHeaders = headerStack.map((h) => h.text);
    }

    currentChunk.push(line);
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n");
    if (chunkContent.trim()) {
      chunks.push(createChunk(chunkContent, currentHeaders));
    }
  }

  // Filter out chunks that are too small
  const validChunks = chunks.filter((chunk) => chunk.wordCount >= minWordsPerChunk);

  // If no valid chunks, return the entire content as one chunk
  if (validChunks.length === 0 && markdown.trim()) {
    return [createChunk(markdown, [])];
  }

  return validChunks;
}

function createChunk(content: string, headers: string[]): Chunk {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const estimatedTokens = Math.ceil(content.length / 4);

  return {
    content,
    metadata: {
      headers,
      level: headers.length,
    },
    wordCount,
    estimatedTokens,
  };
}

/**
 * Determines processing strategy based on word count
 */
export type ProcessingStrategy = "reject" | "single_pass" | "chunked";

export function determineProcessingStrategy(wordCount: number): ProcessingStrategy {
  if (wordCount < 50) return "reject";
  if (wordCount <= 3000) return "single_pass";
  return "chunked";
}
```

**Acceptance Criteria:**
- [ ] Splits by H1, H2, H3 headers
- [ ] Maintains header breadcrumb for context
- [ ] Respects max chunk size (~750 words)
- [ ] Filters out chunks < 50 words
- [ ] Handles edge case of no headers
- [ ] Returns entire content as single chunk if small enough

### 4. Improved LLM Prompts (Phase 4)

#### 4.1 Create atomic flashcard generation prompts

**Location:** `backend/src/lib/prompts.ts`

```typescript
/**
 * System prompt for atomic flashcard generation
 * Enforces one concept per card, self-contained questions
 */
export const ATOMIC_FLASHCARD_SYSTEM_PROMPT = `You are an expert educator creating Anki flashcards for technical interview preparation.

CORE PRINCIPLES:
1. **Atomic**: Each card tests exactly ONE concept or fact
2. **Self-Contained**: Questions must make sense without the source text
3. **No Fluff**: Avoid phrases like "According to the text..." - state facts directly
4. **Preserve Code**: Keep code blocks intact with proper formatting
5. **Technical Accuracy**: Maintain precise technical terminology

FORMAT:
Return a JSON array with this exact structure:
{
  "questions": [
    {
      "question": "Clear, specific question",
      "answer": "Concise, complete answer"
    }
  ]
}

QUALITY STANDARDS:
- Questions should be specific and unambiguous
- Answers should be complete but concise (2-4 sentences ideal)
- Include code examples where relevant
- Focus on "what", "how", and "why" questions
- Avoid yes/no questions unless testing recognition`;

/**
 * User prompt template for extracting flashcards from content
 */
export function createExtractionPrompt(
  content: string,
  context?: { headers?: string[]; sourceType?: string }
): string {
  const contextInfo = context?.headers?.length
    ? `\n\nSection Context: ${context.headers.join(" > ")}`
    : "";

  return `Extract high-quality technical flashcards from the content below.

Focus on:
- Key concepts and definitions
- Technical patterns and best practices
- Common interview questions and answers
- Code examples and their explanations
- Relationships between concepts

Create flashcards that help someone prepare for technical interviews.${contextInfo}

CONTENT:
${content}

Return only valid JSON with the questions array. No additional text.`;
}

/**
 * Prompt for code-heavy content
 */
export const CODE_FOCUSED_PROMPT = `You are creating flashcards for coding interview preparation.

SPECIAL INSTRUCTIONS FOR CODE:
1. Always preserve code blocks with their language tags
2. Format code blocks as:
   \`\`\`language
   code here
   \`\`\`
3. Create cards that test:
   - What the code does
   - Time/space complexity
   - Edge cases
   - Common patterns
   - Implementation details

4. Include "trace the output" style questions for short code snippets
5. Ask about optimization opportunities

Return JSON array of question-answer pairs.`;

/**
 * Validates that generated Q&A meets quality standards
 */
export function validateQuestion(question: string, answer: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check minimum lengths
  if (question.length < 10) {
    issues.push("Question too short (< 10 characters)");
  }
  if (answer.length < 10) {
    issues.push("Answer too short (< 10 characters)");
  }

  // Check for common anti-patterns
  if (question.toLowerCase().includes("according to")) {
    issues.push("Question contains 'according to' - should be self-contained");
  }

  if (!/\?$/.test(question.trim()) && !question.includes("What") && !question.includes("How")) {
    issues.push("Question may not be properly formatted");
  }

  // Check that question and answer aren't identical
  if (question.toLowerCase() === answer.toLowerCase()) {
    issues.push("Question and answer are identical");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
```

**Acceptance Criteria:**
- [ ] System prompt enforces atomic principles
- [ ] Extraction prompt includes context (headers)
- [ ] Code-focused variant for programming content
- [ ] Validation function checks quality
- [ ] Prompts avoid common anti-patterns

### 5. Orchestration Layer

#### 5.1 Create unified content processing orchestrator

**Location:** `backend/src/lib/content-processor.ts`

```typescript
import type { D1Database } from "@cloudflare/workers-types";
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
    let processingStrategy: ProcessingResult["strategy"];

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
      chunksProcessed: strategy === "chunked" ? chunks.length : undefined,
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
```

**Acceptance Criteria:**
- [ ] Detects GitHub vs. web URLs
- [ ] Uses appropriate extraction method
- [ ] Implements token budget check
- [ ] Chooses single-pass vs. chunked strategy
- [ ] Processes chunks in parallel with concurrency limit
- [ ] Deduplicates across chunks
- [ ] Upserts to database
- [ ] Returns detailed processing result

### 6. Updated Sync Script

#### 6.1 Update sync script to support both GitHub and web URLs

**Location:** `backend/scripts/sync-github.ts`

Update the script to use the new orchestrator:

```typescript
import type { D1Database } from "@cloudflare/workers-types";
import { processUrlToQuestions } from "../src/lib/content-processor";
import { getAllSources } from "../src/config/sources";

interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = env.DB;
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || "gpt-4o-mini";
    const githubToken = env.GITHUB_TOKEN;

    if (!apiKey) {
      return new Response("Error: OPENAI_API_KEY is not set", { status: 500 });
    }

    const sources = getAllSources();

    if (sources.length === 0) {
      return new Response("Error: No sources configured", { status: 400 });
    }

    console.log(`Starting sync for ${sources.length} source(s)...\n`);

    const results = [];

    for (const source of sources) {
      console.log(`Processing: ${source.name}`);
      console.log(`URL: ${source.url}`);

      const result = await processUrlToQuestions(db, source.url, {
        openaiApiKey: apiKey,
        openaiModel: model,
        githubToken,
        maxConcurrentChunks: 3,
      });

      if (result.success) {
        console.log(`  ✅ Success: ${result.questionsExtracted} questions`);
        console.log(`  Strategy: ${result.strategy}`);
        console.log(`  Word count: ${result.wordCount}`);
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }

      results.push({
        source: source.name,
        ...result,
      });

      console.log("");
    }

    const totals = results.reduce(
      (acc, r) => {
        if (r.success) {
          acc.total += r.questionsExtracted || 0;
          acc.inserted += r.upsertResult?.inserted || 0;
          acc.updated += r.upsertResult?.updated || 0;
        } else {
          acc.failed++;
        }
        return acc;
      },
      { total: 0, inserted: 0, updated: 0, failed: 0 }
    );

    console.log("=== Sync Complete ===");
    console.log(`Total questions extracted: ${totals.total}`);
    console.log(`Inserted: ${totals.inserted}`);
    console.log(`Updated: ${totals.updated}`);
    console.log(`Failed sources: ${totals.failed}`);

    return new Response(
      JSON.stringify(
        {
          success: true,
          results,
          totals,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
```

**Acceptance Criteria:**
- [ ] Works with both GitHub and web URLs
- [ ] Shows processing strategy used
- [ ] Reports word count and chunks
- [ ] Handles mixed source types
- [ ] Clear progress output

### 7. Configuration Updates

#### 7.1 Update sources configuration to support web URLs

**Location:** `backend/src/config/sources.ts`

```typescript
export interface QuestionSource {
  id: string;
  name: string;
  url: string;
  type?: "github" | "web"; // Optional type hint
  description?: string;
}

export const QUESTION_SOURCES: QuestionSource[] = [
  {
    id: "backend-interview",
    name: "Back-End Developer Interview Questions",
    url: "https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md",
    type: "github",
  },
  // Example: Technical blog post
  {
    id: "web-example-1",
    name: "Understanding React Hooks",
    url: "https://overreacted.io/a-complete-guide-to-useeffect/",
    type: "web",
    description: "Dan Abramov's guide to useEffect",
  },
  // More sources...
];
```

**Acceptance Criteria:**
- [ ] Supports both GitHub and web URLs
- [ ] Type hint is optional (auto-detected)
- [ ] Backward compatible with existing sources

## Testing

### 8.1 Unit tests for each phase

**Location:** `backend/scripts/test-extraction.ts`

```typescript
import { extractContentFromUrl } from "../src/lib/web-extractor";
import { splitMarkdownByHeaders } from "../src/lib/semantic-chunker";

interface Env {
  OPENAI_API_KEY: string;
}

const TEST_URLS = {
  good: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures",
  empty: "https://google.com",
  large: "https://eloquentjavascript.net/01_values.html",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const results = [];

    // Test 1: Good content
    console.log("Test 1: Extracting good content...");
    const good = await extractContentFromUrl(TEST_URLS.good);
    results.push({
      test: "good_content",
      success: good.success,
      wordCount: good.data?.wordCount,
    });

    // Test 2: Empty/minimal content (should fail)
    console.log("Test 2: Testing minimal content rejection...");
    const empty = await extractContentFromUrl(TEST_URLS.empty);
    results.push({
      test: "empty_content",
      shouldFail: true,
      failed: !empty.success,
      errorType: empty.errorType,
    });

    // Test 3: Semantic chunking
    console.log("Test 3: Testing semantic chunking...");
    if (good.success && good.data) {
      const chunks = splitMarkdownByHeaders(good.data.content);
      results.push({
        test: "chunking",
        chunkCount: chunks.length,
        avgWordsPerChunk:
          chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length,
      });
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
```

**Run tests:**
```bash
npx wrangler dev --local scripts/test-extraction.ts --test-scheduled
```

**Acceptance Criteria:**
- [ ] Good content extracts successfully
- [ ] Empty/minimal content is rejected
- [ ] Semantic chunking produces reasonable chunks
- [ ] All phases work end-to-end

### 8.2 Integration test with real URLs

Create a test configuration with diverse URLs:

```typescript
const TEST_SOURCES = [
  {
    id: "test-github",
    name: "GitHub Test",
    url: "https://github.com/donnemartin/system-design-primer/blob/master/README.md",
  },
  {
    id: "test-blog",
    name: "Blog Test",
    url: "https://martinfowler.com/articles/microservices.html",
  },
  {
    id: "test-docs",
    name: "Documentation Test",
    url: "https://docs.python.org/3/tutorial/classes.html",
  },
];
```

**Test checklist:**
- [ ] GitHub URL processes correctly
- [ ] Technical blog extracts main content
- [ ] Documentation site extracts cleanly
- [ ] Each URL produces quality Q&A pairs
- [ ] No duplicate questions across chunks
- [ ] Proper error handling for invalid URLs

## Error Handling

### 9.1 Comprehensive error scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| URL returns 404 | Return error with `fetch_failed` type |
| Page is behind login wall | Return error with `empty_content` type |
| Page has < 50 words | Return error with `too_small` type |
| Fetch timeout (> 30s) | Return error with `fetch_failed` type |
| OpenAI API fails | Retry once, then return error |
| Content is 100,000+ words | Process first 50 chunks, warn user |
| Invalid GitHub URL | Return error with parse details |
| Rate limit exceeded | Return error with retry-after suggestion |

**Acceptance Criteria:**
- [ ] All error types handled gracefully
- [ ] Clear error messages for users
- [ ] Failed sources don't crash entire sync
- [ ] Errors are logged with context

## Hard Limits

To prevent abuse and runaway costs:

```typescript
export const PROCESSING_LIMITS = {
  MAX_WORD_COUNT: 100000, // Reject documents > 100k words
  MAX_CHUNKS: 50, // Process max 50 chunks
  MAX_CONCURRENT_CHUNKS: 3, // Parallel processing limit
  FETCH_TIMEOUT_MS: 30000, // 30 second timeout
  MIN_WORD_COUNT: 50, // Minimum viable content
  SINGLE_PASS_THRESHOLD: 3000, // Words threshold for single pass
};
```

**Acceptance Criteria:**
- [ ] Limits enforced in code
- [ ] Exceeding limits returns clear error
- [ ] Limits are configurable via environment

## Success Criteria

- [ ] Smart extraction removes ads/navbars/footers
- [ ] < 50 word guardrail prevents garbage input
- [ ] Semantic chunking preserves Q&A context
- [ ] Parallel processing speeds up large documents
- [ ] Atomic prompts produce high-quality flashcards
- [ ] Works with both GitHub and web URLs
- [ ] Proper error handling for all edge cases
- [ ] Word count/chunk statistics logged
- [ ] Questions deduplicated across chunks
- [ ] Existing GitHub functionality preserved

## Performance Considerations

**Token Cost Optimization:**
- Smart extraction reduces content by ~70% (removes boilerplate)
- Pre-written answer detection saves API calls for GitHub
- Parallel chunk processing reduces wall-clock time
- Single-pass for small content minimizes overhead

**Estimated Costs (GPT-4o-mini):**
- Small page (500 words): ~$0.001
- Medium page (2000 words): ~$0.003
- Large page (10,000 words, 13 chunks): ~$0.015

**Speed:**
- Single pass: ~2-3 seconds
- Chunked (10 chunks, 3 parallel): ~8-10 seconds
- GitHub with pre-written: < 1 second (no API)

## Migration Path

1. **Phase 1**: Deploy smart extraction (backward compatible)
2. **Phase 2**: Add semantic chunking
3. **Phase 3**: Update prompts to atomic style
4. **Phase 4**: Enable web URL support
5. **Phase 5**: Migrate existing sources to use new pipeline

**Backward Compatibility:**
- Existing GitHub sources continue working
- Old sync script remains functional
- New features are opt-in via source configuration

## Future Enhancements

- [ ] Support for PDF extraction
- [ ] Crawling multiple pages from a domain
- [ ] Image extraction for diagram-based questions
- [ ] Table extraction for comparison questions
- [ ] Scheduled automatic re-sync
- [ ] Web UI for adding sources
- [ ] Quality scoring for generated flashcards
- [ ] A/B testing different prompts

## References

- [Mozilla Readability](https://github.com/mozilla/readability)
- [Turndown (HTML to Markdown)](https://github.com/mixmark-io/turndown)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Anki Flashcard Best Practices](https://docs.ankiweb.net/getting-started.html)
- [Semantic Chunking Strategies](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/markdown_header_metadata)

## Appendix A: Example Processing Flow

```
INPUT: https://martinfowler.com/articles/microservices.html

Phase 1: Smart Extraction
├─ Fetch HTML (15,000 characters)
├─ Run Readability.js
├─ Extract main article content (10,000 characters)
├─ Convert to Markdown (8,000 characters)
└─ Count: 1,850 words ✓

Phase 2: Token Budget Check
├─ Word count: 1,850
├─ Strategy: SINGLE_PASS (< 3000 words)
└─ Proceed to extraction ✓

Phase 3: Semantic Chunking
└─ SKIPPED (single pass strategy)

Phase 4: LLM Extraction
├─ Use atomic flashcard prompt
├─ Process entire content at once
├─ Extract 12 Q&A pairs
└─ Validate quality ✓

Phase 5: Database Upsert
├─ Check for duplicates
├─ Insert 10 new questions
├─ Update 2 existing questions
└─ Complete ✓

OUTPUT: 12 questions extracted, 10 inserted, 2 updated
```

## Appendix B: Quality Checklist for Generated Flashcards

Each generated flashcard should meet these criteria:

- [ ] Question is self-contained (no "the text says...")
- [ ] Question tests one concept (atomic)
- [ ] Answer is complete but concise (2-4 sentences)
- [ ] Code blocks are properly formatted
- [ ] Technical terminology is accurate
- [ ] Question is unambiguous
- [ ] Answer directly addresses the question
- [ ] No hallucinated information
