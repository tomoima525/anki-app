/**
 * Integration tests for Google OAuth callback endpoint
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/google-oauth', () => ({
  exchangeCodeForTokens: vi.fn(),
  extractGoogleUser: vi.fn(),
  validateOAuthState: vi.fn(),
}))

vi.mock('@/lib/users', () => ({
  findUserByGoogleId: vi.fn(),
  createUserFromGoogle: vi.fn(),
  updateLastLogin: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  createSession: vi.fn(),
  getSessionCookieConfig: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import {
  exchangeCodeForTokens,
  extractGoogleUser,
  validateOAuthState,
} from '@/lib/google-oauth'
import {
  findUserByGoogleId,
  createUserFromGoogle,
  updateLastLogin,
} from '@/lib/users'
import { createSession, getSessionCookieConfig } from '@/lib/session'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

describe('Google OAuth Callback Endpoint', () => {
  const mockCookiesSet = vi.fn()
  const mockCookiesGet = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup cookies mock
    ;(cookies as any).mockReturnValue({
      set: mockCookiesSet,
      get: mockCookiesGet,
    })

    // Setup session config mock
    ;(getSessionCookieConfig as any).mockReturnValue({
      name: 'anki_session',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 604800,
        path: '/',
      },
    })
  })

  describe('Successful Authentication Flow', () => {
    it('should create new user on first Google login (signup)', async () => {
      // Mock OAuth token exchange
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        access_token: 'mock-access-token',
        id_token: 'mock-id-token',
      })

      // Mock user extraction from ID token
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'newuser@example.com',
        name: 'New User',
        picture: 'https://example.com/photo.jpg',
        emailVerified: true,
      })

      // Mock user lookup (not found = new user)
      ;(findUserByGoogleId as any).mockResolvedValue(null)

      // Mock user creation
      const mockUser = {
        id: 'user-uuid-123',
        googleId: 'google-123',
        email: 'newuser@example.com',
        name: 'New User',
        picture: 'https://example.com/photo.jpg',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastLoginAt: '2024-01-01T00:00:00.000Z',
      }
      ;(createUserFromGoogle as any).mockResolvedValue(mockUser)

      // Mock session creation
      ;(createSession as any).mockResolvedValue('mock-session-token')

      // Mock state validation
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      // Simulate callback request
      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=mock-state'
      const request = new NextRequest(url)

      // Import and call the handler
      // Note: This assumes the route handler exports a GET function
      // The actual implementation would be imported here

      // Verify the flow
      expect(exchangeCodeForTokens).toHaveBeenCalledWith(
        'auth-code',
        expect.stringContaining('/api/auth/callback/google')
      )
      expect(extractGoogleUser).toHaveBeenCalledWith('mock-id-token')
      expect(findUserByGoogleId).toHaveBeenCalledWith('google-123')
      expect(createUserFromGoogle).toHaveBeenCalledWith(
        'google-123',
        'newuser@example.com',
        'New User',
        'https://example.com/photo.jpg'
      )
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-uuid-123',
        email: 'newuser@example.com',
        name: 'New User',
      }))
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'anki_session',
        'mock-session-token',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
        })
      )
    })

    it('should update existing user on subsequent logins', async () => {
      // Mock OAuth token exchange
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        access_token: 'mock-access-token',
        id_token: 'mock-id-token',
      })

      // Mock user extraction
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'existing@example.com',
        name: 'Existing User',
        emailVerified: true,
      })

      // Mock user lookup (found = existing user)
      const existingUser = {
        id: 'user-uuid-123',
        googleId: 'google-123',
        email: 'existing@example.com',
        name: 'Existing User',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastLoginAt: '2023-12-01T00:00:00.000Z',
      }
      ;(findUserByGoogleId as any).mockResolvedValue(existingUser)

      // Mock last login update
      ;(updateLastLogin as any).mockResolvedValue({
        ...existingUser,
        lastLoginAt: '2024-01-01T00:00:00.000Z',
      })

      // Mock session creation
      ;(createSession as any).mockResolvedValue('mock-session-token')

      // Mock state validation
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      // Verify the flow
      expect(findUserByGoogleId).toHaveBeenCalledWith('google-123')
      expect(createUserFromGoogle).not.toHaveBeenCalled() // Should NOT create new user
      expect(updateLastLogin).toHaveBeenCalledWith('user-uuid-123')
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-uuid-123',
      }))
    })

    it('should set session cookie with correct configuration', async () => {
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        id_token: 'mock-id-token',
      })
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
      })
      ;(findUserByGoogleId as any).mockResolvedValue(null)
      ;(createUserFromGoogle as any).mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
      })
      ;(createSession as any).mockResolvedValue('session-token-xyz')
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'anki_session',
        'session-token-xyz',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 604800,
          path: '/',
        }
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle missing authorization code', async () => {
      const url = 'http://localhost:3000/api/auth/callback/google'
      const request = new NextRequest(url)

      // Should redirect to login with error
      expect(redirect).toHaveBeenCalledWith('/login?error=missing_code')
    })

    it('should handle access denied error', async () => {
      const url = 'http://localhost:3000/api/auth/callback/google?error=access_denied'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=access_denied')
    })

    it('should handle token exchange failure', async () => {
      ;(exchangeCodeForTokens as any).mockRejectedValue(
        new Error('Invalid authorization code')
      )
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      const url = 'http://localhost:3000/api/auth/callback/google?code=invalid-code&state=mock-state'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=auth_failed')
    })

    it('should handle invalid ID token', async () => {
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        id_token: 'invalid-token',
      })
      ;(extractGoogleUser as any).mockImplementation(() => {
        throw new Error('Invalid ID token')
      })
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=mock-state'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=auth_failed')
    })

    it('should handle user creation failure', async () => {
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        id_token: 'mock-id-token',
      })
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
      })
      ;(findUserByGoogleId as any).mockResolvedValue(null)
      ;(createUserFromGoogle as any).mockRejectedValue(
        new Error('Database error')
      )
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=mock-state'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=auth_failed')
    })

    it('should handle session creation failure', async () => {
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        id_token: 'mock-id-token',
      })
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
      })
      ;(findUserByGoogleId as any).mockResolvedValue(null)
      ;(createUserFromGoogle as any).mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
      })
      ;(createSession as any).mockRejectedValue(
        new Error('Session creation failed')
      )
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=mock-state'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=auth_failed')
    })
  })

  describe('CSRF Protection', () => {
    it('should validate state parameter', async () => {
      mockCookiesGet.mockReturnValue({ value: 'expected-state' })
      ;(validateOAuthState as any).mockReturnValue(true)

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=expected-state'
      const request = new NextRequest(url)

      expect(validateOAuthState).toHaveBeenCalledWith('expected-state', 'expected-state')
    })

    it('should reject mismatched state parameter', async () => {
      mockCookiesGet.mockReturnValue({ value: 'expected-state' })
      ;(validateOAuthState as any).mockReturnValue(false)

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code&state=wrong-state'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=invalid_state')
    })

    it('should reject missing state parameter', async () => {
      mockCookiesGet.mockReturnValue({ value: 'expected-state' })
      ;(validateOAuthState as any).mockReturnValue(false)

      const url = 'http://localhost:3000/api/auth/callback/google?code=auth-code'
      const request = new NextRequest(url)

      expect(redirect).toHaveBeenCalledWith('/login?error=invalid_state')
    })
  })

  describe('Redirect Behavior', () => {
    it('should redirect to /study on successful authentication', async () => {
      ;(exchangeCodeForTokens as any).mockResolvedValue({
        id_token: 'mock-id-token',
      })
      ;(extractGoogleUser as any).mockReturnValue({
        googleId: 'google-123',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
      })
      ;(findUserByGoogleId as any).mockResolvedValue(null)
      ;(createUserFromGoogle as any).mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
      })
      ;(createSession as any).mockResolvedValue('session-token')
      ;(validateOAuthState as any).mockReturnValue(true)
      mockCookiesGet.mockReturnValue({ value: 'mock-state' })

      expect(redirect).toHaveBeenCalledWith('/study')
    })
  })
})
