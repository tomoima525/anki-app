"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getGoogleAuthUrl, generateOAuthState } from "@/lib/google-oauth";

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for error in query params
    const errorParam = searchParams.get("error");
    if (errorParam === "google_auth_failed") {
      setError("Google authentication failed. Please try again.");
    } else if (errorParam === "access_denied") {
      setError("Access denied. Please grant the required permissions.");
    }
  }, [searchParams]);

  const handleGoogleSignIn = () => {
    setLoading(true);
    setError("");

    try {
      // Check if Google Client ID is available
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        setError(
          "Google authentication is not configured. Please contact support. clientId: " +
            clientId
        );
        setLoading(false);
        return;
      }

      // Generate state for CSRF protection
      const state = generateOAuthState();

      // Store state in cookie for server-side validation
      // Set cookie with 10 minute expiration (enough time for OAuth flow)
      const cookieOptions = `path=/; max-age=600; SameSite=Lax`;
      document.cookie = `oauth_state=${state}; ${cookieOptions}`;

      // Get redirect URI
      const redirectUri = `${window.location.origin}/api/auth/callback/google`;

      // Preserve original destination in cookie
      const from = searchParams.get("from");
      if (from) {
        document.cookie = `oauth_redirect=${encodeURIComponent(from)}; ${cookieOptions}`;
      }

      // Redirect to Google OAuth
      const authUrl = getGoogleAuthUrl(redirectUri, state);
      window.location.href = authUrl;
    } catch (error) {
      console.error("Google sign in error:", error);
      setError("Failed to initiate Google sign in. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-3xl">
            Anki Interview App
          </CardTitle>
          <CardDescription className="text-center">
            Sign in with Google to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <Button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? "Redirecting..." : "Sign in with Google"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
