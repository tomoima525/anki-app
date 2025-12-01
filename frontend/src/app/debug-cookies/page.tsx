"use client";

import { useEffect, useState } from "react";

export default function DebugCookiesPage() {
  const [testResults, setTestResults] = useState<{
    backendUrl?: string;
    canFetchBackend?: boolean;
    healthCheck?: any;
    error?: string;
    corsHeaders?: Record<string, string>;
    cookieTest?: any;
  }>({});

  useEffect(() => {
    testCookies();
  }, []);

  const testCookies = async () => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";

    try {
      // Test 1: Basic health check
      const healthResponse = await fetch(`${backendUrl}/health`, {
        credentials: "include",
      });
      const healthData = await healthResponse.json();

      // Capture CORS headers
      const corsHeaders: Record<string, string> = {};
      healthResponse.headers.forEach((value, key) => {
        if (key.toLowerCase().includes("access-control")) {
          corsHeaders[key] = value;
        }
      });

      // Test 2: Try to access authenticated endpoint
      const meResponse = await fetch(`${backendUrl}/api/users/me`, {
        credentials: "include",
      });

      let cookieTest;
      if (meResponse.ok) {
        cookieTest = {
          authenticated: true,
          data: await meResponse.json(),
        };
      } else {
        cookieTest = {
          authenticated: false,
          status: meResponse.status,
          statusText: meResponse.statusText,
        };
      }

      setTestResults({
        backendUrl,
        canFetchBackend: true,
        healthCheck: healthData,
        corsHeaders,
        cookieTest,
      });
    } catch (error) {
      setTestResults({
        backendUrl,
        canFetchBackend: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const testDirectCookieSet = () => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";
    // NOTE: This uses the deprecated /api/auth/set-session endpoint
    // The actual auth flow now sets cookies directly on the frontend domain
    const testToken = "test-token-replace-with-real";
    const redirectUrl = `${window.location.origin}/debug-cookies`;
    window.location.href = `${backendUrl}/api/auth/set-session?token=${testToken}&redirect=${redirectUrl}`;
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cookie Debug Page</h1>

      <div className="space-y-6">
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Current Window Info</h2>
          <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
            {JSON.stringify(
              {
                origin: typeof window !== "undefined" ? window.location.origin : "N/A",
                href: typeof window !== "undefined" ? window.location.href : "N/A",
                cookies: typeof document !== "undefined" ? document.cookie : "N/A",
              },
              null,
              2
            )}
          </pre>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Backend Connection Test</h2>
          {testResults.backendUrl && (
            <div className="space-y-2 text-sm">
              <div>
                <strong>Backend URL:</strong> {testResults.backendUrl}
              </div>
              <div>
                <strong>Can Fetch:</strong>{" "}
                {testResults.canFetchBackend ? "✅ Yes" : "❌ No"}
              </div>
              {testResults.error && (
                <div className="text-red-600">
                  <strong>Error:</strong> {testResults.error}
                </div>
              )}
            </div>
          )}
          {!testResults.backendUrl && (
            <div className="text-gray-500">Running tests...</div>
          )}
        </div>

        {testResults.corsHeaders && (
          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">CORS Headers</h2>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(testResults.corsHeaders, null, 2)}
            </pre>
          </div>
        )}

        {testResults.healthCheck && (
          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">Health Check Response</h2>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(testResults.healthCheck, null, 2)}
            </pre>
          </div>
        )}

        {testResults.cookieTest && (
          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">Cookie Authentication Test</h2>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(testResults.cookieTest, null, 2)}
            </pre>
            {!testResults.cookieTest.authenticated && (
              <div className="mt-2 text-sm text-yellow-600">
                ⚠️ Not authenticated - Cookie is not being sent or is invalid
              </div>
            )}
          </div>
        )}

        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Actions</h2>
          <div className="space-y-2">
            <button
              onClick={testCookies}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Re-run Tests
            </button>
            <div className="text-sm text-gray-600 mt-4">
              <strong>Manual Test:</strong> To test the cookie flow, you need a
              valid session token. Log in normally and check if cookies work.
            </div>
          </div>
        </div>

        <div className="border border-yellow-300 bg-yellow-50 rounded p-4">
          <h2 className="font-semibold mb-2">Browser Console Commands</h2>
          <div className="text-sm space-y-2">
            <div>
              <strong>Check if cookies are sent:</strong>
              <code className="block bg-gray-100 p-2 mt-1 rounded">
                // Open Network tab, make request to backend, check Request Headers for "Cookie"
              </code>
            </div>
            <div>
              <strong>Check third-party cookie settings:</strong>
              <code className="block bg-gray-100 p-2 mt-1 rounded">
                chrome://settings/cookies
              </code>
            </div>
            <div>
              <strong>View all cookies:</strong>
              <code className="block bg-gray-100 p-2 mt-1 rounded">
                document.cookie
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
