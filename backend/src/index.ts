/**
 * Cloudflare Workers backend for Anki Interview App
 * Provides API endpoints for database operations
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie } from "hono/cookie";
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
import {
  authMiddleware,
  adminMiddleware,
  type UserContext,
} from "./middleware/auth";
import usersRouter from "./routes/users";
import { fetchMarkdownFromGitHub } from "./lib/github";
import {
  parseQuestionsInChunks,
  hasPrewrittenAnswersWithAI,
  parsePrewrittenQA,
} from "./lib/openai-parser";
import { batchUpsertQuestions } from "./lib/questions";
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

type Bindings = {
  DB: D1Database;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
};

type Variables = {
  user: UserContext;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Enable CORS for frontend
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // List of allowed origins
      const allowedOrigins = [
        "http://localhost:3000",
        "https://anki-app-frontend.vercel.app",
      ];

      // If origin header is present, validate it
      if (origin) {
        // Allow localhost with any port for development
        if (origin.startsWith("http://localhost:")) {
          return origin;
        }
        // Allow all HTTPS origins (for production)
        // This is safe because we validate redirect URLs in /set-session
        if (origin.startsWith("https://")) {
          return origin;
        }
        // Check against allowed origins
        if (allowedOrigins.includes(origin)) {
          return origin;
        }
      }

      return "https://anki-app-frontend.vercel.app"; // allow only the frontend origin
    },
    allowHeaders: [
      "Origin",
      "Content-Type",
      "Authorization",
      "X-Custom-Header",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Mount user routes
app.route("/api/users", usersRouter);

// Session setup endpoint for cross-origin cookie setting
/**
 * GET /api/auth/set-session
 * Sets the session cookie when browser visits directly
 * This is needed because cookies set in server-to-server calls don't reach the browser
 *
 * Query params:
 * - token: JWT session token
 * - redirect: URL to redirect to after setting cookie (must be an allowed origin)
 */
app.get("/api/auth/set-session", async (c) => {
  try {
    const token = c.req.query("token");
    const redirectUrl = c.req.query("redirect");

    if (!token) {
      return c.json({ error: "Missing token parameter" }, 400);
    }

    // Verify the token is valid before setting cookie
    const sessionSecret = c.env.SESSION_SECRET;
    if (!sessionSecret) {
      return c.json({ error: "Session configuration error" }, 500);
    }

    // Verify JWT token
    try {
      const secretKey = new TextEncoder().encode(sessionSecret);
      const { jwtVerify } = await import("jose");
      await jwtVerify(token, secretKey);
    } catch (error) {
      console.error("Invalid token in set-session:", error);
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // Detect if this is local development
    const url = c.req.url;
    const isLocalDev = url.includes("localhost") || url.includes("127.0.0.1");

    // Set the session cookie using Hono's setCookie
    const cookieOptions = isLocalDev
      ? {
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
          maxAge: 604800,
          path: "/",
        }
      : {
          httpOnly: true,
          secure: true,
          sameSite: "None" as const,
          maxAge: 604800,
          path: "/",
        };

    setCookie(c, "anki_session", token, cookieOptions);

    // Log the actual Set-Cookie header that will be sent
    const setCookieHeader = c.res.headers.get("Set-Cookie");
    console.log("Session cookie set via direct browser visit:", {
      url: c.req.url,
      isLocalDev,
      cookieOptions,
      redirectUrl,
      setCookieHeader, // This shows the actual header being sent
      origin: c.req.header("origin"),
      referer: c.req.header("referer"),
      userAgent: c.req.header("user-agent"),
      // Also log the CORS header that will be sent
      corsAllowOrigin: c.res.headers.get("Access-Control-Allow-Origin"),
    });

    // Redirect to the specified URL or return success
    if (redirectUrl) {
      // Validate redirect URL is from allowed origins
      const allowedOrigins = [
        "http://localhost:3000",
        "https://anki-app-frontend.vercel.app",
      ];

      try {
        const parsedRedirect = new URL(redirectUrl);
        const isAllowed = allowedOrigins.some(
          (origin) =>
            parsedRedirect.origin === origin ||
            parsedRedirect.origin.startsWith("http://localhost:")
        );

        if (!isAllowed) {
          console.warn("Redirect URL not in allowed origins:", redirectUrl);
          return c.json({ error: "Invalid redirect URL" }, 400);
        }

        return c.redirect(redirectUrl);
      } catch {
        return c.json({ error: "Invalid redirect URL format" }, 400);
      }
    }

    return c.json({
      success: true,
      message: "Session cookie set",
      debug: {
        cookieOptions,
        setCookieHeader,
        url: c.req.url,
      },
    });
  } catch (error) {
    console.error("Set session error:", error);
    return c.json({ error: "Failed to set session" }, 500);
  }
});

// Logout endpoint
/**
 * POST /api/auth/logout
 * Clear session cookie to log out user
 */
app.post("/api/auth/logout", async (c) => {
  try {
    // Clear the session cookie by setting it with an expired date
    c.header(
      "Set-Cookie",
      `anki_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`
    );

    return c.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Failed to logout" }, 500);
  }
});

// Study endpoints

/**
 * GET /api/study/sources
 * Get list of available sources
 * Requires authentication
 */
app.get("/api/study/sources", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;

    const result = await db
      .prepare(
        `SELECT DISTINCT source_name
         FROM questions
         WHERE source_name IS NOT NULL
         ORDER BY source_name`
      )
      .all<{ source_name: string }>();

    return c.json({
      sources: result.results || [],
    });
  } catch (error) {
    console.error("Get sources error:", error);
    return c.json({ error: "Failed to get sources" }, 500);
  }
});

