/**
 * Test Helper Functions
 * Utilities for creating test data and tokens
 */

import { SignJWT } from "jose";

/**
 * Create a JWT session token for testing
 * @param userId - User ID
 * @param email - User email
 * @param name - User name
 * @param isAdmin - Whether user is admin (default: false)
 * @returns JWT token string
 */
export async function createTestToken(
  userId: string,
  email: string,
  name: string,
  isAdmin: boolean = false
): Promise<string> {
  const sessionSecret =
    process.env.SESSION_SECRET || "test-secret-key-min-32-chars-long";
  const secret = new TextEncoder().encode(sessionSecret);

  const token = await new SignJWT({ userId, email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7 days
    .sign(secret);

  return token;
}

/**
 * Create test admin and user tokens
 * @returns Object with adminToken and userToken
 */
export async function createTestTokens(): Promise<{
  adminToken: string;
  adminUserId: string;
  userToken: string;
  regularUserId: string;
  user2Token: string;
  user2Id: string;
}> {
  // Create admin user token
  const adminUserId = "c5996861-8575-4437-9e90-69c9abe26b74";
  const adminToken = await createTestToken(
    adminUserId,
    "admin@test.com",
    "Admin User",
    true
  );

  // Create regular user token
  const regularUserId = "1";
  const userToken = await createTestToken(
    regularUserId,
    "user@test.com",
    "Regular User",
    false
  );

  // Create second user token for data isolation tests
  const user2Id = "1";
  const user2Token = await createTestToken(
    user2Id,
    "user2@test.com",
    "User Two",
    false
  );

  return {
    adminToken,
    adminUserId,
    userToken,
    regularUserId,
    user2Token,
    user2Id,
  };
}

/**
 * Create test users in database
 * @param db - D1 Database instance
 * @param tokens - Token information from createTestTokens
 */
export async function createTestUsers(
  db: D1Database,
  tokens: {
    adminUserId: string;
    regularUserId: string;
    user2Id: string;
  }
): Promise<void> {
  const now = new Date().toISOString();

  // Create admin user
  await db
    .prepare(
      `INSERT OR REPLACE INTO users (id, email, name, is_admin, created_at, last_login_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .bind(tokens.adminUserId, "admin@test.com", "Admin User", now, now)
    .run();

  // Create regular user
  await db
    .prepare(
      `INSERT OR REPLACE INTO users (id, email, name, is_admin, created_at, last_login_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .bind(tokens.regularUserId, "user@test.com", "Regular User", now, now)
    .run();

  // Create second user
  await db
    .prepare(
      `INSERT OR REPLACE INTO users (id, email, name, is_admin, created_at, last_login_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .bind(tokens.user2Id, "user2@test.com", "User Two", now, now)
    .run();
}

/**
 * Create a test question
 * @param db - D1 Database instance
 * @param questionText - Question text
 * @param answerText - Answer text
 * @param source - Source URL
 * @returns Question ID
 */
export async function createTestQuestion(
  db: D1Database,
  questionText: string = "What is a closure in JavaScript?",
  answerText: string = "A closure is a function that has access to variables in its outer scope.",
  source: string = "test-source"
): Promise<string> {
  const questionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO questions (id, question_text, answer_text, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(questionId, questionText, answerText, source, now, now)
    .run();

  return questionId;
}

/**
 * Clean up test data
 * @param db - D1 Database instance
 * @param userIds - Array of user IDs to delete
 */
export async function cleanupTestData(
  db: D1Database,
  userIds: string[]
): Promise<void> {
  for (const userId of userIds) {
    // Delete answer logs
    await db
      .prepare("DELETE FROM answer_logs WHERE user_id = ?")
      .bind(userId)
      .run();

    // Delete user question stats
    await db
      .prepare("DELETE FROM user_question_stats WHERE user_id = ?")
      .bind(userId)
      .run();

    // Delete user
    await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  }
}

/**
 * Create test answer log
 * @param db - D1 Database instance
 * @param userId - User ID
 * @param questionId - Question ID
 * @param difficulty - Difficulty rating
 */
export async function createTestAnswerLog(
  db: D1Database,
  userId: string,
  questionId: string,
  difficulty: "easy" | "medium" | "hard"
): Promise<void> {
  const now = new Date().toISOString();

  // Insert answer log
  await db
    .prepare(
      `INSERT INTO answer_logs (user_id, question_id, difficulty, answered_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(userId, questionId, difficulty, now)
    .run();

  // Update user question stats
  await db
    .prepare(
      `INSERT INTO user_question_stats (user_id, question_id, last_answered_at, last_difficulty, answer_count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         last_answered_at = excluded.last_answered_at,
         last_difficulty = excluded.last_difficulty,
         answer_count = answer_count + 1`
    )
    .bind(userId, questionId, now, difficulty)
    .run();
}
