/**
 * Cloudflare Workers backend for Anki Interview App
 * Provides API endpoints for database operations
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
  DB: D1Database;
  APP_USERNAME: string;
  APP_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

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

export default app;
