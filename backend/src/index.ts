/**
 * Cloudflare Workers backend for Anki Interview App
 * Provides API endpoints for database operations
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncAllSources, calculateSyncTotals } from "./lib/sync";
import { getAllSources } from "./config/sources";

export interface Env {
  DB: D1Database;
  APP_USERNAME: string;
  APP_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for frontend
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // Allow localhost for development and production URLs
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("https://")
      ) {
        return origin;
      }
      return "http://localhost:3000"; // default
    },
    credentials: true,
  })
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Study endpoints

/**
 * POST /api/study/next
 * Get a random question (without answer)
 */
app.post("/api/study/next", async (c) => {
  try {
    const db = c.env.DB;

    // For v1: simple random selection
    // Future: weight by last_answered_at or difficulty
    const question = await db
      .prepare(
        `SELECT id, question_text, source
         FROM questions
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .first<{ id: string; question_text: string; source: string }>();

    if (!question) {
      return c.json(
        { error: "No questions available. Please sync questions first." },
        404
      );
    }

    return c.json({
      id: question.id,
      question: question.question_text,
      source: question.source,
    });
  } catch (error) {
    console.error("Get next question error:", error);
    return c.json({ error: "Failed to get next question" }, 500);
  }
});

/**
 * GET /api/study/:id
 * Get a specific question with answer
 */
app.get("/api/study/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.env.DB;

    const question = await db
      .prepare(
        `SELECT id, question_text, answer_text, source
         FROM questions
         WHERE id = ?`
      )
      .bind(id)
      .first<{
        id: string;
        question_text: string;
        answer_text: string;
        source: string;
      }>();

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    return c.json({
      id: question.id,
      question: question.question_text,
      answer: question.answer_text,
      source: question.source,
    });
  } catch (error) {
    console.error("Get question error:", error);
    return c.json({ error: "Failed to get question" }, 500);
  }
});

/**
 * POST /api/study/:id/answer
 * Submit answer with difficulty rating
 */
app.post("/api/study/:id/answer", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{ difficulty: string }>();
    const { difficulty } = body;

    // Validate difficulty
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return c.json({ error: "Invalid difficulty value" }, 400);
    }

    const db = c.env.DB;
    const now = new Date().toISOString();

    // Verify question exists
    const question = await db
      .prepare("SELECT id FROM questions WHERE id = ?")
      .bind(id)
      .first();

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    // Use D1 batch for atomic transaction
    await db.batch([
      // Insert into answer_logs
      db
        .prepare(
          `INSERT INTO answer_logs (question_id, difficulty, answered_at)
         VALUES (?, ?, ?)`
        )
        .bind(id, difficulty, now),

      // Update question aggregates
      db
        .prepare(
          `UPDATE questions
         SET last_answered_at = ?,
             last_difficulty = ?,
             answer_count = answer_count + 1
         WHERE id = ?`
        )
        .bind(now, difficulty, id),
    ]);

    return c.json({
      success: true,
      message: "Answer recorded",
    });
  } catch (error) {
    console.error("Submit answer error:", error);
    return c.json({ error: "Failed to submit answer" }, 500);
  }
});

// Question management endpoints

/**
 * GET /api/questions/stats
 * Get statistics about questions and answers
 * Note: This route must come before /api/questions/:id to avoid routing conflicts
 */
app.get("/api/questions/stats", async (c) => {
  try {
    const db = c.env.DB;

    // Total questions
    const totalResult = await db
      .prepare("SELECT COUNT(*) as count FROM questions")
      .first<{ count: number }>();

    // Answered questions
    const answeredResult = await db
      .prepare("SELECT COUNT(*) as count FROM questions WHERE answer_count > 0")
      .first<{ count: number }>();

    // Difficulty distribution
    const difficultyResult = await db
      .prepare(
        `SELECT last_difficulty, COUNT(*) as count
         FROM questions
         WHERE last_difficulty IS NOT NULL
         GROUP BY last_difficulty`
      )
      .all<{ last_difficulty: string; count: number }>();

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityResult = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM answer_logs
         WHERE answered_at > ?`
      )
      .bind(sevenDaysAgo.toISOString())
      .first<{ count: number }>();

    // Build difficulty stats
    const difficultyStats = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    (difficultyResult.results || []).forEach((row) => {
      if (row.last_difficulty === "easy") difficultyStats.easy = row.count;
      if (row.last_difficulty === "medium") difficultyStats.medium = row.count;
      if (row.last_difficulty === "hard") difficultyStats.hard = row.count;
    });

    return c.json({
      totalQuestions: totalResult?.count || 0,
      answeredQuestions: answeredResult?.count || 0,
      unansweredQuestions:
        (totalResult?.count || 0) - (answeredResult?.count || 0),
      difficultyDistribution: difficultyStats,
      recentActivity: recentActivityResult?.count || 0,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return c.json({ error: "Failed to get statistics" }, 500);
  }
});

/**
 * GET /api/questions/:id
 * Get question detail with answer history
 */
app.get("/api/questions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.env.DB;

    // Get question
    const question = await db
      .prepare("SELECT * FROM questions WHERE id = ?")
      .bind(id)
      .first();

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    // Get recent answer logs
    const logs = await db
      .prepare(
        `SELECT * FROM answer_logs
         WHERE question_id = ?
         ORDER BY answered_at DESC
         LIMIT 20`
      )
      .bind(id)
      .all();

    return c.json({
      question,
      recentLogs: logs.results || [],
    });
  } catch (error) {
    console.error("Get question detail error:", error);
    return c.json({ error: "Failed to get question details" }, 500);
  }
});

