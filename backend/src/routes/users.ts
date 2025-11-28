/**
 * User management API routes
 * Handles user CRUD operations and profile management
 */

import { Hono } from "hono";
import { SignJWT } from "jose";
import { authMiddleware, adminMiddleware } from "../middleware/auth";

type Bindings = {
  DB: D1Database;
  SESSION_SECRET: string;
};

type Variables = {
  user: {
    userId: string;
    email: string;
    name: string;
    isAdmin: boolean;
  };
};

const users = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Helper: Create JWT session token
 */
async function createSessionToken(
  userId: string,
  email: string,
  name: string,
  secret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  const maxAge = 604800; // 7 days in seconds

  const token = await new SignJWT({ userId, email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey);

  return token;
}

/**
 * POST /api/users
 * Create a new user from Google OAuth data
 * This endpoint is called by the frontend during OAuth callback
 */
users.post("/", async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json<{
      id?: string;
      email: string;
      name: string;
      picture?: string;
      googleId?: string;
    }>();

    const { email, name, picture, googleId } = body;

    // Validate required fields
    if (!email || !name) {
      return c.json({ error: "Missing required fields: email, name" }, 400);
    }

    const now = new Date().toISOString();

    // Check if user already exists (by email or google_id)
    const existingUser = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users WHERE email = ? OR (google_id IS NOT NULL AND google_id = ?)`
      )
      .bind(email, googleId || null)
      .first();

    if (existingUser) {
      // Update last login time and return existing user
      await db
        .prepare(
          `UPDATE users
           SET last_login_at = ?, name = ?, picture = ?
           WHERE id = ?`
        )
        .bind(now, name, picture || null, existingUser.id)
        .run();

      const updatedUser = await db
        .prepare(
          `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
           FROM users WHERE id = ?`
        )
        .bind(existingUser.id)
        .first();

      // Create session token for cross-origin session setup
      const sessionToken = await createSessionToken(
        String(existingUser.id),
        email,
        name,
        c.env.SESSION_SECRET
      );

      console.log("Session token created for existing user:", {
        userId: existingUser.id,
      });

      return c.json({
        user: updatedUser,
        created: false,
        sessionToken, // Token for cross-origin session setup via /api/auth/set-session
      });
    }

    // Generate a new user ID using crypto.randomUUID()
    const userId = crypto.randomUUID();

    // Create new user
    await db
      .prepare(
        `INSERT INTO users (id, email, name, picture, google_id, is_admin, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(userId, email, name, picture || null, googleId || null, now, now)
      .run();

    const newUser = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first();

    // Create session token for cross-origin session setup
    const sessionToken = await createSessionToken(
      userId,
      email,
      name,
      c.env.SESSION_SECRET
    );

    console.log("Session token created for new user:", {
      userId,
    });

    return c.json(
      {
        user: newUser,
        created: true,
        sessionToken, // Token for cross-origin session setup via /api/auth/set-session
      },
      201
    );
  } catch (error) {
    console.error("Create user error:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
});

/**
 * GET /api/users/me
 * Get current authenticated user's profile
 * Requires authentication
 */
users.get("/me", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const currentUser = c.get("user");

    const user = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users WHERE id = ?`
      )
      .bind(currentUser.userId)
      .first();

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Get current user error:", error);
    return c.json({ error: "Failed to get user profile" }, 500);
  }
});

/**
 * PUT /api/users/me
 * Update current authenticated user's profile
 * Requires authentication
 */
users.put("/me", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const currentUser = c.get("user");
    const body = await c.req.json<{
      name?: string;
      picture?: string;
    }>();

    const { name, picture } = body;

    // Validate at least one field to update
    if (!name && !picture) {
      return c.json(
        { error: "At least one field (name or picture) must be provided" },
        400
      );
    }

    // Build dynamic update query
    const updates: string[] = [];
    const bindings: any[] = [];

    if (name) {
      updates.push("name = ?");
      bindings.push(name);
    }
    if (picture !== undefined) {
      updates.push("picture = ?");
      bindings.push(picture);
    }

    bindings.push(currentUser.userId);

    await db
      .prepare(
        `UPDATE users
         SET ${updates.join(", ")}
         WHERE id = ?`
      )
      .bind(...bindings)
      .run();

    // Fetch updated user
    const updatedUser = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users WHERE id = ?`
      )
      .bind(currentUser.userId)
      .first();

    return c.json({ user: updatedUser });
  } catch (error) {
    console.error("Update user error:", error);
    return c.json({ error: "Failed to update user profile" }, 500);
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 * Requires admin access
 */
users.get("/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const userId = c.req.param("id");

    const user = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first();

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Get user by ID error:", error);
    return c.json({ error: "Failed to get user" }, 500);
  }
});

/**
 * GET /api/users
 * List all users (paginated)
 * Requires admin access
 */
users.get("/", authMiddleware, adminMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // Get users
    const usersResult = await db
      .prepare(
        `SELECT id, email, name, picture, google_id, is_admin, created_at, last_login_at
         FROM users
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(limit, offset)
      .all();

    // Get total count
    const countResult = await db
      .prepare("SELECT COUNT(*) as count FROM users")
      .first<{ count: number }>();

    return c.json({
      users: usersResult.results || [],
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        hasMore: offset + limit < (countResult?.count || 0),
      },
    });
  } catch (error) {
    console.error("List users error:", error);
    return c.json({ error: "Failed to list users" }, 500);
  }
});

export default users;