/**
 * POST /api/study/next
 * Get a random question (without answer)
 * Accepts optional 'source_name' query parameter to filter by source name
 * Requires authentication
 */
app.post("/api/study/next", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const sourceName = c.req.query("source_name");

    // Build query based on whether source_name filter is provided
    let query = `SELECT id, question_text, source, source_name FROM questions`;
    const bindings: string[] = [];

    if (sourceName) {
      query += ` WHERE source_name = ?`;
      bindings.push(sourceName);
    }

    query += ` ORDER BY RANDOM() LIMIT 1`;

    const question = await db
      .prepare(query)
      .bind(...bindings)
      .first<{
        id: string;
        question_text: string;
        source: string;
        source_name: string;
      }>();

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
      source_name: question.source_name,
    });
  } catch (error) {
    console.error("Get next question error:", error);
    return c.json({ error: "Failed to get next question" }, 500);
  }
});

/**
 * GET /api/study/:id
 * Get a specific question with answer
 * Requires authentication
 */
app.get("/api/study/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.env.DB;

    const question = await db
      .prepare(
        `SELECT id, question_text, answer_text, source, source_name
         FROM questions
         WHERE id = ?`
      )
      .bind(id)
      .first<{
        id: string;
        question_text: string;
        answer_text: string;
        source: string;
        source_name: string;
      }>();

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    return c.json({
      id: question.id,
      question: question.question_text,
      answer: question.answer_text,
      source: question.source,
      source_name: question.source_name,
    });
  } catch (error) {
    console.error("Get question error:", error);
    return c.json({ error: "Failed to get question" }, 500);
  }
});

/**
 * POST /api/study/:id/answer
 * Submit answer with difficulty rating
 * Requires authentication
 */
