/**
 * Admin utilities
 * Helpers for admin access control and verification
 */

import { cookies } from "next/headers";
import { getCurrentUser, type User } from "./users";

/**
 * Get current user for server components
 * This version properly handles cookies in Next.js server components
 */
async function getCurrentUserServer(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(
      process.env.SESSION_COOKIE_NAME || "anki_session"
    );

    if (!sessionCookie) {
      return null;
    }

    const apiUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";
    const response = await fetch(`${apiUrl}/api/users/me`, {
      headers: {
        Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { user: User };
    return data.user;
  } catch (error) {
    console.error("Get current user error:", error);
    return null;
  }
}

/**
 * Check if current user is an admin
 * @returns True if user is admin, false otherwise
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUserServer();
    console.log("user", user);
    // Handle both boolean and number (SQLite stores booleans as 0/1)
    return !!user?.is_admin;
  } catch {
    return false;
  }
}

/**
 * Get current user and verify admin status
 * @returns User object if admin, null otherwise
 */
export async function getAdminUser(): Promise<User | null> {
  try {
    const user = await getCurrentUserServer();
    if (!user) return null;
    // Handle both boolean and number (SQLite stores booleans as 0/1)
    if (user.is_admin) {
      return user;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Require admin access - throws error if not admin
 * Use this in server components to enforce admin-only access
 */
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}
