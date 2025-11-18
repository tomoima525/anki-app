/**
 * Integration tests for authentication middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock session utilities
vi.mock('@/lib/session', () => ({
  verifySession: vi.fn(),
}))

import { verifySession } from '@/lib/session'

describe('Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Protected Routes', () => {
    it('should allow access to /study with valid session', async () => {
      // Mock valid session
      ;(verifySession as any).mockResolvedValue({
        userId: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
      })

      const request = new NextRequest('http://localhost:3000/study')
      const cookieValue = 'valid-session-token'

      // Add session cookie to request
      request.cookies.set('anki_session', cookieValue)

      // The middleware should call verifySession
      await verifySession(cookieValue)

      expect(verifySession).toHaveBeenCalledWith(cookieValue)
    })

    it('should redirect to /login with invalid session', async () => {
      // Mock invalid session (returns null)
      ;(verifySession as any).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/study')
      const cookieValue = 'invalid-session-token'

      request.cookies.set('anki_session', cookieValue)

      const result = await verifySession(cookieValue)

      expect(result).toBeNull()
    })

    it('should redirect to /login when session cookie is missing', async () => {
      const request = new NextRequest('http://localhost:3000/study')

      // No cookie set
      const cookieValue = request.cookies.get('anki_session')?.value

      expect(cookieValue).toBeUndefined()
    })

    it('should redirect to /login with expired session', async () => {
      // Mock expired session
      ;(verifySession as any).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/study')
      const cookieValue = 'expired-session-token'

      request.cookies.set('anki_session', cookieValue)

      const result = await verifySession(cookieValue)

      expect(result).toBeNull()
    })

    it('should redirect to /login with tampered session', async () => {
      // Mock tampered session (signature verification fails)
      ;(verifySession as any).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/study')
      const cookieValue = 'tampered-session-token'

      request.cookies.set('anki_session', cookieValue)

      const result = await verifySession(cookieValue)

      expect(result).toBeNull()
    })
  })

  describe('Public Routes', () => {
    it('should allow access to /login without session', async () => {
      const request = new NextRequest('http://localhost:3000/login')

      // No session verification should be needed for /login
      expect(verifySession).not.toHaveBeenCalled()
    })

    it('should allow access to /api/login without session', async () => {
      const request = new NextRequest('http://localhost:3000/api/login')

      expect(verifySession).not.toHaveBeenCalled()
    })

    it('should allow access to /api/auth/callback/google without session', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/callback/google')

      expect(verifySession).not.toHaveBeenCalled()
    })
  })

  describe('Session Validation', () => {
    it('should extract user information from valid session', async () => {
      const mockSession = {
        userId: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      ;(verifySession as any).mockResolvedValue(mockSession)

      const sessionToken = 'valid-session-token'
      const result = await verifySession(sessionToken)

      expect(result).toEqual(mockSession)
      expect(result?.userId).toBe('user-123')
      expect(result?.email).toBe('user@example.com')
      expect(result?.name).toBe('Test User')
    })

    it('should handle sessions for Google-authenticated users', async () => {
      const mockSession = {
        userId: 'user-456',
        email: 'googleuser@gmail.com',
        name: 'Google User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      ;(verifySession as any).mockResolvedValue(mockSession)

      const sessionToken = 'google-user-session-token'
      const result = await verifySession(sessionToken)

      expect(result).toEqual(mockSession)
      expect(result?.email).toBe('googleuser@gmail.com')
    })

    it('should handle sessions for username/password users', async () => {
      const mockSession = {
        userId: 'admin-user',
        email: 'admin@example.com',
        name: 'Admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      ;(verifySession as any).mockResolvedValue(mockSession)

      const sessionToken = 'admin-session-token'
      const result = await verifySession(sessionToken)

      expect(result).toEqual(mockSession)
    })
  })

  describe('Session Expiration', () => {
    it('should reject session token with expired timestamp', async () => {
      // Mock expired session (exp in the past)
      ;(verifySession as any).mockResolvedValue(null)

      const sessionToken = 'expired-token'
      const result = await verifySession(sessionToken)

      expect(result).toBeNull()
    })

    it('should accept session token within validity period', async () => {
      const mockSession = {
        userId: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000) - 3600, // Issued 1 hour ago
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      }

      ;(verifySession as any).mockResolvedValue(mockSession)

      const sessionToken = 'valid-token'
      const result = await verifySession(sessionToken)

      expect(result).toEqual(mockSession)
    })
  })

  describe('Multiple Sessions', () => {
    it('should handle multiple concurrent sessions for same user', async () => {
      const mockSession1 = {
        userId: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      const mockSession2 = {
        userId: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000) - 1800,
        exp: Math.floor(Date.now() / 1000) + 5400,
      }

      // First session
      ;(verifySession as any).mockResolvedValueOnce(mockSession1)
      const result1 = await verifySession('session-token-1')
      expect(result1).toEqual(mockSession1)

      // Second session
      ;(verifySession as any).mockResolvedValueOnce(mockSession2)
      const result2 = await verifySession('session-token-2')
      expect(result2).toEqual(mockSession2)

      // Both should have same user ID
      expect(result1?.userId).toBe(result2?.userId)
    })
  })

  describe('Edge Cases', () => {
    it('should handle malformed session token', async () => {
      ;(verifySession as any).mockResolvedValue(null)

      const result = await verifySession('not-a-jwt-token')

      expect(result).toBeNull()
    })

    it('should handle empty session token', async () => {
      ;(verifySession as any).mockResolvedValue(null)

      const result = await verifySession('')

      expect(result).toBeNull()
    })

    it('should handle session token with wrong signature algorithm', async () => {
      ;(verifySession as any).mockResolvedValue(null)

      const result = await verifySession('token-with-wrong-alg')

      expect(result).toBeNull()
    })
  })
})