/**
 * GET /api/questions
 * List questions with filters, search, and sorting
 */
app.get("/api/questions", async (c) => {
  try {
    const db = c.env.DB;

    // Parse query parameters
    const difficulty = c.req.query("difficulty"); // 'easy' | 'medium' | 'hard'
    const sort = c.req.query("sort") || "recent";
    const search = c.req.query("search");
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // Build query
    let query = "SELECT * FROM questions WHERE 1=1";
    const bindings: any[] = [];

    // Filter by difficulty
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      query += " AND last_difficulty = ?";
      bindings.push(difficulty);
    }

    // Search in question text
    if (search) {
      query += " AND question_text LIKE ?";
      bindings.push(`%${search}%`);
    }

    // Sort
    switch (sort) {
      case "recent":
        query += " ORDER BY last_answered_at DESC NULLS LAST";
        break;
      case "oldest":
        query += " ORDER BY last_answered_at ASC NULLS FIRST";
        break;
      case "most_answered":
        query += " ORDER BY answer_count DESC";
        break;
      case "least_answered":
        query += " ORDER BY answer_count ASC";
        break;
      default:
        query += " ORDER BY created_at DESC";
    }

    // Pagination
    query += " LIMIT ? OFFSET ?";
    bindings.push(limit, offset);

    // Execute query
    const result = await db
      .prepare(query)
      .bind(...bindings)
      .all();

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as count FROM questions WHERE 1=1";
    const countBindings: any[] = [];

    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      countQuery += " AND last_difficulty = ?";
      countBindings.push(difficulty);
    }

    if (search) {
      countQuery += " AND question_text LIKE ?";
      countBindings.push(`%${search}%`);
    }

    const countResult = await db
      .prepare(countQuery)
      .bind(...countBindings)
      .first<{ count: number }>();

    return c.json({
      questions: result.results || [],
      pagination: {
        total: countResult?.count || 0,
        limit: limit,
        offset: offset,
        hasMore: offset + limit < (countResult?.count || 0),
      },
    });
  } catch (error) {
    console.error("Get questions error:", error);
    return c.json({ error: "Failed to get questions" }, 500);
  }
});

// Sync endpoints

/**
 * POST /api/sync
 * Trigger async GitHub sync using ctx.waitUntil
 */
