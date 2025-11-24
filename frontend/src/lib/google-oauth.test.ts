/**
 * Unit tests for Google OAuth utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  decodeGoogleIdToken,
  extractGoogleUser,
  validateOAuthState,
  generateOAuthState,
  type GoogleIdToken,
  type GoogleTokenResponse,
} from './google-oauth'

describe('Google OAuth Utilities', () => {
  describe('getGoogleAuthUrl', () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
      process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    })

    it('should generate correct authorization URL with required parameters', () => {
      const redirectUri = 'http://localhost:3000/api/auth/callback/google'
      const url = getGoogleAuthUrl(redirectUri)

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fgoogle')
      expect(url).toContain('response_type=code')
      expect(url).toContain('scope=openid+email+profile')
      expect(url).toContain('access_type=online')
      expect(url).toContain('prompt=select_account')
    })

    it('should include state parameter when provided', () => {
      const redirectUri = 'http://localhost:3000/api/auth/callback/google'
      const state = 'random-state-token'
      const url = getGoogleAuthUrl(redirectUri, state)

      expect(url).toContain('state=random-state-token')
    })

    it('should not include state parameter when not provided', () => {
      const redirectUri = 'http://localhost:3000/api/auth/callback/google'
      const url = getGoogleAuthUrl(redirectUri)

      expect(url).not.toContain('state=')
    })

    it('should throw error when GOOGLE_CLIENT_ID is not set', () => {
      delete process.env.GOOGLE_CLIENT_ID

      expect(() => {
        getGoogleAuthUrl('http://localhost:3000/callback')
      }).toThrow('GOOGLE_CLIENT_ID environment variable is not set')
    })

    it('should properly encode redirect URI', () => {
      const redirectUri = 'https://example.com/auth/callback?param=value'
      const url = getGoogleAuthUrl(redirectUri)

      // Check that the redirect URI is properly URL encoded
      expect(url).toContain(encodeURIComponent(redirectUri))
    })
  })

  describe('exchangeCodeForTokens', () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
      process.env.GOOGLE_CLIENT_ID = 'test-client-id'
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
      global.fetch = vi.fn()
    })

    it('should successfully exchange code for tokens', async () => {
      const mockResponse: GoogleTokenResponse = {
        access_token: 'mock-access-token',
        expires_in: 3600,
        scope: 'openid email profile',
        token_type: 'Bearer',
        id_token: 'mock-id-token',
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await exchangeCodeForTokens('auth-code', 'http://localhost:3000/callback')

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      )
    })

    it('should send correct parameters in token exchange request', async () => {
      const mockResponse: GoogleTokenResponse = {
        access_token: 'mock-access-token',
        expires_in: 3600,
        scope: 'openid email profile',
        token_type: 'Bearer',
        id_token: 'mock-id-token',
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      await exchangeCodeForTokens('test-code', 'http://localhost:3000/callback')

      const fetchCall = (global.fetch as any).mock.calls[0]
      const bodyParams = new URLSearchParams(fetchCall[1].body)

      expect(bodyParams.get('code')).toBe('test-code')
      expect(bodyParams.get('client_id')).toBe('test-client-id')
      expect(bodyParams.get('client_secret')).toBe('test-client-secret')
      expect(bodyParams.get('redirect_uri')).toBe('http://localhost:3000/callback')
      expect(bodyParams.get('grant_type')).toBe('authorization_code')
    })

    it('should throw error when token exchange fails', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid authorization code',
      })

      await expect(
        exchangeCodeForTokens('invalid-code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Failed to exchange code for tokens')
    })

    it('should throw error when GOOGLE_CLIENT_ID is not set', async () => {
      delete process.env.GOOGLE_CLIENT_ID

      await expect(
        exchangeCodeForTokens('code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Google OAuth environment variables are not configured')
    })

    it('should throw error when GOOGLE_CLIENT_SECRET is not set', async () => {
      delete process.env.GOOGLE_CLIENT_SECRET

      await expect(
        exchangeCodeForTokens('code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Google OAuth environment variables are not configured')
    })
  })

  describe('decodeGoogleIdToken', () => {
    it('should successfully decode valid ID token', () => {
      // Create a mock JWT (header.payload.signature)
      // Note: This is just base64-encoded JSON, not a real signed JWT
      const mockPayload: GoogleIdToken = {
        sub: 'google-user-123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'test-client-id',
        iss: 'https://accounts.google.com',
      }

      // Create a fake JWT (jose library will decode the payload)
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url')
      const signature = 'fake-signature'
      const fakeJwt = `${header}.${payload}.${signature}`

      const decoded = decodeGoogleIdToken(fakeJwt)

      expect(decoded.sub).toBe('google-user-123')
      expect(decoded.email).toBe('user@example.com')
      expect(decoded.name).toBe('Test User')
      expect(decoded.email_verified).toBe(true)
    })

    it('should throw error for invalid JWT format', () => {
      expect(() => {
        decodeGoogleIdToken('invalid-jwt')
      }).toThrow('Failed to decode ID token')
    })

    it('should throw error when required claims are missing', () => {
      // Token without required 'sub' claim
      const mockPayload = {
        email: 'user@example.com',
        name: 'Test User',
      }

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url')
      const signature = 'fake-signature'
      const fakeJwt = `${header}.${payload}.${signature}`

      expect(() => {
        decodeGoogleIdToken(fakeJwt)
      }).toThrow('Invalid ID token: missing required claims')
    })

    it('should throw error when email claim is missing', () => {
      // Token without required 'email' claim
      const mockPayload = {
        sub: 'google-user-123',
        name: 'Test User',
      }

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url')
      const signature = 'fake-signature'
      const fakeJwt = `${header}.${payload}.${signature}`

      expect(() => {
        decodeGoogleIdToken(fakeJwt)
      }).toThrow('Invalid ID token: missing required claims')
    })
  })

  describe('extractGoogleUser', () => {
    it('should extract user information from valid ID token', () => {
      const mockPayload: GoogleIdToken = {
        sub: 'google-user-123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'test-client-id',
        iss: 'https://accounts.google.com',
      }

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url')
      const signature = 'fake-signature'
      const fakeJwt = `${header}.${payload}.${signature}`

      const user = extractGoogleUser(fakeJwt)

      expect(user).toEqual({
        googleId: 'google-user-123',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        emailVerified: true,
      })
    })

    it('should handle missing optional fields', () => {
      const mockPayload: GoogleIdToken = {
        sub: 'google-user-123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'test-client-id',
        iss: 'https://accounts.google.com',
      }

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url')
      const signature = 'fake-signature'
      const fakeJwt = `${header}.${payload}.${signature}`

      const user = extractGoogleUser(fakeJwt)

      expect(user.picture).toBeUndefined()
      expect(user.googleId).toBe('google-user-123')
      expect(user.email).toBe('user@example.com')
    })

    it('should throw error for invalid token', () => {
      expect(() => {
        extractGoogleUser('invalid-token')
      }).toThrow('Failed to decode ID token')
    })
  })

  describe('validateOAuthState', () => {
    it('should return true when states match', () => {
      const state = 'random-state-token-12345'
      expect(validateOAuthState(state, state)).toBe(true)
    })

    it('should return false when states do not match', () => {
      expect(validateOAuthState('state-1', 'state-2')).toBe(false)
    })

    it('should return false when received state is null', () => {
      expect(validateOAuthState(null, 'expected-state')).toBe(false)
    })

    it('should return false when received state is empty string', () => {
      expect(validateOAuthState('', 'expected-state')).toBe(false)
    })

    it('should be case-sensitive', () => {
      expect(validateOAuthState('STATE', 'state')).toBe(false)
    })
  })

  describe('generateOAuthState', () => {
    it('should generate a state string', () => {
      const state = generateOAuthState()
      expect(state).toBeTruthy()
      expect(typeof state).toBe('string')
    })

    it('should generate different states each time', () => {
      const state1 = generateOAuthState()
      const state2 = generateOAuthState()
      expect(state1).not.toBe(state2)
    })

    it('should generate hex string of expected length', () => {
      const state = generateOAuthState()
      // 32 bytes = 64 hex characters
      expect(state).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should be suitable for CSRF protection (sufficient entropy)', () => {
      const states = new Set()
      // Generate 100 states and ensure they're all unique
      for (let i = 0; i < 100; i++) {
        states.add(generateOAuthState())
      }
      expect(states.size).toBe(100)
    })
  })
})
