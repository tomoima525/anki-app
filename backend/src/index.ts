/**
 * Cloudflare Workers backend for Anki Interview App
 * Provides API endpoints for database operations
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getDailyStats,
  getActivityTrend,
  getMasteryProgress,
  getStudyStreak,
  getReviewQueue,
  getHeatmapData,
  getAverages,
  getYesterdayStats,
} from "./lib/dashboard";

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
 * DELETE /api/questions/:id
 * Delete a question and its associated answer logs
 */
app.delete("/api/questions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.env.DB;

    // First check if the question exists
    const question = await db
      .prepare(`SELECT id FROM questions WHERE id = ?`)
      .bind(id)
      .first();

    if (!question) {
      return c.json({ error: "Question not found", success: false }, 404);
    }

    // Delete answer logs first, then question (order matters due to foreign key constraints)
    const deleteFromAnswerLogs = db
      .prepare(`DELETE FROM answer_logs WHERE question_id = ?`)
      .bind(id);
    const deleteFromQuestions = db
      .prepare(`DELETE FROM questions WHERE id = ?`)
      .bind(id);

    // Use batch for atomic deletion - both succeed or both fail
    const results = await db.batch([deleteFromAnswerLogs, deleteFromQuestions]);

    // Verify deletion succeeded
    const questionDeleteResult = results[1];
    if (questionDeleteResult.meta.changes === 0) {
      return c.json({ error: "Failed to delete question", success: false }, 500);
    }

    return c.json(
      {
        success: true,
        message: "Question deleted successfully",
      },
      200
    );
  } catch (error) {
    console.error("Delete failed:", error);
    return c.json({ error: "Failed to delete question", success: false }, 500);
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

// Dashboard endpoints

/**
 * GET /api/dashboard/daily-stats
 * Get comprehensive daily statistics
 */
app.get("/api/dashboard/daily-stats", async (c) => {
  try {
    const db = c.env.DB;
    const date = c.req.query("date"); // Optional ISO date string

    const dailyStats = await getDailyStats(db, date);
    const averages = await getAverages(db);
    const yesterdayStats = await getYesterdayStats(db);

    // Calculate estimated study time (rough estimate based on timestamps)
    let estimatedStudyTimeMinutes = 0;
    if (dailyStats.first_answer_at && dailyStats.last_answer_at) {
      const firstTime = new Date(dailyStats.first_answer_at).getTime();
      const lastTime = new Date(dailyStats.last_answer_at).getTime();
      estimatedStudyTimeMinutes = Math.round((lastTime - firstTime) / (1000 * 60));
    }

    // Calculate comparisons
    const vsDailyAvg =
      averages.daily_avg > 0
        ? Math.round(
            ((dailyStats.total_answers - averages.daily_avg) / averages.daily_avg) * 100
          )
        : 0;
    const vsYesterday = dailyStats.total_answers - yesterdayStats.total_answers;

    return c.json({
      date: date || new Date().toISOString().split("T")[0],
      today: {
        total_answers: dailyStats.total_answers,
        unique_questions: dailyStats.unique_questions,
        easy_count: dailyStats.easy_count,
        medium_count: dailyStats.medium_count,
        hard_count: dailyStats.hard_count,
        first_answer_at: dailyStats.first_answer_at,
        last_answer_at: dailyStats.last_answer_at,
        estimated_study_time_minutes: estimatedStudyTimeMinutes,
      },
      averages: {
        daily_avg: averages.daily_avg,
        weekly_avg: averages.weekly_avg,
      },
      comparison: {
        vs_daily_avg: vsDailyAvg >= 0 ? `+${vsDailyAvg}%` : `${vsDailyAvg}%`,
        vs_yesterday: vsYesterday >= 0 ? `+${vsYesterday}` : `${vsYesterday}`,
      },
    });
  } catch (error) {
    console.error("Get daily stats error:", error);
    return c.json({ error: "Failed to get daily statistics" }, 500);
  }
});

/**
 * GET /api/dashboard/activity-trend
 * Get activity data for time-series visualization
 */
app.get("/api/dashboard/activity-trend", async (c) => {
  try {
    const db = c.env.DB;
    const range = c.req.query("range") || "7d";

    // Parse range to days
    let days = 7;
    if (range === "30d") days = 30;
    else if (range === "90d") days = 90;

    const data = await getActivityTrend(db, days);

    return c.json({
      range,
      data,
    });
  } catch (error) {
    console.error("Get activity trend error:", error);
    return c.json({ error: "Failed to get activity trend" }, 500);
  }
});

/**
 * GET /api/dashboard/mastery-progress
 * Get mastery categorization of all questions
 */
app.get("/api/dashboard/mastery-progress", async (c) => {
  try {
    const db = c.env.DB;
    const progress = await getMasteryProgress(db);

    return c.json(progress);
  } catch (error) {
    console.error("Get mastery progress error:", error);
    return c.json({ error: "Failed to get mastery progress" }, 500);
  }
});

/**
 * GET /api/dashboard/study-streak
 * Calculate current and historical study streaks
 */
app.get("/api/dashboard/study-streak", async (c) => {
  try {
    const db = c.env.DB;
    const streak = await getStudyStreak(db);

    return c.json(streak);
  } catch (error) {
    console.error("Get study streak error:", error);
    return c.json({ error: "Failed to get study streak" }, 500);
  }
});

/**
 * GET /api/dashboard/review-queue
 * Get questions that need review
 */
app.get("/api/dashboard/review-queue", async (c) => {
  try {
    const db = c.env.DB;
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const daysThreshold = parseInt(c.req.query("days_threshold") || "7", 10);

    const questions = await getReviewQueue(db, limit, daysThreshold);

    // Get total count of questions needing review
    const totalCountResult = await db
      .prepare(
        `SELECT COUNT(*) as count
        FROM questions
        WHERE answer_count > 0
          AND (
            last_difficulty = 'hard' OR
            JULIANDAY('now') - JULIANDAY(last_answered_at) > ?
          )`
      )
      .bind(daysThreshold)
      .first<{ count: number }>();

    return c.json({
      questions,
      total_count: totalCountResult?.count || 0,
    });
  } catch (error) {
    console.error("Get review queue error:", error);
    return c.json({ error: "Failed to get review queue" }, 500);
  }
});

/**
 * GET /api/dashboard/heatmap
 * Get activity heatmap data
 */
app.get("/api/dashboard/heatmap", async (c) => {
  try {
    const db = c.env.DB;
    const range = c.req.query("range") || "30d";

    // Parse range to days
    let days = 30;
    if (range === "90d") days = 90;
    else if (range === "1y") days = 365;

    const data = await getHeatmapData(db, days);

    return c.json({
      range,
      data,
    });
  } catch (error) {
    console.error("Get heatmap data error:", error);
    return c.json({ error: "Failed to get heatmap data" }, 500);
  }
});

export default app;
