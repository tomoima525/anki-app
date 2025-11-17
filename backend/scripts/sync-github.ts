import type { D1Database } from "@cloudflare/workers-types";
import { fetchMarkdownFromGitHub } from "../src/lib/github";
import { parseQuestionsInChunks } from "../src/lib/openai-parser";
import { batchUpsertQuestions, type UpsertResult } from "../src/lib/questions";
import { getAllSources } from "../src/config/sources";

interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
}

type SyncResult =
  | ({ source: string } & UpsertResult)
  | { source: string; error: string };

function isSuccessResult(
  result: SyncResult
): result is { source: string } & UpsertResult {
  return !("error" in result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = env.DB;
    const githubToken = env.GITHUB_TOKEN;
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      console.error("Error: OPENAI_API_KEY is not set");
      return new Response("Error: OPENAI_API_KEY is not set", { status: 500 });
    }

    if (!githubToken) {
      console.error("Error: GITHUB_TOKEN is not set");
      return new Response("Error: GITHUB_TOKEN is not set", { status: 500 });
    }

    // Get all configured sources
    const sources = getAllSources();

    if (sources.length === 0) {
      console.error("Error: No sources configured");
      return new Response("Error: No sources configured", { status: 400 });
    }

    console.log(`Starting sync for ${sources.length} source(s)...\n`);

    const results: SyncResult[] = [];

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

        // 2. Parse with OpenAI
        console.log("  🤖 Parsing with OpenAI...");
        const questions = await parseQuestionsInChunks(content, apiKey, model);
        console.log(`  ✓ Parsed ${questions.length} questions`);

        // 3. Upsert to database
        console.log("  💾 Upserting to database...");
        const upsertResult = await batchUpsertQuestions(
          db,
          questions,
          source.url
        );
        console.log(
          `  ✓ Inserted: ${upsertResult.inserted}, Updated: ${upsertResult.updated}, Skipped: ${upsertResult.skipped}`
        );

        results.push({
          source: source.name,
          ...upsertResult,
        });
      } catch (error) {
        console.error(`  ✗ Failed to sync source ${source.name}:`, error);
        results.push({
          source: source.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      console.log("");
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => {
        if (isSuccessResult(r)) {
          acc.inserted += r.inserted || 0;
          acc.updated += r.updated || 0;
          acc.total += r.total || 0;
        }
        return acc;
      },
      { inserted: 0, updated: 0, total: 0 }
    );

    console.log("=== Sync Complete ===");
    console.log(`Total questions: ${totals.total}`);
    console.log(`Inserted: ${totals.inserted}`);
    console.log(`Updated: ${totals.updated}`);

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
