# Testing Guide

This guide explains how to test the multi-tenancy implementation of the Anki Interview App.

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up test environment
cp .env.test.example .env.test
# Edit .env.test and set your SESSION_SECRET (must match production)

# Run unit tests
pnpm test

or

SESSION_SECRET=xxxx pnpm test

# Run validation script
pnpm validate

# Run tests with coverage
pnpm test:coverage
```

## Environment Setup

### 1. Configure SESSION_SECRET

**Important**: Your test `SESSION_SECRET` must match your production secret to generate valid tokens.

```bash
# Copy from your .env file or wrangler.toml
# Option 1: Copy the test template
cp .env.test.example .env.test

# Option 2: Use the same secret as production
grep SESSION_SECRET ../.env >> .env.test
```

Edit `.env.test`:

```bash
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars
TEST_API_URL=http://localhost:8787
```

### 2. Verify Configuration

Run this to check if the secret is loaded:

```bash
pnpm test -- --reporter=verbose
```

You should see the session secret being used (first 10 chars will be logged).

## Creating Test Tokens

The test helper provides functions to create JWT tokens for testing.

### Basic Usage

```typescript
import { createTestToken, createTestTokens } from "./__tests__/helpers";

// Create a single token
const token = await createTestToken(
  "user-id",
  "email@example.com",
  "User Name",
  false // isAdmin
);

// Create admin, user, and user2 tokens automatically
const tokens = await createTestTokens();
// Returns: { adminToken, adminUserId, userToken, regularUserId, user2Token, user2Id }
```

### Using Your Own User Data

If you want to create tokens with your actual user ID and email:

```typescript
import { createTestToken } from "./__tests__/helpers";

beforeAll(async () => {
  // Create admin token with your user data
  adminToken = await createTestToken(
    "c5996861-8575-4437-9e90-69c9abe26b74",
    "tomoima525@gmail.com",
    "Tomoaki Imai",
    true // isAdmin - set to true for admin tests
  );

  // Create regular user token
  userToken = await createTestToken(
    "regular-user-id",
    "user@test.com",
    "Regular User",
    false
  );
});
```

### Helper Functions Available

```typescript
// Create a single token
createTestToken(userId, email, name, isAdmin): Promise<string>

// Create admin, user, and user2 tokens
createTestTokens(): Promise<{
  adminToken: string;
  adminUserId: string;
  userToken: string;
  regularUserId: string;
  user2Token: string;
  user2Id: string;
}>

// Create test users in database (for integration tests)
createTestUsers(db, tokens): Promise<void>

// Create a test question
createTestQuestion(db, questionText?, answerText?, source?): Promise<string>

// Create test answer log
createTestAnswerLog(db, userId, questionId, difficulty): Promise<void>

// Clean up test data
cleanupTestData(db, userIds): Promise<void>
```

## Test Suites

### 1. Access Control Tests

Location: `src/__tests__/access-control.test.ts`

Tests role-based access control for admin operations.

```bash
vitest run src/__tests__/access-control.test.ts
```

**What it tests:**

- Admin-only operations (delete questions, GitHub sync, user management)
- Regular user access restrictions
- Shared resource access (questions, study endpoints)

### 2. Data Isolation Tests

Location: `src/__tests__/data-isolation.test.ts`

Verifies that user data is properly isolated.

```bash
vitest run src/__tests__/data-isolation.test.ts
```

**What it tests:**

- Answer logs are user-specific
- Dashboard shows only user's own data
- Shared question pool accessible to all users

### 3. Authentication Tests

Location: `src/__tests__/authentication.test.ts`

Validates JWT verification and session handling.

```bash
vitest run src/__tests__/authentication.test.ts
```

**What it tests:**

- JWT token verification
- Protected endpoint access
- Cookie handling
- Admin role verification

## Integration Validation

### Running the Validation Script

The validation script performs end-to-end testing of multi-tenant features.

```bash
# Basic validation (health check + unauthenticated tests)
pnpm validate

# Full validation with authentication
ADMIN_TOKEN=<token> USER_TOKEN=<token> pnpm validate

# Custom API URL
API_URL=https://your-api.com pnpm validate
```

### Getting Authentication Tokens for Validation

#### Method 1: From Browser (Real Session)

1. **Open browser DevTools** (F12)
2. **Login to the app**
3. **Go to Application → Cookies**
4. **Copy `anki_session` cookie value**
5. **Set as environment variable**:
   ```bash
   export ADMIN_TOKEN=<admin-session-token>
   export USER_TOKEN=<user-session-token>
   ```

#### Method 2: Generate Test Tokens (For Testing)

Create `generate-tokens.ts`:

```typescript
import { createTestToken } from "./src/__tests__/helpers";

