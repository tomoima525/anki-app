import "dotenv/config";
import { parseQuestionsInChunks } from "../../src/lib/openai-parser";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ParseResult } from "./types";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const dataDir = join(process.cwd(), "..", "data");

  // Get all JSON files in data directory (excluding combined file)
  const files = readdirSync(dataDir).filter(
    (f) => f.endsWith(".json") && !f.startsWith("all_sources")
  );

  if (files.length === 0) {
    console.error("No JSON files found in data/ directory");
    console.error("Run 'pnpm fetch-parse' first to fetch questions");
    process.exit(1);
  }

  console.log(`Found ${files.length} source file(s) to process\n`);

  for (const filename of files) {
    const filepath = join(dataDir, filename);
    console.log(`Processing: ${filename}`);

    try {
      // Read the parsed data
      const data: ParseResult = JSON.parse(readFileSync(filepath, "utf-8"));

      // Filter questions that need answers
      const questionsNeedingAnswers = data.questions.filter(
        (q) => !q.hasAnswer
      );

      if (questionsNeedingAnswers.length === 0) {
        console.log("  ✓ All questions already have answers, skipping\n");
        continue;
      }

      console.log(
        `  📝 Generating answers for ${questionsNeedingAnswers.length} questions...`
      );

      // Prepare content for OpenAI (combine questions into markdown)
      const markdownContent = questionsNeedingAnswers
        .map((q, idx) => {
          return `## Question ${idx + 1}\n\n${q.content}`;
        })
        .join("\n\n");

      // Generate answers using OpenAI
      const generatedQA = await parseQuestionsInChunks(
        markdownContent,
        apiKey,
        model
      );

      console.log(`  ✓ Generated ${generatedQA.length} answers`);

      // Update the questions with generated answers
      let updatedCount = 0;
      for (let i = 0; i < questionsNeedingAnswers.length; i++) {
        if (i < generatedQA.length) {
          const originalQuestion = questionsNeedingAnswers[i];
          const generatedAnswer = generatedQA[i];

          // Find the question in the original data and update it
          const questionIndex = data.questions.findIndex(
            (q) => q.content === originalQuestion.content
          );

          if (questionIndex !== -1) {
            data.questions[questionIndex].answer = generatedAnswer.answer;
            data.questions[questionIndex].hasAnswer = true;
            updatedCount++;
          }
        }
      }

      // Update metadata
      data.hasAnswers = data.questions.every((q) => q.hasAnswer);
      data.timestamp = new Date().toISOString();

      // Save updated data
      writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✓ Updated ${updatedCount} questions with answers`);
      console.log(`  ✓ Saved to: ${filename}\n`);
    } catch (error) {
      console.error(`  ✗ Failed to process ${filename}:`, error);
      console.log("");
    }
  }

  // Update combined file if it exists
  const combinedFiles = readdirSync(dataDir).filter(
    (f) => f.startsWith("all_sources") && f.endsWith(".json")
  );

  if (combinedFiles.length > 0) {
    const combinedFilepath = join(dataDir, combinedFiles[0]);
    console.log(`Updating combined file: ${combinedFiles[0]}`);

    try {
      const allResults: ParseResult[] = [];

      for (const filename of files) {
        const filepath = join(dataDir, filename);
        const data: ParseResult = JSON.parse(readFileSync(filepath, "utf-8"));
        allResults.push(data);
      }

      writeFileSync(combinedFilepath, JSON.stringify(allResults, null, 2));
      console.log(`  ✓ Updated combined file\n`);
    } catch (error) {
      console.error(`  ✗ Failed to update combined file:`, error);
    }
  }

  console.log("=== Answer Generation Complete ===");
  console.log(
    "\n💡 Next step: Review the JSON files in data/ directory, then run 'pnpm upsert-data' to import to database"
  );
}

main().catch(console.error);
