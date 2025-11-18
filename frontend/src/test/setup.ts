import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, vi } from 'vitest'

// Mock environment variables
process.env.SESSION_SECRET = 'test-secret-key-that-is-at-least-32-characters-long'
process.env.SESSION_COOKIE_NAME = 'anki_session'
process.env.SESSION_MAX_AGE = '604800'
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// Setup global test configuration
beforeAll(() => {
  // Setup any global test configuration
})

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks()
})

afterAll(() => {
  // Cleanup after all tests
})
