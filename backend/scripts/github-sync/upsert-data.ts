import type { D1Database } from "@cloudflare/workers-types";
import { batchUpsertQuestions, type UpsertResult } from "../../src/lib/questions";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ParseResult } from "./types";

interface Env {
  DB: D1Database;
}

type SourceUpsertResult = {
  source: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = env.DB;

    const dataDir = join(process.cwd(), "..", "data");

    // Get all JSON files in data directory (excluding combined file)
    const files = readdirSync(dataDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("all_sources"));

    if (files.length === 0) {
      console.error("No JSON files found in data/ directory");
      return new Response("No JSON files found in data/ directory", { status: 400 });
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
        const questionsWithoutAnswers = data.questions.filter((q) => !q.hasAnswer);
        if (questionsWithoutAnswers.length > 0) {
          console.log(`  ⚠️  Warning: ${questionsWithoutAnswers.length} questions don't have answers`);
          console.log("  💡 Run 'pnpm generate-answers' first to generate missing answers");
          console.log("  ⏭️  Skipping this file\n");
          continue;
        }

        console.log(`  💾 Upserting ${data.questions.length} questions to database...`);

        // Transform to format expected by batchUpsertQuestions
        const questionsToUpsert = data.questions.map((q) => ({
          question: q.content,
          answer: q.answer || "",
        }));

        // Upsert to database
        const upsertResult = await batchUpsertQuestions(
          db,
          questionsToUpsert,
          data.sourceUrl,
          data.source
        );

        console.log(
          `  ✓ Inserted: ${upsertResult.inserted}, Updated: ${upsertResult.updated}, Skipped: ${upsertResult.skipped}`
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
    console.log(`Total questions: ${totals.total}`);
    console.log(`Inserted: ${totals.inserted}`);
    console.log(`Updated: ${totals.updated}`);
    console.log(`Skipped: ${totals.skipped}`);

    const response = {
      success: true,
      results,
      totals,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
