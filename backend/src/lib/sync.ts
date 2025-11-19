/**
 * Reusable sync logic for syncing questions from GitHub sources
 */

import type { D1Database } from "@cloudflare/workers-types";
import { fetchMarkdownFromGitHub } from "./github";
import { parseQuestionsInChunks } from "./openai-parser";
import { batchUpsertQuestions, type UpsertResult } from "./questions";
import { getAllSources } from "../config/sources";

export type SyncResult =
  | ({ source: string } & UpsertResult)
  | { source: string; error: string };

export interface SyncTotals {
  inserted: number;
  updated: number;
  total: number;
}

function isSuccessResult(
  result: SyncResult
): result is { source: string } & UpsertResult {
  return !("error" in result);
}

/**
 * Sync all configured sources from GitHub
 * @param db - D1 Database instance
 * @param apiKey - OpenAI API key for parsing
 * @param model - OpenAI model to use (defaults to gpt-4o-mini)
 * @param githubToken - GitHub token for API access (optional)
 * @returns Array of sync results per source
 */
export async function syncAllSources(
  db: D1Database,
  apiKey: string,
  model: string = "gpt-4o-mini",
  githubToken?: string
): Promise<SyncResult[]> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  // Get all configured sources
  const sources = getAllSources();

  if (sources.length === 0) {
    throw new Error("No sources configured");
  }

  console.log(`Starting sync for ${sources.length} source(s)...`);

  const results: SyncResult[] = [];

  for (const source of sources) {
    console.log(`Processing: ${source.name}`);
    console.log(`URL: ${source.url}`);

    try {
      // 1. Fetch markdown
      console.log("  📥 Fetching markdown...");
      const { content } = await fetchMarkdownFromGitHub(
        source.url,
        githubToken || ""
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

  return results;
}

/**
 * Calculate totals from sync results
 */
export function calculateSyncTotals(results: SyncResult[]): SyncTotals {
  return results.reduce(
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
}
