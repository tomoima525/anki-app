/**
 * User management utilities
 * Handles user creation, lookup, and updates via backend API
 */

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  google_id?: string
  is_admin?: boolean
  created_at: string
  last_login_at: string
}

// Backend API base URL
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side: use backend URL from environment or default
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
  }
  // Client-side: use same origin or environment variable
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
}

/**
 * Create a new user from Google OAuth data
 * @param googleId - Google user ID (sub claim)
 * @param email - User's email
 * @param name - User's display name
 * @param picture - User's profile picture URL (optional)
 * @returns Created or updated user
 */
export async function createUserFromGoogle(
  googleId: string,
  email: string,
  name: string,
  picture?: string
): Promise<User> {
  const userId = crypto.randomUUID()

  const response = await fetch(`${getApiBaseUrl()}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      id: userId,
      email,
      name,
      picture,
      googleId,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create user: ${response.statusText}`)
  }

  const data = (await response.json()) as { user: User; created: boolean }
  return data.user
}

/**
 * Find user by Google ID
 * @deprecated Use createUserFromGoogle which handles both creation and lookup
 * @param googleId - Google user ID (sub claim)
 * @returns User if found, null otherwise
 */
export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  // This function is deprecated - the backend creates users via POST /api/users
  // which handles both creation and lookup based on google_id
  console.warn('findUserByGoogleId is deprecated - use createUserFromGoogle instead')
  return null
}

/**
 * Find user by email
 * @deprecated Use createUserFromGoogle which handles both creation and lookup
 * @param email - User's email address
 * @returns User if found, null otherwise
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  // This function is deprecated - the backend creates users via POST /api/users
  console.warn('findUserByEmail is deprecated - use createUserFromGoogle instead')
  return null
}

/**
 * Get current authenticated user
 * @returns Current user if authenticated, null otherwise
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/users/me`, {
      credentials: 'include',
    })

    if (!response.ok) {
      if (response.status === 401) {
        return null
      }
      throw new Error(`Failed to get current user: ${response.statusText}`)
    }

    const data = (await response.json()) as { user: User }
    return data.user
  } catch (error) {
    console.error('Get current user error:', error)
    return null
  }
}

/**
 * Find user by ID (admin only)
 * @param id - User's unique ID
 * @returns User if found, null otherwise
 */
export async function findUserById(id: string): Promise<User | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/users/${id}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as { user: User }
    return data.user
  } catch (error) {
    console.error('Find user by ID error:', error)
    return null
  }
}

/**
 * Update user's last login timestamp
 * @deprecated Backend handles this automatically via POST /api/users
 * @param userId - User's unique ID
 * @returns Updated user
 */
export async function updateLastLogin(userId: string): Promise<User> {
  // This is now handled automatically by the backend when creating/updating users
  console.warn('updateLastLogin is deprecated - backend handles this automatically')
  const user = await getCurrentUser()
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }
  return user
}

/**
 * Update user profile information
 * @param updates - Partial user data to update (name, picture)
 * @returns Updated user
 */
export async function updateUser(updates: { name?: string; picture?: string }): Promise<User> {
  const response = await fetch(`${getApiBaseUrl()}/api/users/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    throw new Error(`Failed to update user: ${response.statusText}`)
  }

  const data = (await response.json()) as { user: User }
  return data.user
}

/**
 * Delete all users (for testing only)
 * @deprecated No longer supported - users are managed in database
 */
export async function clearUsers(): Promise<void> {
  console.warn('clearUsers is deprecated - users are now managed in database')
}

/**
 * Get all users (admin only, paginated)
 * @param limit - Number of users to fetch (default: 50)
 * @param offset - Offset for pagination (default: 0)
 * @returns List of users and pagination info
 */
export async function getAllUsers(limit = 50, offset = 0): Promise<{
  users: User[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/users?limit=${limit}&offset=${offset}`,
      {
        credentials: 'include',
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to get users: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Get all users error:', error)
    return {
      users: [],
      pagination: { total: 0, limit, offset, hasMore: false },
    }
  }
}

/**
 * Check if a user with the given email already exists
 * @deprecated Use createUserFromGoogle which handles both creation and lookup
 * @param email - Email to check
 * @returns True if user exists, false otherwise
 */
export async function userExists(email: string): Promise<boolean> {
  console.warn('userExists is deprecated - use createUserFromGoogle instead')
  return false
}
