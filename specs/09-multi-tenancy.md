# Multi-Tenancy Implementation Plan for Anki Interview App

## Overview
Transform the Anki Interview App from a single-tenant to a multi-tenant architecture where all users share a common question pool managed by admins, while each user maintains their own answer progress and study history.

## Design Decisions (Updated Based on User Input)
- **Question Model**: Shared question library - all users study from the same pool
- **Access Control**: Only admins can create, update, or delete questions
- **User Progress**: Each user has their own answer logs and study progress
- **Data Migration**: Archive existing data and start fresh
- **GitHub Sync**: Admin-only operation

## Implementation Phases

### Phase 1: Database Schema Updates

#### 1.1 Create Users Table Migration
Create `/backend/db/migrations/0002_add_users_table.sql`:
```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  google_id TEXT UNIQUE,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
```

#### 1.2 Archive and Recreate Tables Migration
Create `/backend/db/migrations/0003_archive_and_update_schema.sql`:
```sql
-- Archive existing tables
ALTER TABLE questions RENAME TO questions_archive;
ALTER TABLE answer_logs RENAME TO answer_logs_archive;

-- Create new questions table (shared across all users)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source TEXT NOT NULL,
  created_by TEXT,  -- Admin user who created/imported the question (for audit)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create new answer_logs table with user_id
CREATE TABLE answer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Create user_question_stats table for per-user question statistics
CREATE TABLE user_question_stats (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  last_answered_at DATETIME,
  last_difficulty TEXT CHECK(last_difficulty IN ('easy', 'medium', 'hard')),
  answer_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_questions_created_by ON questions(created_by);
CREATE INDEX idx_answer_logs_user_id ON answer_logs(user_id);
CREATE INDEX idx_answer_logs_user_question ON answer_logs(user_id, question_id);
CREATE INDEX idx_user_question_stats_last_answered ON user_question_stats(user_id, last_answered_at DESC);
```

### Phase 2: Backend Authentication Middleware

#### 2.1 Create JWT Verification Middleware
Create `/backend/src/middleware/auth.ts`:
- Verify JWT tokens from cookies
- Extract user ID and is_admin flag from session
- Attach user context to request
- Handle token expiration and invalid tokens
- Implement role-based access control

#### 2.2 Update Backend API Endpoints
Modify `/backend/src/index.ts`:
- Add authentication middleware to all routes
- Implement role-based access control for question management
- Filter answer logs and stats by authenticated user
- Shared question access for all users

Key endpoint updates:
- Study endpoints: All users can access shared questions, record answers per user
- Questions endpoints:
  - GET: All authenticated users can read
  - POST/PUT/DELETE: Admin-only operations
- Dashboard endpoints: Calculate stats per user from their answer_logs
- GitHub sync: Admin-only endpoint that adds questions to shared pool

### Phase 3: Backend User Management

#### 3.1 Create User API Routes
Add new endpoints in `/backend/src/routes/users.ts`:
- `POST /api/users` - Create user from Google OAuth
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update user profile
- `GET /api/users/:id` - Get user by ID (admin only)

### Phase 4: Frontend Updates

#### 4.1 Migrate User Storage
Update `/frontend/src/lib/users.ts`:
- Replace in-memory Map with API calls to backend
- Implement proper user CRUD operations via API
- Handle user creation during OAuth callback

#### 4.2 Update API Calls
Modify all frontend API calls to:
- Include `credentials: "include"` for cookie authentication
- Handle authentication errors (401/403)
- Ensure user context is properly passed

#### 4.3 Update OAuth Callback
Modify `/frontend/src/app/api/auth/callback/google/route.ts`:
- Create/update user in backend database
- Store user ID in JWT session
- Remove in-memory user storage

### Phase 5: Admin Features

#### 5.1 Create Admin Panel
Create `/frontend/src/app/admin/` pages:
- Question management interface (CRUD operations)
- GitHub sync configuration page
- User management interface
- System statistics dashboard

#### 5.2 Admin-Only Operations
- Question CRUD endpoints with admin role check
- GitHub sync restricted to admin users
- Questions added to shared pool (not user-specific)
- Audit trail via created_by field

### Phase 6: Testing and Validation

#### 6.1 Access Control Tests
- Verify only admins can create/update/delete questions
- Test that all users can read shared questions
- Ensure answer logs are properly isolated per user
- Verify dashboard shows only user's own progress

#### 6.2 Authentication Tests
- Test JWT verification on all endpoints
- Verify cookie-based authentication flow
- Test session expiration handling

## Critical Files to Modify

### Backend
1. `/backend/db/migrations/0002_add_users_table.sql` - New migration for users table
2. `/backend/db/migrations/0003_archive_and_update_schema.sql` - Archive and recreate with new schema
3. `/backend/src/middleware/auth.ts` - New JWT verification and role-based access control
4. `/backend/src/index.ts` - Add auth middleware and implement admin checks
5. `/backend/src/routes/users.ts` - New user management endpoints
6. `/backend/src/lib/dashboard.ts` - Update queries to filter answer_logs by user_id

### Frontend
1. `/frontend/src/lib/users.ts` - Replace in-memory storage with API calls
2. `/frontend/src/app/api/auth/callback/google/route.ts` - Create user in backend
3. `/frontend/src/app/study/page.tsx` - Ensure user context in API calls
4. `/frontend/src/app/questions/page.tsx` - Update for user-scoped questions
5. `/frontend/src/app/dashboard/hooks/useDashboardData.ts` - Include credentials

## Implementation Order

1. **Database Setup** (Phase 1)
   - Create and run migrations
   - Verify schema changes

2. **Backend Auth** (Phase 2)
   - Implement JWT middleware
   - Add to existing routes

3. **User Management** (Phase 3)
   - Create user endpoints
   - Test user CRUD operations

4. **Frontend Integration** (Phase 4)
   - Update user storage
   - Modify API calls

5. **Admin Features** (Phase 5)
   - Build admin panel
   - Configure GitHub sync

6. **Testing** (Phase 6)
   - Validate data isolation
   - Security testing

## Security Considerations

- Implement role-based access control (admin vs regular user)
- Validate admin privileges for question CRUD operations
- Ensure answer_logs are properly isolated per user
- Use parameterized queries to prevent SQL injection
- Implement rate limiting on user creation
- Ensure proper session expiration
- Audit trail via created_by field for questions

## Rollback Plan

If issues arise:
1. Keep archived tables (`questions_archive`, `answer_logs_archive`)
2. Create rollback migration to restore original schema
3. Frontend can temporarily use in-memory storage
4. Document any data changes for recovery

## Success Metrics

- All users can study from shared question pool
- Only admins can create/update/delete questions
- Each user's answer progress is isolated
- Dashboard shows per-user statistics correctly
- Admin panel properly restricts access
- No performance degradation with user filtering
- Clean migration with archived data preserved
