# Testing Guide

This guide explains how to test the multi-tenancy implementation of the Anki Interview App.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run validation script
pnpm validate

# Run tests with coverage
pnpm test:coverage
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

### Getting Authentication Tokens

1. **Open browser DevTools** (F12)
2. **Login to the app**
3. **Go to Application → Cookies**
4. **Copy `anki_session` cookie value**
5. **Set as environment variable**:
   ```bash
   export ADMIN_TOKEN=<admin-session-token>
   export USER_TOKEN=<user-session-token>
   export USER2_TOKEN=<another-user-token>  # Optional
   ```

### What Gets Validated

✅ **Health Check** - API is accessible
✅ **Unauthenticated Access** - Protected endpoints reject requests
✅ **User Access** - Users can access allowed endpoints
✅ **User Restrictions** - Users cannot access admin endpoints
✅ **Admin Access** - Admins can access admin-only endpoints
✅ **Data Isolation** - Each user sees only their own data
✅ **Shared Resources** - All users access same question pool

## Manual Testing

### Prerequisites

- Backend running: `pnpm dev:backend`
- Frontend running: `pnpm dev:frontend`
- Database migrated
- At least 1 admin user
- At least 2 regular users
- Some questions in database

### Access Control Checklist

- [ ] Login as admin → access `/admin` → should succeed
- [ ] Login as regular user → access `/admin` → should redirect
- [ ] Admin can delete questions
- [ ] Regular user cannot delete questions (403)
- [ ] Admin can trigger GitHub sync
- [ ] Regular user cannot trigger GitHub sync (403)
- [ ] Admin can view all users
- [ ] Regular user cannot view all users (403)

### Data Isolation Checklist

- [ ] User A answers 3 questions
- [ ] User B answers 2 different questions
- [ ] User A dashboard shows User A's stats only
- [ ] User B dashboard shows User B's stats only
- [ ] Both users see same question pool
- [ ] Answer logs are separate

## Test Environment Setup

### Local Development

1. **Start backend**:
   ```bash
   cd backend
   pnpm dev
   ```

2. **Run migrations**:
   ```bash
   pnpm db:migrate
   ```

3. **Create test users** (via Google OAuth or direct database):
   ```sql
   INSERT INTO users (id, email, name, is_admin, created_at, last_login_at)
   VALUES
     ('admin-user-id', 'admin@test.com', 'Admin User', 1, datetime('now'), datetime('now')),
     ('user1-id', 'user1@test.com', 'User One', 0, datetime('now'), datetime('now')),
     ('user2-id', 'user2@test.com', 'User Two', 0, datetime('now'), datetime('now'));
   ```

4. **Add test questions**:
   ```bash
   pnpm db:seed
   ```

### CI/CD Environment

Set up the following secrets in your CI/CD:
- `TEST_API_URL` - API base URL
- `TEST_ADMIN_TOKEN` - Admin session token
- `TEST_USER_TOKEN` - Regular user token

## Troubleshooting

### Tests fail with 401

**Problem**: Authentication errors
**Solution**:
- Check SESSION_SECRET is set
- Verify tokens are valid and not expired
- Ensure cookies are being sent correctly

### Tests fail with 403

**Problem**: Authorization errors
**Solution**:
- Verify user has correct is_admin status in database
- Check adminMiddleware is working
- Confirm JWT contains correct user info

### Data isolation tests fail

**Problem**: Users seeing other users' data
**Solution**:
- Verify all queries include user_id filter
- Check middleware attaches correct user context
- Ensure answer_logs and user_question_stats have user_id

### Validation script hangs

**Problem**: Script doesn't complete
**Solution**:
- Check API is running
- Verify API_URL is correct
- Look for network/firewall issues

## Writing New Tests

### Structure

```typescript
import { describe, it, expect, beforeAll } from "vitest";

describe("Feature Name", () => {
  const API_URL = process.env.TEST_API_URL || "http://localhost:8787";

  beforeAll(async () => {
    // Setup test data
  });

  describe("Specific Behavior", () => {
    it("should do something", async () => {
      // Arrange
      const token = "test-token";

      // Act
      const response = await fetch(`${API_URL}/api/endpoint`, {
        headers: { Cookie: `anki_session=${token}` },
      });

      // Assert
      expect(response.status).toBe(200);
    });
  });
});
```

### Best Practices

- Use descriptive test names
- Test one thing per test
- Clean up test data
- Use proper assertions
- Mock external dependencies
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
      - run: pnpm validate
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Multi-Tenancy Testing Guide](../specs/11-testing-validation.md)
