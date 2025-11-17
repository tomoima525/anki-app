# Authentication Implementation Spec

## Overview

Implement single-user authentication using environment variables, session cookies, and middleware protection for all routes.

## Prerequisites

- Next.js App Router configured
- Environment variables support (Cloudflare)
- Database setup completed

## Security Requirements

- Username/password stored in environment variables
- Password hashed using bcrypt
- Session managed via signed JWT tokens
- HTTP-only secure cookies
- All routes protected except login
- CSRF protection considered

## Implementation Tasks

### 1. Environment Configuration

#### 1.1 Define environment variables

**Location:** `.env.local` (for development)

```env
# Auth credentials
APP_USERNAME=admin
APP_PASSWORD_HASH=$2b$10$... # bcrypt hash of your password
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars

# Session configuration
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800 # 7 days in seconds
```

**Tasks:**

- [ ] Create `.env.local` file
- [ ] Generate strong SESSION_SECRET (min 32 characters)
- [ ] Hash password using bcrypt
- [ ] Add `.env.local` to `.gitignore`

**Password hashing helper:**

```bash
# Use this Node.js script to generate password hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(console.log);"
```

#### 1.2 Configure Cloudflare environment variables

**Location:** Cloudflare dashboard or wrangler

```bash
# Set production secrets
npx wrangler secret put APP_USERNAME
npx wrangler secret put APP_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

**Acceptance Criteria:**

- [ ] Development env vars configured
- [ ] Production secrets set in Cloudflare
- [ ] Secrets not committed to git

### 2. Session Management

#### 2.1 Create session utilities

**Location:** `/src/lib/auth.ts`

```typescript
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcrypt";

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

  return await bcrypt.compare(password, env.passwordHash);
}

// Create session token
export async function createSession(username: string): Promise<string> {
  const env = getEnv();
  const secret = new TextEncoder().encode(env.sessionSecret);

  const token = await new SignJWT({ username })
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: env.sessionMaxAge,
      path: "/",
    },
  };
}
```

**Dependencies to install:**

```bash
npm install jose bcrypt
npm install -D @types/bcrypt
```

**Acceptance Criteria:**

- [ ] Session creation function implemented
- [ ] Session verification function implemented
- [ ] Credential verification using bcrypt
- [ ] Proper TypeScript types
- [ ] Cookie configuration helper

#### 2.2 Create session helper for route handlers

**Location:** `/src/lib/session.ts`

```typescript
import { cookies } from "next/headers";
import { verifySession, getSessionCookieConfig } from "./auth";

export async function getSession() {
  const cookieStore = cookies();
  const { name } = getSessionCookieConfig();
  const token = cookieStore.get(name)?.value;

  if (!token) {
    return null;
  }

  return await verifySession(token);
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}
```

**Acceptance Criteria:**

- [ ] Can retrieve session from cookies
- [ ] Session verification integrated
- [ ] Helper for requiring authentication

### 3. Authentication API Routes

#### 3.1 Login endpoint

**Location:** `/src/app/api/login/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
  getSessionCookieConfig,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    // Verify credentials
    const isValid = await verifyCredentials(username, password);

    if (!isValid) {
      // Add delay to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session
    const token = await createSession(username);
    const { name, options } = getSessionCookieConfig();

    // Create response with cookie
    const response = NextResponse.json({ success: true }, { status: 200 });

    response.cookies.set(name, token, options);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**

- [ ] Accepts username and password
- [ ] Validates credentials
- [ ] Creates session token
- [ ] Sets HTTP-only cookie
- [ ] Returns appropriate error codes
- [ ] Has timing attack mitigation

#### 3.2 Logout endpoint

**Location:** `/src/app/api/logout/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getSessionCookieConfig } from "@/lib/auth";

export async function POST() {
  const { name } = getSessionCookieConfig();

  const response = NextResponse.json({ success: true }, { status: 200 });

  // Clear cookie by setting maxAge to 0
  response.cookies.set(name, "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}
```

**Acceptance Criteria:**

- [ ] Clears session cookie
- [ ] Returns success response

#### 3.3 Session check endpoint (optional)

**Location:** `/src/app/api/auth/session/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username: session.username,
  });
}
```

**Acceptance Criteria:**

- [ ] Returns current session status
- [ ] Useful for client-side checks

### 4. Middleware Protection

#### 4.1 Create authentication middleware

**Location:** `/src/middleware.ts`

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, getSessionCookieConfig } from "@/lib/auth";

// Routes that don't require authentication
const publicPaths = ["/login", "/api/login"];

