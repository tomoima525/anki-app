/**
 * Google OAuth 2.0 authentication utilities
 * Handles Google OAuth flow, token exchange, and user data extraction
 */

import { decodeJwt } from 'jose'

export interface GoogleIdToken {
  sub: string // Google user ID
  email: string
  email_verified: boolean
  name: string
  picture?: string
  given_name?: string
  family_name?: string
  locale?: string
  iat: number
  exp: number
  aud: string
  iss: string
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  id_token: string
}

export interface GoogleUser {
  googleId: string
  email: string
  name: string
  picture?: string
  emailVerified: boolean
}

/**
 * Generate Google OAuth authorization URL
 * @param redirectUri - The callback URL after user consents
 * @param state - CSRF protection token
 * @returns Authorization URL to redirect user to
 */
export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not set')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  })

  if (state) {
    params.set('state', state)
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for access token and ID token
 * @param code - Authorization code from Google OAuth callback
 * @param redirectUri - Must match the redirect URI used in authorization request
 * @returns Google token response containing access_token and id_token
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth environment variables are not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code for tokens: ${error}`)
  }

  return response.json()
}

/**
 * Decode and extract user information from Google ID token
 * Note: This does not verify the token signature. In production, you should
 * verify the token using Google's public keys or use a library that does this.
 *
 * @param idToken - JWT ID token from Google
 * @returns Decoded Google ID token payload
 */
export function decodeGoogleIdToken(idToken: string): GoogleIdToken {
  try {
    const decoded = decodeJwt(idToken) as GoogleIdToken

    // Basic validation
    if (!decoded.sub || !decoded.email) {
      throw new Error('Invalid ID token: missing required claims')
    }

    return decoded
  } catch (error) {
    throw new Error(`Failed to decode ID token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Extract user information from Google ID token
 * @param idToken - JWT ID token from Google
 * @returns User information suitable for creating/updating user account
 */
export function extractGoogleUser(idToken: string): GoogleUser {
  const decoded = decodeGoogleIdToken(idToken)

  return {
    googleId: decoded.sub,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
    emailVerified: decoded.email_verified,
  }
}

/**
 * Validate Google OAuth state parameter for CSRF protection
 * @param receivedState - State parameter from OAuth callback
 * @param expectedState - State parameter stored before redirect
 * @returns True if states match
 */
export function validateOAuthState(receivedState: string | null, expectedState: string): boolean {
  if (!receivedState) {
    return false
  }

  return receivedState === expectedState
}

/**
 * Generate a random state parameter for OAuth CSRF protection
 * @returns Random hex string
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
