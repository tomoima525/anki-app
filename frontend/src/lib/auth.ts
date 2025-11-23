import bcrypt from "bcryptjs";

// Environment helpers
function getEnv() {
  // Decode base64-encoded password hash if APP_PASSWORD_HASH_B64 is set
  // This allows special characters (dots, dollar signs) in bcrypt hashes to be stored safely

  // Decode base64-encoded hash
  const passwordHash = Buffer.from(
    process.env.APP_PASSWORD_HASH_B64!,
    "base64"
  ).toString("utf-8");
  console.log("passwordHash", passwordHash);
  return {
    username: process.env.APP_USERNAME!,
    passwordHash,
    sessionSecret: process.env.SESSION_SECRET!,
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || "604800", 10),
    cookieName: process.env.SESSION_COOKIE_NAME || "anki_session",
  };
}

// Verify login credentials
export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const env = getEnv();

  if (username !== env.username) {
    return false;
  }
  console.log(password, env.passwordHash);
  return await bcrypt.compare(password, env.passwordHash);
}

// Re-export session functions for convenience (API routes can import from either location)
export { createSession, getSessionCookieConfig } from "./session";