app.post("/api/study/:id/answer", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{ difficulty: string }>();
    const { difficulty } = body;
    const user = c.get("user");

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
      // Insert into answer_logs with user_id
      db
        .prepare(
          `INSERT INTO answer_logs (user_id, question_id, difficulty, answered_at)
         VALUES (?, ?, ?, ?)`
        )
        .bind(user.userId, id, difficulty, now),

      // Upsert user_question_stats (per-user statistics)
      db
        .prepare(
          `INSERT INTO user_question_stats (user_id, question_id, last_answered_at, last_difficulty, answer_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           last_answered_at = excluded.last_answered_at,
           last_difficulty = excluded.last_difficulty,
           answer_count = answer_count + 1`
        )
        .bind(user.userId, id, now, difficulty),
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
 * Requires authentication
 */
app.get("/api/questions/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  try {
    const db = c.env.DB;

    // Total questions (shared across all users)
    const totalResult = await db
      .prepare("SELECT COUNT(*) as count FROM questions")
      .first<{ count: number }>();

    // Answered questions by this user
    const answeredResult = await db
      .prepare(
        `SELECT COUNT(DISTINCT question_id) as count
         FROM user_question_stats
         WHERE user_id = ?`
      )
      .bind(user.userId)
      .first<{ count: number }>();

    // Difficulty distribution for this user
    const difficultyResult = await db
      .prepare(
        `SELECT last_difficulty, COUNT(*) as count
         FROM user_question_stats
         WHERE user_id = ? AND last_difficulty IS NOT NULL
         GROUP BY last_difficulty`
      )
      .bind(user.userId)
      .all<{ last_difficulty: string; count: number }>();

    // Recent activity (last 7 days) for this user
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityResult = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM answer_logs
         WHERE user_id = ? AND answered_at > ?`
      )
      .bind(user.userId, sevenDaysAgo.toISOString())
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
 * Requires authentication
 */
app.get("/api/questions/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.env.DB;
    const user = c.get("user");

    // Get question
    const question = await db
      .prepare("SELECT * FROM questions WHERE id = ?")
      .bind(id)
      .first();

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    // Get recent answer logs for this user
    const logs = await db
      .prepare(
        `SELECT * FROM answer_logs
         WHERE question_id = ? AND user_id = ?
         ORDER BY answered_at DESC
         LIMIT 20`
      )
      .bind(id, user.userId)
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
 * Requires admin access
 */
app.delete("/api/questions/:id", authMiddleware, adminMiddleware, async (c) => {
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

    // Delete related data first, then question (order matters due to foreign key constraints)
    const deleteFromAnswerLogs = db
      .prepare(`DELETE FROM answer_logs WHERE question_id = ?`)
      .bind(id);
    const deleteFromUserQuestionStats = db
      .prepare(`DELETE FROM user_question_stats WHERE question_id = ?`)
      .bind(id);
    const deleteFromQuestions = db
      .prepare(`DELETE FROM questions WHERE id = ?`)
      .bind(id);

    // Use batch for atomic deletion - all succeed or all fail
    const results = await db.batch([
      deleteFromAnswerLogs,
      deleteFromUserQuestionStats,
      deleteFromQuestions,
    ]);

    // Verify deletion succeeded (questions deletion is at index 2)
    const questionDeleteResult = results[2];
    if (questionDeleteResult.meta.changes === 0) {
      return c.json(
        { error: "Failed to delete question", success: false },
        500
      );
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
 * Shows shared question pool with optional user-specific stats
 * Requires authentication
 */
app.get("/api/questions", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");

    // Parse query parameters
    const difficulty = c.req.query("difficulty"); // 'easy' | 'medium' | 'hard'
    const sort = c.req.query("sort") || "newest";
    const search = c.req.query("search");
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // Build query - join with user_question_stats to get user-specific data
    let query = `
      SELECT
        q.*,
        uqs.last_answered_at,
        uqs.last_difficulty,
        uqs.answer_count
      FROM questions q
      LEFT JOIN user_question_stats uqs
        ON q.id = uqs.question_id AND uqs.user_id = ?
      WHERE 1=1
    `;
    const bindings: any[] = [user.userId];

    // Filter by difficulty (user's last difficulty)
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      query += " AND uqs.last_difficulty = ?";
      bindings.push(difficulty);
    }

    // Search in question text
    if (search) {
      query += " AND q.question_text LIKE ?";
      bindings.push(`%${search}%`);
    }

    // Sort
    switch (sort) {
      case "recent":
        // Recently answered by this user
        query += " ORDER BY uqs.last_answered_at DESC NULLS LAST";
        break;
      case "oldest":
        // Oldest answered by this user
        query += " ORDER BY uqs.last_answered_at ASC NULLS FIRST";
        break;
      case "most_answered":
        // Most answered by this user
        query += " ORDER BY COALESCE(uqs.answer_count, 0) DESC";
        break;
      case "least_answered":
        // Least answered by this user (including never answered)
        query += " ORDER BY COALESCE(uqs.answer_count, 0) ASC";
        break;
      case "newest":
        // Newest questions added to pool
        query += " ORDER BY q.created_at DESC";
        break;
      case "oldest_created":
        // Oldest questions in pool
        query += " ORDER BY q.created_at ASC";
        break;
      default:
        query += " ORDER BY q.created_at DESC";
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
    let countQuery = `
      SELECT COUNT(*) as count
      FROM questions q
      LEFT JOIN user_question_stats uqs
        ON q.id = uqs.question_id AND uqs.user_id = ?
      WHERE 1=1
    `;
    const countBindings: any[] = [user.userId];

    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      countQuery += " AND uqs.last_difficulty = ?";
      countBindings.push(difficulty);
    }

    if (search) {
      countQuery += " AND q.question_text LIKE ?";
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
 * Requires authentication - returns user-specific stats
 */
app.get("/api/dashboard/daily-stats", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const date = c.req.query("date"); // Optional ISO date string

    const dailyStats = await getDailyStats(db, user.userId, date);
    const averages = await getAverages(db, user.userId);
    const yesterdayStats = await getYesterdayStats(db, user.userId);

    // Calculate estimated study time (rough estimate based on timestamps)
    let estimatedStudyTimeMinutes = 0;
    if (dailyStats.first_answer_at && dailyStats.last_answer_at) {
      const firstTime = new Date(dailyStats.first_answer_at).getTime();
      const lastTime = new Date(dailyStats.last_answer_at).getTime();
      estimatedStudyTimeMinutes = Math.round(
        (lastTime - firstTime) / (1000 * 60)
      );
    }

    // Calculate comparisons
    const vsDailyAvg =
      averages.daily_avg > 0
        ? Math.round(
            ((dailyStats.total_answers - averages.daily_avg) /
              averages.daily_avg) *
              100
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
 * Requires authentication - returns user-specific activity
 */
app.get("/api/dashboard/activity-trend", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const range = c.req.query("range") || "7d";

    // Parse range to days
    let days = 7;
    if (range === "30d") days = 30;
    else if (range === "90d") days = 90;

    const data = await getActivityTrend(db, user.userId, days);

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
 * Requires authentication - returns user-specific progress
 */
app.get("/api/dashboard/mastery-progress", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const progress = await getMasteryProgress(db, user.userId);

    return c.json(progress);
  } catch (error) {
    console.error("Get mastery progress error:", error);
    return c.json({ error: "Failed to get mastery progress" }, 500);
  }
});

/**
 * GET /api/dashboard/study-streak
 * Calculate current and historical study streaks
 * Requires authentication - returns user-specific streak
 */
app.get("/api/dashboard/study-streak", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const streak = await getStudyStreak(db, user.userId);

    return c.json(streak);
  } catch (error) {
    console.error("Get study streak error:", error);
    return c.json({ error: "Failed to get study streak" }, 500);
  }
});

/**
 * GET /api/dashboard/review-queue
 * Get questions that need review
 * Requires authentication - returns user-specific review queue
 */
app.get("/api/dashboard/review-queue", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const daysThreshold = parseInt(c.req.query("days_threshold") || "7", 10);

    const questions = await getReviewQueue(
      db,
      user.userId,
      limit,
      daysThreshold
    );

    // Get total count of questions needing review for this user
    const totalCountResult = await db
      .prepare(
        `SELECT COUNT(*) as count
        FROM user_question_stats
        WHERE user_id = ?
          AND answer_count > 0
          AND (
            last_difficulty = 'hard' OR
            JULIANDAY('now') - JULIANDAY(last_answered_at) > ?
          )`
      )
      .bind(user.userId, daysThreshold)
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
 * Requires authentication - returns user-specific heatmap
 */
app.get("/api/dashboard/heatmap", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const range = c.req.query("range") || "30d";

    // Parse range to days
    let days = 30;
    if (range === "90d") days = 90;
    else if (range === "1y") days = 365;

    const data = await getHeatmapData(db, user.userId, days);

    return c.json({
      range,
      data,
    });
  } catch (error) {
    console.error("Get heatmap data error:", error);
    return c.json({ error: "Failed to get heatmap data" }, 500);
  }
});

// GitHub Sync endpoint

/**
 * POST /api/sync/github
 * Sync questions from configured GitHub sources
 * Requires admin access
 */
app.post("/api/sync/github", authMiddleware, adminMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const githubToken = c.env.GITHUB_TOKEN;
    const apiKey = c.env.OPENAI_API_KEY;
    const model = c.env.OPENAI_MODEL || "gpt-4o-mini";
    const user = c.get("user");

    if (!apiKey) {
      return c.json({ error: "OpenAI API key not configured" }, 500);
    }

    if (!githubToken) {
      return c.json({ error: "GitHub token not configured" }, 500);
    }

    // Get all configured sources
    const sources = getAllSources();

    if (sources.length === 0) {
      return c.json({ error: "No sources configured" }, 400);
    }

    const results = [];

    for (const source of sources) {
      try {
        // 1. Fetch markdown
        const { content } = await fetchMarkdownFromGitHub(
          source.url,
          githubToken
        );

        // 2. Check if document has pre-written answers using AI
        const hasAnswers = await hasPrewrittenAnswersWithAI(
          content,
          apiKey,
          model
        );
        let questions;

        if (hasAnswers) {
          // Parse Q&A directly from markdown with LLM
          questions = await parsePrewrittenQA(content, apiKey, model);
        } else {
          // Parse with OpenAI
          questions = await parseQuestionsInChunks(content, apiKey, model);
        }

        // 3. Upsert to database
        const upsertResult = await batchUpsertQuestions(
          db,
          questions,
          source.url
        );

        results.push({
          source: source.name,
          ...upsertResult,
        });
      } catch (error) {
        console.error(`Error syncing ${source.name}:`, error);
        results.push({
          source: source.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return c.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("GitHub sync error:", error);
    return c.json({ error: "Failed to sync questions from GitHub" }, 500);
  }
});

export default app;
