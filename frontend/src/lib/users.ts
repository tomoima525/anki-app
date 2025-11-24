/**
 * User management utilities
 * Handles user creation, lookup, and updates
 */

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  googleId?: string
  createdAt: string
  lastLoginAt: string
}

// In-memory user store for MVP (will be replaced with database)
const users = new Map<string, User>()

/**
 * Create a new user from Google OAuth data
 * @param googleId - Google user ID (sub claim)
 * @param email - User's email
 * @param name - User's display name
 * @param picture - User's profile picture URL (optional)
 * @returns Created user
 */
export async function createUserFromGoogle(
  googleId: string,
  email: string,
  name: string,
  picture?: string
): Promise<User> {
  const now = new Date().toISOString()

  const user: User = {
    id: crypto.randomUUID(),
    googleId,
    email,
    name,
    picture,
    createdAt: now,
    lastLoginAt: now,
  }

  users.set(user.id, user)
  return user
}

/**
 * Find user by Google ID
 * @param googleId - Google user ID (sub claim)
 * @returns User if found, null otherwise
 */
export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  for (const user of users.values()) {
    if (user.googleId === googleId) {
      return user
    }
  }
  return null
}

/**
 * Find user by email
 * @param email - User's email address
 * @returns User if found, null otherwise
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  for (const user of users.values()) {
    if (user.email.toLowerCase() === email.toLowerCase()) {
      return user
    }
  }
  return null
}

/**
 * Find user by ID
 * @param id - User's unique ID
 * @returns User if found, null otherwise
 */
export async function findUserById(id: string): Promise<User | null> {
  return users.get(id) || null
}

/**
 * Update user's last login timestamp
 * @param userId - User's unique ID
 * @returns Updated user
 */
export async function updateLastLogin(userId: string): Promise<User> {
  const user = users.get(userId)

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const updatedUser = {
    ...user,
    lastLoginAt: new Date().toISOString(),
  }

  users.set(userId, updatedUser)

  return updatedUser
}

/**
 * Update user profile information
 * @param userId - User's unique ID
 * @param updates - Partial user data to update
 * @returns Updated user
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const user = users.get(userId)

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const updatedUser = {
    ...user,
    ...updates,
    id: user.id, // Prevent ID from being changed
    createdAt: user.createdAt, // Prevent createdAt from being changed
  }

  users.set(userId, updatedUser)
  return updatedUser
}

/**
 * Delete all users (for testing only)
 */
export async function clearUsers(): Promise<void> {
  users.clear()
}

/**
 * Get all users (for testing/admin only)
 */
export async function getAllUsers(): Promise<User[]> {
  return Array.from(users.values())
}

/**
 * Check if a user with the given email already exists
 * @param email - Email to check
 * @returns True if user exists, false otherwise
 */
export async function userExists(email: string): Promise<boolean> {
  const user = await findUserByEmail(email)
  return user !== null
}
