import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  extractGoogleUser,
  validateOAuthState,
} from "@/lib/google-oauth";
import {
  findUserByGoogleId,
  createUserFromGoogle,
  updateLastLogin,
} from "@/lib/users";
import { createSession, getSessionCookieConfig } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Check for OAuth error from Google
    const error = searchParams.get("error");
    if (error) {
      if (error === "access_denied") {
        return NextResponse.redirect(
          new URL("/login?error=access_denied", request.url)
        );
      }
      return NextResponse.redirect(
        new URL("/login?error=google_auth_failed", request.url)
      );
    }

    // Get authorization code
    const code = searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(
        new URL("/login?error=missing_code", request.url)
      );
    }

    // Get and validate state parameter (CSRF protection)
    const receivedState = searchParams.get("state");

    // Get expected state from cookie (set during OAuth initiation)
    // Note: For edge runtime, we use request.cookies instead of cookies()
    const stateCookieName = "oauth_state";
    const expectedState = request.cookies.get(stateCookieName)?.value;

    if (!expectedState || !validateOAuthState(receivedState, expectedState)) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_state", request.url)
      );
    }

    // Build redirect URI (must match the one used in OAuth initiation)
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback/google`;

    // Exchange authorization code for tokens
    let tokenResponse;
    try {
      tokenResponse = await exchangeCodeForTokens(code, redirectUri);
    } catch (error) {
      console.error("Token exchange failed:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed", request.url)
      );
    }

    // Extract user information from ID token
    let googleUser;
    try {
      googleUser = extractGoogleUser(tokenResponse.id_token);
    } catch (error) {
      console.error("Failed to extract user from ID token:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed", request.url)
      );
    }

    // Find or create user
    let user;
    try {
      const existingUser = await findUserByGoogleId(googleUser.googleId);

      if (existingUser) {
        // Existing user - update last login
        user = await updateLastLogin(existingUser.id);
      } else {
        // New user - create account
        user = await createUserFromGoogle(
          googleUser.googleId,
          googleUser.email,
          googleUser.name,
          googleUser.picture
        );
      }
    } catch (error) {
      console.error("User creation/update failed:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed", request.url)
      );
    }

    // Create session
    let sessionToken;
    try {
      sessionToken = await createSession(user.id, user.email, user.name);
    } catch (error) {
      console.error("Session creation failed:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed", request.url)
      );
    }

    // Get redirect destination (from cookie set during OAuth initiation)
    const redirectCookieName = "oauth_redirect";
    const redirectTo =
      request.cookies.get(redirectCookieName)?.value || "/study";

    // Create response with redirect
    const response = NextResponse.redirect(new URL(redirectTo, request.url));

    // Set session cookie
    const { name, options } = getSessionCookieConfig();
    response.cookies.set(name, sessionToken, options);

    // Clear OAuth state and redirect cookies
    response.cookies.delete(stateCookieName);
    response.cookies.delete(redirectCookieName);

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=google_auth_failed", request.url)
    );
  }
}
