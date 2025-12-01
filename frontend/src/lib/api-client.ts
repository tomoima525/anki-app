/**
 * API client utilities for making authenticated requests to the backend
 */

/**
 * Get the session token from cookies
 * Works in both browser and server contexts
 */
function getSessionToken(): string | null {
  if (typeof document === "undefined") {
    // Server-side: can't access cookies this way
    return null;
  }

  // Browser-side: read from document.cookie
  const cookieName =
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "anki_session";
  const cookies = document.cookie.split("; ");
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${cookieName}=`)
  );

  if (!sessionCookie) {
    return null;
  }

  return sessionCookie.split("=")[1];
}

/**
 * Create fetch options with authentication
 * Adds the session token from cookies to the Authorization header
 *
 * @param options - Additional fetch options to merge
 * @returns Fetch options with authentication headers
 */
export function createAuthenticatedFetchOptions(
  options: RequestInit = {}
): RequestInit {
  const token = getSessionToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return {
    ...options,
    headers,
    credentials: "include", // Still include for backwards compatibility
  };
}

/**
 * Convenience function for authenticated GET requests
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, createAuthenticatedFetchOptions(options));
}

/**
 * Convenience function for authenticated POST requests
 */
export async function authenticatedPost(
  url: string,
  body: unknown,
  options: RequestInit = {}
): Promise<Response> {
  return authenticatedFetch(url, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience function for authenticated PUT requests
 */
export async function authenticatedPut(
  url: string,
  body: unknown,
  options: RequestInit = {}
): Promise<Response> {
  return authenticatedFetch(url, {
    ...options,
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience function for authenticated DELETE requests
 */
export async function authenticatedDelete(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return authenticatedFetch(url, {
    ...options,
    method: "DELETE",
  });
}