async function generateTokens() {
  const adminToken = await createTestToken(
    "c5996861-8575-4437-9e90-69c9abe26b74",
    "tomoima525@gmail.com",
    "Tomoaki Imai",
    true // admin
  );

  const userToken = await createTestToken(
    "regular-user-id",
    "user@test.com",
    "User Name",
    false
  );

  console.log("export ADMIN_TOKEN=" + adminToken);
  console.log("export USER_TOKEN=" + userToken);
}

generateTokens();
```

Run it:

```bash
tsx generate-tokens.ts
```

Then use the tokens:

```bash
# Copy the export commands from output
export ADMIN_TOKEN=eyJhbGc...
export USER_TOKEN=eyJhbGc...

# Run validation
pnpm validate
```

### What Gets Validated

✅ **Health Check** - API is accessible
✅ **Unauthenticated Access** - Protected endpoints reject requests
✅ **User Access** - Users can access allowed endpoints
✅ **User Restrictions** - Users cannot access admin endpoints
✅ **Admin Access** - Admins can access admin-only endpoints
✅ **Data Isolation** - Each user sees only their own data
✅ **Shared Resources** - All users access same question pool

## Troubleshooting

### SESSION_SECRET not loading in tests

**Problem**: `process.env.SESSION_SECRET` is undefined in tests

**Solution**:

1. **Check `.env.test` exists**:

   ```bash
   ls -la .env.test
   ```

2. **Verify content**:

   ```bash
   cat .env.test | grep SESSION_SECRET
   ```

3. **Ensure vitest config loads it**:
   The `vitest.config.ts` file should have:

   ```typescript
   env: {
     SESSION_SECRET: process.env.SESSION_SECRET || "fallback-value";
   }
   ```

4. **Pass via command line**:
   ```bash
   SESSION_SECRET=your-secret pnpm test
   ```

### Tests fail with 401

**Problem**: Authentication errors

**Solution**:

- Verify `SESSION_SECRET` matches production
- Check tokens are valid and not expired
- Ensure cookies are being sent correctly
- Make sure test users exist in database

### Tests fail with 403

**Problem**: Authorization errors

**Solution**:

- Verify user has correct `is_admin` status in database
- Check `adminMiddleware` is working
- Confirm JWT contains correct user info

### Token generation fails

**Problem**: Cannot create test tokens

**Solution**:

```bash
# Check SESSION_SECRET is set
echo $SESSION_SECRET

# Or use fallback in code
const secret = process.env.SESSION_SECRET || "test-secret-min-32-chars-long";
```

## Environment Variables

```bash
# Required for backend (set in .env.test)
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars

# Optional for tests
TEST_API_URL=http://localhost:8787  # API base URL
ADMIN_TOKEN=<jwt-token>             # Admin session token
USER_TOKEN=<jwt-token>              # Regular user token
USER2_TOKEN=<jwt-token>             # Second user token (optional)
```

## Writing New Tests

### Structure

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createTestTokens } from "./helpers";

describe("Feature Name", () => {
  const API_URL = process.env.TEST_API_URL || "http://localhost:8787";
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const tokens = await createTestTokens();
    adminToken = tokens.adminToken;
    userToken = tokens.userToken;
  });

  describe("Specific Behavior", () => {
    it("should do something", async () => {
      const response = await fetch(`${API_URL}/api/endpoint`, {
        headers: { Cookie: `anki_session=${userToken}` },
      });

      expect(response.status).toBe(200);
    });
  });
});
```

### Best Practices

- Use descriptive test names
- Test one thing per test
- Clean up test data in afterAll
- Use proper assertions
- Mock external dependencies when needed
- Test edge cases
- Document complex tests

## Coverage Reports

Generate coverage report:

```bash
pnpm test:coverage
```

View coverage in browser:

```bash
open coverage/index.html
```

## Continuous Integration

Example GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test:coverage
        env:
          SESSION_SECRET: ${{ secrets.SESSION_SECRET }}
      - run: pnpm validate
        env:
          SESSION_SECRET: ${{ secrets.SESSION_SECRET }}
          ADMIN_TOKEN: ${{ secrets.TEST_ADMIN_TOKEN }}
          USER_TOKEN: ${{ secrets.TEST_USER_TOKEN }}
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Environment Variables](https://vitest.dev/config/#env)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Multi-Tenancy Testing Guide](../specs/11-testing-validation.md)
