import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, getSessionCookieConfig } from "@/lib/session";

// Routes that don't require authentication
const publicPaths = ["/login", "/api/auth/callback/google", "/debug-cookies"];

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

  // NOTE: For cross-origin cookie setup (frontend on Vercel, backend on Cloudflare),
  // we cannot check cookies in middleware because the cookie is stored on the backend domain.
  // Instead, we rely on client-side authentication checks in protected components.
  // The middleware now only handles redirects for completely public routes.

  // For now, allow all requests through and let components handle auth
  // This is temporary until we implement a proper cross-origin auth solution
  return NextResponse.next();
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
