/**
 * Authentication middleware for JWT verification and user context
 */

import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";

// User context interface
export interface UserContext {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

// Session payload interface (from JWT)
interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

// Extended context with user
export interface AuthContext {
  user: UserContext;
}

/**
 * Verify JWT token and return decoded payload
 */
async function verifyToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as SessionPayload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

/**
 * Fetch user data from database including admin status
 */
async function fetchUser(
  db: D1Database,
  userId: string
): Promise<UserContext | null> {
  try {
    const result = await db
      .prepare(
        `SELECT id, email, name, is_admin
         FROM users
         WHERE id = ?`
      )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        name: string;
        is_admin: number;
      }>();

    if (!result) {
      return null;
    }

    return {
      userId: result.id,
      email: result.email,
      name: result.name,
      isAdmin: result.is_admin === 1,
    };
  } catch (error) {
    console.error("Failed to fetch user from database:", error);
    return null;
  }
}

/**
 * Authentication middleware
 * Verifies JWT token from cookie and attaches user context to request
 */
export async function authMiddleware(c: Context, next: Next) {
  const cookieName = "anki_session"; // Should match frontend SESSION_COOKIE_NAME
  const sessionSecret = c.env.SESSION_SECRET;

  if (!sessionSecret) {
    console.error("SESSION_SECRET not configured");
    return c.json({ error: "Authentication not configured" }, 500);
  }

  // Get token from cookie
  const token = getCookie(c, cookieName);
  console.log("token", token);
  if (!token) {
    return c.json({ error: "Unauthorized - No session token" }, 401);
  }
  // Verify JWT token
  const payload = await verifyToken(token, sessionSecret);

  if (!payload) {
    return c.json({ error: "Unauthorized - Invalid or expired token" }, 401);
  }

  // Fetch user from database (including admin status)
  const user = await fetchUser(c.env.DB, payload.userId);

  if (!user) {
    return c.json({ error: "Unauthorized - User not found" }, 401);
  }

  console.log("user", user);
  // Attach user context to request
  c.set("user", user);

  await next();
}

/**
 * Admin-only middleware
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get("user") as UserContext | undefined;
  console.log("adminuser", user);

  if (!user) {
    return c.json({ error: "Unauthorized - Authentication required" }, 401);
  }

  if (!user.isAdmin) {
    return c.json({ error: "Forbidden - Admin access required" }, 403);
  }

  await next();
}

/**
 * Optional authentication middleware
 * Attaches user context if token is present, but doesn't require it
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const cookieName = "anki_session";
  const sessionSecret = c.env.SESSION_SECRET;

  if (!sessionSecret) {
    await next();
    return;
  }

  const token = getCookie(c, cookieName);

  if (token) {
    const payload = await verifyToken(token, sessionSecret);

    if (payload) {
      const user = await fetchUser(c.env.DB, payload.userId);
      if (user) {
        c.set("user", user);
      }
    }
  }

  await next();
}
