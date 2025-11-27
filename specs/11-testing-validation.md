# Multi-Tenancy Testing and Validation

## Overview

This document describes the testing strategy and validation procedures for the multi-tenant Anki Interview App implementation.

## Test Categories

### 1. Access Control Tests (`backend/src/__tests__/access-control.test.ts`)

Verifies role-based access control for admin-only operations.

#### Test Cases

**Question Management**
- ✅ Admin users can delete questions
- ✅ Regular users cannot delete questions (403 Forbidden)
- ✅ All authenticated users can read questions
- ✅ Unauthenticated users cannot read questions (401 Unauthorized)

**GitHub Sync**
- ✅ Admin users can trigger GitHub sync
- ✅ Regular users cannot trigger GitHub sync (403 Forbidden)

**User Management**
- ✅ Admin users can list all users
- ✅ Regular users cannot list all users (403 Forbidden)
- ✅ All users can get their own profile
- ✅ Admin users can get any user by ID
- ✅ Regular users cannot get other users by ID (403 Forbidden)

### 2. Data Isolation Tests (`backend/src/__tests__/data-isolation.test.ts`)

Verifies that user data is properly isolated and secure.

#### Test Cases

**Answer Logs Isolation**
- ✅ Users only see their own answer logs
- ✅ Answer logs are filtered by user_id
- ✅ Different users studying same question maintain separate logs

**Dashboard Isolation**
- ✅ Daily stats show only user's own data
- ✅ Activity trends filtered by user
- ✅ Mastery progress calculated per user
- ✅ Study streaks are user-specific
- ✅ Review queue shows only user's questions

**Shared Question Pool**
- ✅ All users access the same question pool
- ✅ Users can study questions independently
- ✅ Question content is shared, progress is isolated

### 3. Authentication Tests (`backend/src/__tests__/authentication.test.ts`)

Verifies JWT verification and session handling.

#### Test Cases

**JWT Token Verification**
- ✅ Requests without authentication are rejected (401)
- ✅ Invalid tokens are rejected (401)
- ✅ Malformed tokens are rejected (401)

**Protected Endpoints**
- ✅ All study endpoints require authentication
- ✅ All question endpoints require authentication
- ✅ All dashboard endpoints require authentication
- ✅ All user endpoints require authentication
- ✅ GitHub sync requires authentication

**User Context**
- ✅ Authenticated requests attach user context
- ✅ User existence is verified in database

**Admin Role Verification**
- ✅ Admin role is verified for protected operations
- ✅ Non-admin users cannot access admin endpoints

## Integration Validation Script

### Usage

The validation script (`backend/scripts/validate-multi-tenancy.ts`) performs end-to-end validation of multi-tenant features.

```bash
# Run validation
tsx backend/scripts/validate-multi-tenancy.ts

# With custom API URL
API_URL=https://your-api.com tsx backend/scripts/validate-multi-tenancy.ts

# With authentication tokens (for full validation)
ADMIN_TOKEN=<admin-token> \
USER_TOKEN=<user-token> \
USER2_TOKEN=<another-user-token> \
tsx backend/scripts/validate-multi-tenancy.ts
```

### What It Tests

1. **Health Check** - Verifies API is accessible
2. **Unauthenticated Access** - Confirms protected endpoints reject unauthenticated requests
3. **Regular User Access** - Validates user can access allowed endpoints
4. **Admin Access** - Verifies admin can access admin-only endpoints
5. **Data Isolation** - Confirms each user sees only their own data

### Getting Test Tokens

To get authentication tokens for testing:

1. **Login as Admin**:
   - Open browser DevTools
   - Login to app as admin user
   - Go to Application/Storage → Cookies
   - Copy value of `anki_session` cookie
   - Set as `ADMIN_TOKEN`

2. **Login as Regular User**:
   - Use incognito/private window
   - Login as regular user
   - Copy `anki_session` cookie
   - Set as `USER_TOKEN`