// Static assets and Next.js internals
const publicPatterns = [
  /^\/(_next|favicon\.ico|.*\.(?:png|jpg|jpeg|gif|svg|ico)$)/,
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public patterns (static assets, etc.)
  if (publicPatterns.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  // Check session
  const { name } = getSessionCookieConfig();
  const token = request.cookies.get(name)?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  const session = await verifySession(token);

  if (!session) {
    return redirectToLogin(request);
  }

  // Valid session - continue
  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);

  // Preserve original destination for redirect after login
  if (request.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
  }

  return NextResponse.redirect(loginUrl);
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**Acceptance Criteria:**

- [ ] Middleware protects all routes except login
- [ ] Allows static assets
- [ ] Redirects to login when not authenticated
- [ ] Preserves destination URL for post-login redirect
- [ ] Proper matcher configuration

### 5. Login Page UI

#### 5.1 Create login page

**Location:** `/src/app/login/page.tsx`

```typescript
'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Redirect to original destination or study page
      const from = searchParams.get('from') || '/study';
      router.push(from);

    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold">
            Anki Interview App
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to continue
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**

- [ ] Login form with username/password
- [ ] Calls POST /api/login
- [ ] Displays errors
- [ ] Redirects after successful login
- [ ] Respects 'from' query parameter
- [ ] Loading state during submission
- [ ] Disabled state prevents double-submit

#### 5.2 Add logout button component

**Location:** `/src/components/LogoutButton.tsx`

```typescript
'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
    >
      Logout
    </button>
  );
}
```

**Acceptance Criteria:**

- [ ] Logout button component created
- [ ] Calls logout API
- [ ] Redirects to login page

### 6. Testing

#### 6.1 Manual testing checklist

**Login flow:**

- [ ] Navigate to any protected route → redirects to /login
- [ ] Submit with empty credentials → shows error
- [ ] Submit with wrong password → shows "Invalid credentials"
- [ ] Submit with correct credentials → redirects to study page
- [ ] Check cookie is set in browser DevTools
- [ ] Verify cookie is HTTP-only and Secure (in production)

**Protected routes:**

- [ ] After login, can access /study
- [ ] After login, can access /questions
- [ ] After login, can access /settings
- [ ] API routes require authentication

**Logout flow:**

- [ ] Click logout → redirects to /login
- [ ] Cookie is cleared
- [ ] Cannot access protected routes after logout

**Session persistence:**

- [ ] Close and reopen browser → still logged in
- [ ] Session expires after configured time
- [ ] Invalid token → redirects to login

#### 6.2 Security testing

- [ ] Verify password is never logged
- [ ] Verify SESSION_SECRET is never exposed
- [ ] Check cookie attributes (HttpOnly, Secure, SameSite)
- [ ] Test with expired JWT token
- [ ] Test with malformed JWT token
- [ ] Verify timing attack mitigation on login

### 7. Error Handling

#### 7.1 Common error scenarios

```typescript
// In route handlers, use this pattern:
try {
  const session = await requireSession();
  // ... protected logic
} catch (error) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Handle:**

- [ ] Missing credentials → 400 Bad Request
- [ ] Invalid credentials → 401 Unauthorized
- [ ] Expired session → 401 Unauthorized
- [ ] Missing session → 401 Unauthorized
- [ ] Server errors → 500 Internal Server Error

## Success Criteria

- [x] Environment variables configured
- [x] Session utilities implemented
- [x] Login API endpoint works
- [x] Logout API endpoint works
- [x] Middleware protects all routes
- [x] Login page UI functional
- [x] Can log in with correct credentials
- [x] Cannot access protected routes when not authenticated
- [x] Session persists across page refreshes
- [x] Logout clears session
- [x] Secure cookie configuration

## Security Considerations

1. **Password Storage**: Never store plaintext passwords
2. **Session Secret**: Use strong, random secret (min 32 chars)
3. **Cookie Security**: HTTP-only, Secure in production, SameSite=lax
4. **Timing Attacks**: Add delay on failed login attempts
5. **Token Expiration**: Set reasonable session timeout
6. **HTTPS**: Always use HTTPS in production
7. **Environment Variables**: Never commit secrets to git

## Next Steps

After authentication is complete:

1. Add authentication checks to all API routes
2. Add logout button to main navigation
3. Implement GitHub sync (authenticated endpoint)
4. Build study flow (protected pages)

## References

- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [jose JWT library](https://github.com/panva/jose)
- [bcrypt](https://www.npmjs.com/package/bcrypt)
- [Cloudflare Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
