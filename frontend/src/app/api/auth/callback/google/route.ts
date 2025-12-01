import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  extractGoogleUser,
  validateOAuthState,
} from "@/lib/google-oauth";
import { createUserFromGoogle } from "@/lib/users";

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
        new URL("/login?error=auth_failed-token_exchange", request.url)
      );
    }

    // Extract user information from ID token
    let googleUser;
    try {
      googleUser = extractGoogleUser(tokenResponse.id_token);
    } catch (error) {
      console.error("Failed to extract user from ID token:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed-extract_user", request.url)
      );
    }

    // Create or update user in backend database
    // Backend returns session token that we'll set as a cookie on the frontend domain
    let result;
    try {
      result = await createUserFromGoogle(
        googleUser.googleId,
        googleUser.email,
        googleUser.name,
        googleUser.picture
      );
    } catch (error) {
      console.error("User creation/update failed:", error);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed-create_user", request.url)
      );
    }

    // Get redirect destination (from cookie set during OAuth initiation)
    const redirectCookieName = "oauth_redirect";
    const redirectTo =
      request.cookies.get(redirectCookieName)?.value || "/study";

    // Build final redirect URL
    const finalRedirectUrl = new URL(redirectTo, request.url);

    console.log("Setting session cookie on frontend domain:", {
      redirectTo,
      hasToken: !!result.sessionToken,
    });

    // Create response with redirect to final destination
    const response = NextResponse.redirect(finalRedirectUrl);

    // Set session cookie on the FRONTEND domain
    // This allows the middleware to read it directly
    const isProduction = process.env.NODE_ENV === "production";
    response.cookies.set("anki_session", result.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 604800, // 7 days (same as backend)
      path: "/",
    });

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
