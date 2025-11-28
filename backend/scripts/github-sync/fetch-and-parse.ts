import "dotenv/config";
import { fetchMarkdownFromGitHub } from "../../src/lib/github";
import {
  hasPrewrittenAnswersWithAI,
  parsePrewrittenQA,
} from "../../src/lib/openai-parser";
import { getAllSources } from "../../src/config/sources";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { ParsedQuestion, ParseResult } from "./types";

async function main() {
  // Load environment variables
  const apiKey = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY is not set");
    process.exit(1);
  }

  if (!githubToken) {
    console.error("Error: GITHUB_TOKEN is not set");
    process.exit(1);
  }

  // Get all configured sources
  const sources = getAllSources();

  if (sources.length === 0) {
    console.error("Error: No sources configured");
    process.exit(1);
  }

  console.log(`Starting fetch and parse for ${sources.length} source(s)...\n`);

  // Ensure data directory exists
  const dataDir = join(process.cwd(), "..", "data");
  mkdirSync(dataDir, { recursive: true });

  const allResults: ParseResult[] = [];

  for (const source of sources) {
    console.log(`Processing: ${source.name}`);
    console.log(`URL: ${source.url}`);

    try {
      // 1. Fetch markdown
      console.log("  📥 Fetching markdown...");
      const { content } = await fetchMarkdownFromGitHub(
        source.url,
        githubToken
      );
      console.log(`  ✓ Fetched ${content.length} characters`);

      // 2. Check if document already contains answers using OpenAI
      console.log("  🔍 Checking for pre-written answers with AI...");
      const hasAnswers = await hasPrewrittenAnswersWithAI(
        content,
        apiKey,
        model
      );

      let questions: ParsedQuestion[] = [];

      if (hasAnswers) {
        // 2a. Parse Q&A directly from markdown
        console.log("  ✓ Pre-written answers detected, parsing with LLM...");
        const parsedQA = await parsePrewrittenQA(content, apiKey, model);

        questions = parsedQA.map((qa) => ({
          content: qa.question,
          answer: qa.answer,
          hasAnswer: true,
          source: source.name,
          sourceUrl: source.url,
        }));

        console.log(`  ✓ Parsed ${questions.length} questions with answers`);
      } else {
        // 2b. Questions only - answers will be generated separately
        console.log(
          "  ✓ No pre-written answers found, parsing questions with LLM..."
        );
        // Parse content as questions - answers will be generated separately
        const parsedQA = await parsePrewrittenQA(content, apiKey, model);

        questions = parsedQA.map((qa) => ({
          content: qa.question,
          answer: undefined,
          hasAnswer: false,
          source: source.name,
          sourceUrl: source.url,
        }));

        console.log(
          `  ✓ Parsed ${questions.length} questions (answers needed)`
        );
      }

      const result: ParseResult = {
        source: source.name,
        sourceUrl: source.url,
        questions,
        hasAnswers,
        timestamp: new Date().toISOString(),
      };

      allResults.push(result);

      // Save individual source result
      const filename = `${source.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${new Date().toISOString().split("T")[0]}.json`;
      const filepath = join(dataDir, filename);
      writeFileSync(filepath, JSON.stringify(result, null, 2));
      console.log(`  ✓ Saved to: data/${filename}`);
    } catch (error) {
      console.error(`  ✗ Failed to process source ${source.name}:`, error);
    }

    console.log("");
  }

  // Save combined results
  const combinedFilename = `all_sources_${new Date().toISOString().split("T")[0]}.json`;
  const combinedFilepath = join(dataDir, combinedFilename);
  writeFileSync(combinedFilepath, JSON.stringify(allResults, null, 2));
  console.log(`\n✓ Saved combined results to: data/${combinedFilename}`);

  // Summary
  const totalQuestions = allResults.reduce(
    (sum, r) => sum + r.questions.length,
    0
  );
  const questionsWithAnswers = allResults.reduce(
    (sum, r) => sum + r.questions.filter((q) => q.hasAnswer).length,
    0
  );
  const questionsNeedingAnswers = totalQuestions - questionsWithAnswers;

  console.log("\n=== Fetch and Parse Complete ===");
  console.log(`Total questions: ${totalQuestions}`);
  console.log(`Questions with answers: ${questionsWithAnswers}`);
  console.log(`Questions needing answers: ${questionsNeedingAnswers}`);

  if (questionsNeedingAnswers > 0) {
    console.log(
      "\n💡 Next step: Run 'pnpm generate-answers' to generate missing answers"
    );
  } else {
    console.log("\n💡 Next step: Run 'pnpm upsert-data' to import to database");
  }
}

main().catch(console.error);
