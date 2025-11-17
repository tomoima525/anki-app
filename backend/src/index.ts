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

export default app;
