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
