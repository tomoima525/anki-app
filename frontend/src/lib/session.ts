import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  iat: number; // Issued at
  exp: number; // Expiration
}

// Environment helpers
function getEnv() {
  return {
    sessionSecret: process.env.SESSION_SECRET!,
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || "604800", 10),
    cookieName: process.env.SESSION_COOKIE_NAME || "anki_session",
  };
}

// Create session token
export async function createSession(
  userId: string,
  email: string,
  name: string
): Promise<string> {
  const env = getEnv();
  const secret = new TextEncoder().encode(env.sessionSecret);

  const token = await new SignJWT({ userId, email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.sessionMaxAge}s`)
    .sign(secret);

  return token;
}

// Verify session token
export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const env = getEnv();
    const secret = new TextEncoder().encode(env.sessionSecret);

    const { payload } = await jwtVerify(token, secret);

    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}

// Get session cookie configuration
export function getSessionCookieConfig() {
  const env = getEnv();

  return {
    name: env.cookieName,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: env.sessionMaxAge,
      path: "/",
    },
  };
}

// Get current session from cookies
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const env = getEnv();
  const token = cookieStore.get(env.cookieName)?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}
