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
    // Backend returns session token that we'll use to set cookie via redirect
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

    // Build final redirect URL (frontend destination after session is set)
    const finalRedirectUrl = new URL(redirectTo, request.url).toString();

    // Build backend session-setting URL
    // This redirects the browser to the backend, which sets the cookie and redirects back
    const backendUrl =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:8787";
    const sessionSetupUrl = new URL(`${backendUrl}/api/auth/set-session`);
    sessionSetupUrl.searchParams.set("token", result.sessionToken);
    sessionSetupUrl.searchParams.set("redirect", finalRedirectUrl);

    console.log("Redirecting to backend for session setup:", {
      sessionSetupUrl: sessionSetupUrl.toString(),
      finalRedirectUrl,
    });

    // Create response that redirects to backend for cookie setting
    const response = NextResponse.redirect(sessionSetupUrl.toString());

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