app.post("/api/sync", async (c) => {
  try {
    const db = c.env.DB;

    // Check if a sync is already running
    const runningSync = await db
      .prepare(
        `SELECT id FROM sync_metadata WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
      )
      .first<{ id: number }>();

    if (runningSync) {
      return c.json({ error: "A sync is already in progress" }, 409);
    }

    // Create metadata record with 'running' status
    const syncRecord = await db
      .prepare(
        `INSERT INTO sync_metadata (started_at, status, sources_count)
         VALUES (?, 'running', ?)
         RETURNING id`
      )
      .bind(new Date().toISOString(), getAllSources().length)
      .first<{ id: number }>();

    if (!syncRecord) {
      return c.json({ error: "Failed to create sync record" }, 500);
    }

    // Run sync in background using waitUntil
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const apiKey = c.env.OPENAI_API_KEY;
          const model = c.env.OPENAI_MODEL || "gpt-4o-mini";
          const githubToken = c.env.GITHUB_TOKEN;

          if (!apiKey) {
            throw new Error("OPENAI_API_KEY not configured");
          }

          const results = await syncAllSources(db, apiKey, model, githubToken);
          const totals = calculateSyncTotals(results);

          await db
            .prepare(
              `UPDATE sync_metadata
             SET completed_at = ?, status = 'completed',
                 questions_inserted = ?, questions_updated = ?
             WHERE id = ?`
            )
            .bind(
              new Date().toISOString(),
              totals.inserted,
              totals.updated,
              syncRecord.id
            )
            .run();

          console.log(`Sync job ${syncRecord.id} completed successfully`);
        } catch (error) {
          console.error(`Sync job ${syncRecord.id} failed:`, error);

          await db
            .prepare(
              `UPDATE sync_metadata
             SET completed_at = ?, status = 'failed', error_message = ?
             WHERE id = ?`
            )
            .bind(
              new Date().toISOString(),
              error instanceof Error ? error.message : "Unknown error",
              syncRecord.id
            )
            .run();
        }
      })()
    );

    return c.json({
      success: true,
      message: "Sync started",
      syncId: syncRecord.id,
    });
  } catch (error) {
    console.error("Sync trigger error:", error);
    return c.json(
      {
        error: "Failed to trigger sync",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * GET /api/sync/status
 * Get current sync status and question count
 */
app.get("/api/sync/status", async (c) => {
  try {
    const db = c.env.DB;

    // Get total question count
    const countResult = await db
      .prepare("SELECT COUNT(*) as count FROM questions")
      .first<{ count: number }>();

    // Get last successful sync from metadata
    const lastSync = await db
      .prepare(
        `SELECT completed_at, questions_inserted, questions_updated, status
         FROM sync_metadata
         WHERE status = 'completed'
         ORDER BY completed_at DESC
         LIMIT 1`
      )
      .first<{
        completed_at: string;
        questions_inserted: number;
        questions_updated: number;
        status: string;
      }>();

    // Check if a sync is currently running
    const runningSync = await db
      .prepare(
        `SELECT started_at
         FROM sync_metadata
         WHERE status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .first<{ started_at: string }>();

    return c.json({
      totalQuestions: countResult?.count || 0,
      lastSync: lastSync
        ? {
            timestamp: lastSync.completed_at,
            inserted: lastSync.questions_inserted,
            updated: lastSync.questions_updated,
          }
        : null,
      isRunning: !!runningSync,
      runningSince: runningSync?.started_at || null,
    });
  } catch (error) {
    console.error("Status error:", error);
    return c.json({ error: "Failed to get sync status" }, 500);
  }
});

/**
 * GET /api/sync/history
 * Get recent sync history
 */
app.get("/api/sync/history", async (c) => {
  try {
    const db = c.env.DB;

    const history = await db
      .prepare(
        `SELECT *
         FROM sync_metadata
         ORDER BY started_at DESC
         LIMIT 10`
      )
      .all();

    return c.json({
      history: history.results || [],
    });
  } catch (error) {
    console.error("History error:", error);
    return c.json({ error: "Failed to get sync history" }, 500);
  }
});

export default app;
