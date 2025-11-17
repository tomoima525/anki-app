import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcrypt';

interface SessionPayload {
  username: string;
  iat: number; // Issued at
  exp: number; // Expiration
}

// Environment helpers
function getEnv() {
  return {
    username: process.env.APP_USERNAME!,
    passwordHash: process.env.APP_PASSWORD_HASH!,
    sessionSecret: process.env.SESSION_SECRET!,
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '604800', 10),
    cookieName: process.env.SESSION_COOKIE_NAME || 'anki_session',
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

  return await bcrypt.compare(password, env.passwordHash);
}

// Create session token
export async function createSession(username: string): Promise<string> {
  const env = getEnv();
  const secret = new TextEncoder().encode(env.sessionSecret);

  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.sessionMaxAge}s`)
    .sign(secret);

  return token;
}

// Verify session token
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const env = getEnv();
    const secret = new TextEncoder().encode(env.sessionSecret);

    const { payload } = await jwtVerify(token, secret);

    return payload as SessionPayload;
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: env.sessionMaxAge,
      path: '/',
    },
  };
}
