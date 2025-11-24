import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, getSessionCookieConfig } from "@/lib/session";

// Edge runtime for Cloudflare Pages
export const runtime = "edge";

// Routes that don't require authentication
const publicPaths = ["/login", "/api/auth/callback/google"];

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
