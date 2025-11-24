/**
 * Unit tests for user management utilities
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createUserFromGoogle,
  findUserByGoogleId,
  findUserByEmail,
  findUserById,
  updateLastLogin,
  updateUser,
  clearUsers,
  getAllUsers,
  userExists,
  type User,
} from './users'

describe('User Management', () => {
  beforeEach(async () => {
    // Clear all users before each test
    await clearUsers()
  })

  describe('createUserFromGoogle', () => {
    it('should create a new user with Google data', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User',
        'https://example.com/photo.jpg'
      )

      expect(user).toMatchObject({
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      })
      expect(user.id).toBeTruthy()
      expect(user.createdAt).toBeTruthy()
      expect(user.lastLoginAt).toBeTruthy()
    })

    it('should create user without picture', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      expect(user.picture).toBeUndefined()
      expect(user.googleId).toBe('google-123')
    })

    it('should generate unique user IDs', async () => {
      const user1 = await createUserFromGoogle(
        'google-123',
        'user1@example.com',
        'User One'
      )
      const user2 = await createUserFromGoogle(
        'google-456',
        'user2@example.com',
        'User Two'
      )

      expect(user1.id).not.toBe(user2.id)
    })

    it('should set createdAt and lastLoginAt to same time on creation', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      expect(user.createdAt).toBe(user.lastLoginAt)
    })

    it('should use valid ISO timestamp format', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      // Check if timestamps are valid ISO 8601 dates
      expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt)
      expect(new Date(user.lastLoginAt).toISOString()).toBe(user.lastLoginAt)
    })
  })

  describe('findUserByGoogleId', () => {
    it('should find user by Google ID', async () => {
      const created = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const found = await findUserByGoogleId('google-123')

      expect(found).toEqual(created)
    })

    it('should return null when user not found', async () => {
      const found = await findUserByGoogleId('non-existent')

      expect(found).toBeNull()
    })

    it('should distinguish between different Google IDs', async () => {
      await createUserFromGoogle('google-123', 'user1@example.com', 'User One')
      await createUserFromGoogle('google-456', 'user2@example.com', 'User Two')

      const found = await findUserByGoogleId('google-456')

      expect(found?.email).toBe('user2@example.com')
    })
  })

  describe('findUserByEmail', () => {
    it('should find user by email', async () => {
      const created = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const found = await findUserByEmail('test@example.com')

      expect(found).toEqual(created)
    })

    it('should return null when user not found', async () => {
      const found = await findUserByEmail('nonexistent@example.com')

      expect(found).toBeNull()
    })

    it('should be case-insensitive', async () => {
      await createUserFromGoogle(
        'google-123',
        'Test@Example.com',
        'Test User'
      )

      const found1 = await findUserByEmail('test@example.com')
      const found2 = await findUserByEmail('TEST@EXAMPLE.COM')
      const found3 = await findUserByEmail('Test@Example.com')

      expect(found1).not.toBeNull()
      expect(found2).not.toBeNull()
      expect(found3).not.toBeNull()
      expect(found1?.id).toBe(found2?.id)
      expect(found2?.id).toBe(found3?.id)
    })

    it('should distinguish between different emails', async () => {
      await createUserFromGoogle('google-123', 'user1@example.com', 'User One')
      await createUserFromGoogle('google-456', 'user2@example.com', 'User Two')

      const found = await findUserByEmail('user2@example.com')

      expect(found?.name).toBe('User Two')
    })
  })

  describe('findUserById', () => {
    it('should find user by ID', async () => {
      const created = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const found = await findUserById(created.id)

      expect(found).toEqual(created)
    })

    it('should return null when user not found', async () => {
      const found = await findUserById('non-existent-id')

      expect(found).toBeNull()
    })
  })

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      // Wait to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 100))

      const updated = await updateLastLogin(user.id)

      expect(updated.lastLoginAt).not.toBe(user.lastLoginAt)
      expect(new Date(updated.lastLoginAt).getTime()).toBeGreaterThan(
        new Date(user.lastLoginAt).getTime()
      )
      expect(updated.createdAt).toBe(user.createdAt) // createdAt should not change
    })

    it('should throw error when user not found', async () => {
      await expect(
        updateLastLogin('non-existent-id')
      ).rejects.toThrow('User not found: non-existent-id')
    })

    it('should persist the update', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      await new Promise(resolve => setTimeout(resolve, 100))
      await updateLastLogin(user.id)

      const found = await findUserById(user.id)
      expect(found?.lastLoginAt).not.toBe(user.lastLoginAt)
    })
  })

  describe('updateUser', () => {
    it('should update user profile information', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const updated = await updateUser(user.id, {
        name: 'Updated Name',
        picture: 'https://example.com/new-photo.jpg',
      })

      expect(updated.name).toBe('Updated Name')
      expect(updated.picture).toBe('https://example.com/new-photo.jpg')
    })

    it('should throw error when user not found', async () => {
      await expect(
        updateUser('non-existent-id', { name: 'New Name' })
      ).rejects.toThrow('User not found: non-existent-id')
    })

    it('should not allow changing user ID', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const updated = await updateUser(user.id, {
        id: 'different-id',
      } as any)

      expect(updated.id).toBe(user.id) // ID should remain unchanged
    })

    it('should not allow changing createdAt', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const updated = await updateUser(user.id, {
        createdAt: '2000-01-01T00:00:00.000Z',
      })

      expect(updated.createdAt).toBe(user.createdAt) // createdAt should remain unchanged
    })

    it('should persist the update', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      await updateUser(user.id, { name: 'Updated Name' })

      const found = await findUserById(user.id)
      expect(found?.name).toBe('Updated Name')
    })

    it('should allow partial updates', async () => {
      const user = await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User',
        'https://example.com/photo.jpg'
      )

      const updated = await updateUser(user.id, {
        name: 'New Name',
      })

      expect(updated.name).toBe('New Name')
      expect(updated.email).toBe('test@example.com') // Other fields unchanged
      expect(updated.picture).toBe('https://example.com/photo.jpg')
    })
  })

  describe('userExists', () => {
    it('should return true when user exists', async () => {
      await createUserFromGoogle(
        'google-123',
        'test@example.com',
        'Test User'
      )

      const exists = await userExists('test@example.com')

      expect(exists).toBe(true)
    })

    it('should return false when user does not exist', async () => {
      const exists = await userExists('nonexistent@example.com')

      expect(exists).toBe(false)
    })

    it('should be case-insensitive', async () => {
      await createUserFromGoogle(
        'google-123',
        'Test@Example.com',
        'Test User'
      )

      const exists1 = await userExists('test@example.com')
      const exists2 = await userExists('TEST@EXAMPLE.COM')

      expect(exists1).toBe(true)
      expect(exists2).toBe(true)
    })
  })

  describe('getAllUsers', () => {
    it('should return empty array when no users', async () => {
      const users = await getAllUsers()

      expect(users).toEqual([])
    })

    it('should return all created users', async () => {
      await createUserFromGoogle('google-123', 'user1@example.com', 'User One')
      await createUserFromGoogle('google-456', 'user2@example.com', 'User Two')
      await createUserFromGoogle('google-789', 'user3@example.com', 'User Three')

      const users = await getAllUsers()

      expect(users).toHaveLength(3)
      expect(users.map(u => u.email)).toContain('user1@example.com')
      expect(users.map(u => u.email)).toContain('user2@example.com')
      expect(users.map(u => u.email)).toContain('user3@example.com')
    })
  })

  describe('clearUsers', () => {
    it('should remove all users', async () => {
      await createUserFromGoogle('google-123', 'user1@example.com', 'User One')
      await createUserFromGoogle('google-456', 'user2@example.com', 'User Two')

      let users = await getAllUsers()
      expect(users).toHaveLength(2)

      await clearUsers()

      users = await getAllUsers()
      expect(users).toHaveLength(0)
    })
  })
})