3. **Login as Second User** (optional):
   - Use another incognito window
   - Login as different user
   - Copy `anki_session` cookie
   - Set as `USER2_TOKEN`

## Manual Testing Checklist

### Setup

- [ ] Backend is running (`pnpm dev:backend`)
- [ ] Frontend is running (`pnpm dev:frontend`)
- [ ] Database has been migrated
- [ ] At least one admin user exists
- [ ] At least one regular user exists
- [ ] Some questions exist in database

### Access Control

- [ ] Login as admin user
- [ ] Access `/admin` page - should load successfully
- [ ] Navigate to admin questions page
- [ ] Delete a question - should succeed
- [ ] Logout
- [ ] Login as regular user
- [ ] Try to access `/admin` page - should redirect to login
- [ ] Try to delete a question via API - should return 403

### Data Isolation

- [ ] Login as User A
- [ ] Answer 3 questions with different difficulties
- [ ] Note the dashboard statistics
- [ ] Logout
- [ ] Login as User B
- [ ] Answer 2 different questions
- [ ] Verify dashboard shows different statistics
- [ ] Verify questions list is the same (shared pool)
- [ ] Verify answer logs only show User B's answers

### Question Pool

- [ ] Login as User A
- [ ] View questions list - note the questions
- [ ] Logout
- [ ] Login as User B
- [ ] View questions list - should see same questions
- [ ] Both users can study any question

### Admin Operations

- [ ] Login as admin
- [ ] Access admin panel
- [ ] Trigger GitHub sync (if configured)
- [ ] View all users list
- [ ] View system statistics
- [ ] Logout
- [ ] Login as regular user
- [ ] Try to access `/api/users` endpoint - should fail with 403
- [ ] Try to trigger GitHub sync - should fail with 403

## Validation Criteria

### ✅ Pass Criteria

- All unit tests pass
- Integration validation script passes all checks
- Manual testing checklist completed
- No unauthorized access possible
- Data isolation maintained
- Shared question pool accessible to all users
- Admin operations restricted to admins only

### ❌ Fail Criteria

- Any test fails
- Users can access other users' data
- Regular users can perform admin operations
- Questions are not shared across users
- Authentication can be bypassed

## Security Considerations

### Verified

- ✅ JWT tokens are properly verified
- ✅ User existence is checked in database
- ✅ Admin role is verified for sensitive operations
- ✅ Answer logs are filtered by user_id
- ✅ Dashboard queries include user_id filter
- ✅ Cookies are HTTP-only
- ✅ CORS is properly configured

### Best Practices

- Use parameterized queries (D1 prepared statements)
- Never trust client-provided user_id
- Always get user_id from verified JWT token
- Implement rate limiting for user creation
- Log admin operations for audit trail
- Regular security audits

## Troubleshooting

### Common Issues

**Tests fail with 401**
- Check that test tokens are valid
- Verify SESSION_SECRET is set correctly
- Ensure cookies are being sent with requests

**Tests fail with 403**
- Verify user has correct admin status in database
- Check that adminMiddleware is working
- Confirm is_admin flag is set correctly

**Data isolation tests fail**
- Verify all dashboard queries include user_id filter
- Check that answer_logs table has user_id column
- Ensure user_question_stats table exists

## Running Tests

### Unit Tests (Vitest)

```bash
cd backend
pnpm test
```

### Integration Tests

```bash
cd backend
tsx scripts/validate-multi-tenancy.ts
```

### Frontend Tests

```bash
cd frontend
pnpm test
```

## CI/CD Integration

Recommended GitHub Actions workflow:

```yaml
name: Multi-Tenancy Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test:backend
      - run: tsx backend/scripts/validate-multi-tenancy.ts
```

## Future Enhancements

- [ ] Add performance tests for large user bases
- [ ] Implement load testing for concurrent users
- [ ] Add E2E tests with Playwright
- [ ] Create automated regression test suite
- [ ] Add database migration tests
- [ ] Implement security penetration testing
