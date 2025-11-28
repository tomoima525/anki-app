import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import * as readline from "readline";
import type { ParseResult } from "./types";

type SourceUpsertResult = {
  source: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
};

/**
 * Prompts user for confirmation
 */
function confirmAction(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Escapes single quotes for SQL strings
 */
function escapeSQLString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Upserts questions to D1 database using wrangler d1 execute with SQL file
 */
async function upsertQuestionsToD1(
  questions: Array<{ question: string; answer: string }>,
  sourceUrl: string,
  sourceName: string,
  isRemote: boolean = false,
  isProd: boolean = false
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}> {
  const dbName = isProd ? "anki-interview-db-prod" : "anki-interview-db";
  const dbFlag = isRemote ? "--remote" : "--local";

  // Create temporary SQL file
  const tempSqlFile = join(process.cwd(), `upsert_temp_${Date.now()}.sql`);
  let sqlStatements = "";

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  // Build all SQL statements
  for (const q of questions) {
    // Generate a deterministic ID based on question and answer
    const idString = `${q.question}-${q.answer}`;
    const id = Buffer.from(idString).toString("base64").slice(0, 32);

    // Escape single quotes for SQL
    const escapedQuestion = escapeSQLString(q.question);
    const escapedAnswer = escapeSQLString(q.answer);
    const escapedSource = escapeSQLString(sourceUrl);
    const escapedSourceName = escapeSQLString(sourceName);

    // Use INSERT OR REPLACE for upsert behavior
    // This will insert if not exists, or replace if exists
    sqlStatements += `INSERT OR REPLACE INTO questions (id, question_text, answer_text, source, source_name, created_at, updated_at)
VALUES (
  '${id}',
  '${escapedQuestion}',
  '${escapedAnswer}',
  '${escapedSource}',
  '${escapedSourceName}',
  COALESCE((SELECT created_at FROM questions WHERE id = '${id}'), '${now}'),
  '${now}'
);\n`;
  }

  try {
    // Write SQL to temporary file
    writeFileSync(tempSqlFile, sqlStatements, "utf-8");

    // Execute SQL file
    execSync(
      `npx wrangler d1 execute ${dbName} ${dbFlag} --file="${tempSqlFile}"`,
      { encoding: "utf-8" }
    );

    // Since we're using INSERT OR REPLACE, all operations succeed
    // Count by checking how many INSERT statements we had
    const insertCount = questions.length;

    // Clean up temp file
    unlinkSync(tempSqlFile);

    return {
      inserted: insertCount,
      updated: 0, // INSERT OR REPLACE doesn't distinguish
      skipped: 0,
      total: questions.length,
    };
  } catch (error) {
    // Clean up temp file on error
    try {
      unlinkSync(tempSqlFile);
    } catch {
      // Ignore cleanup errors
    }

    console.error(`  ✗ Error executing SQL: ${error}`);
    return {
      inserted: 0,
      updated: 0,
      skipped: questions.length,
      total: questions.length,
    };
  }
}

async function main() {
  // Check if targeting remote database
  const args = process.argv.slice(2);
  const isRemote = args.includes("--remote");
  const isProd = args.includes("--prod");

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

  console.log("🚀 Starting data upsert...");
  console.log("");
  console.log(
    `📁 Target database: ${isRemote ? (isProd ? "PRODUCTION (remote)" : "DEV (remote)") : "LOCAL"}`
  );
  console.log(`📊 Source files: ${files.length}`);
  console.log("");

  // Confirm before upserting to production
  if (isRemote) {
    const confirmed = await confirmAction(
      "⚠️  This will upsert data to the remote database. Continue? (y/N): "
    );
    if (!confirmed) {
      console.log("❌ Upsert cancelled.");
      process.exit(0);
    }
    console.log("");
  }

  console.log(`Found ${files.length} source file(s) to upsert\n`);

  const results: SourceUpsertResult[] = [];

  for (const filename of files) {
    const filepath = join(dataDir, filename);
    console.log(`Processing: ${filename}`);

    try {
      // Read the parsed data
      const data: ParseResult = JSON.parse(readFileSync(filepath, "utf-8"));

      // Check if all questions have answers
      const questionsWithoutAnswers = data.questions.filter(
        (q) => !q.hasAnswer
      );
      if (questionsWithoutAnswers.length > 0) {
        console.log(
          `  ⚠️  Warning: ${questionsWithoutAnswers.length} questions don't have answers`
        );
        console.log(
          "  💡 Run 'pnpm generate-answers' first to generate missing answers"
        );
        console.log("  ⏭️  Skipping this file\n");
        continue;
      }

      console.log(
        `  💾 Upserting ${data.questions.length} questions to database...`
      );

      // Transform to format expected by upsert function
      const questionsToUpsert = data.questions.map((q) => ({
        question: q.content,
        answer: q.answer || "",
      }));

      // Upsert to database
      const upsertResult = await upsertQuestionsToD1(
        questionsToUpsert,
        data.sourceUrl,
        data.source,
        isRemote,
        isProd
      );

      console.log(
        `  ✓ Upserted: ${upsertResult.inserted} questions successfully`
      );

      results.push({
        source: data.source,
        ...upsertResult,
      });
    } catch (error) {
      console.error(`  ✗ Failed to process ${filename}:`, error);
    }

    console.log("");
  }

  // Calculate totals
  const totals = results.reduce(
    (acc, r) => {
      acc.inserted += r.inserted || 0;
      acc.updated += r.updated || 0;
      acc.skipped += r.skipped || 0;
      acc.total += r.total || 0;
      return acc;
    },
    { inserted: 0, updated: 0, skipped: 0, total: 0 }
  );

  console.log("=== Upsert Complete ===");
  console.log(`Total questions processed: ${totals.total}`);
  console.log(`Successfully upserted: ${totals.inserted}`);
  if (totals.skipped > 0) {
    console.log(`Failed: ${totals.skipped}`);
  }
  console.log(
    "\n💡 Next step: Use the study interface to practice these questions!"
  );
}

main().catch(console.error);
