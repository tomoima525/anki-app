# Google Authentication Signup Flow Specification

## Overview

This document specifies the Google OAuth 2.0 authentication flow for the Anki Interview App, enabling users to sign up and log in using their Google accounts.

## Goals

1. Allow users to authenticate using their Google account
2. Automatically create user accounts on first Google login (signup)
3. Maintain backward compatibility with existing username/password authentication
4. Ensure secure session management with JWT tokens
5. Handle edge cases and error scenarios gracefully

## Architecture

### Technology Stack

- **OAuth Provider**: Google OAuth 2.0
- **Frontend**: Next.js App Router with Server Actions
- **Session Management**: JWT tokens stored in HTTP-only cookies
- **Token Signing**: HMAC with SHA-256 (HS256) using `jose` library
- **Database**: None (users stored in environment configuration for MVP)

### User Data Model

```typescript
interface User {
  id: string;           // Unique identifier (UUID or Google sub)
  email: string;        // User's email from Google
  name: string;         // User's display name from Google
  picture?: string;     // User's profile picture URL
  googleId: string;     // Google user ID (sub claim)
  createdAt: string;    // ISO timestamp of account creation
  lastLoginAt: string;  // ISO timestamp of last login
}
```

### Session Payload

```typescript
interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  iat: number;         // Issued at (timestamp)
  exp: number;         // Expiration (timestamp)
}
```

## Authentication Flow

### 1. Initial State

- User lands on `/login` page
- Page displays two authentication options:
  - Username/Password form (existing)
  - "Sign in with Google" button (new)

### 2. Google OAuth Initiation

**Trigger**: User clicks "Sign in with Google" button

**Frontend Action**:
```typescript
// Redirect to Google OAuth consent screen
const params = new URLSearchParams({
  client_id: process.env.GOOGLE_CLIENT_ID,
  redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/google`,
  response_type: 'code',
  scope: 'openid email profile',
  access_type: 'online',
  prompt: 'select_account',
})
window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
```

**Expected Behavior**:
- User is redirected to Google's OAuth consent screen
- User selects Google account and grants permissions
- Google redirects back to callback URL with authorization code

### 3. OAuth Callback Processing

**Endpoint**: `POST /api/auth/callback/google`

**Input**: Authorization code from Google

**Process**:

1. **Exchange code for tokens**:
   ```typescript
   const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams({
       code: authorizationCode,
       client_id: process.env.GOOGLE_CLIENT_ID!,
       client_secret: process.env.GOOGLE_CLIENT_SECRET!,
       redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/google`,
       grant_type: 'authorization_code',
     }),
   })
   ```

2. **Verify and decode ID token**:
   ```typescript
   // Decode JWT without verification (Google tokens are pre-verified)
   const idToken = tokenData.id_token
   const decoded = decodeJwt(idToken) as GoogleIdToken
   ```

3. **Extract user information**:
   ```typescript
   const googleUser = {
     googleId: decoded.sub,
     email: decoded.email,
     name: decoded.name,
     picture: decoded.picture,
     emailVerified: decoded.email_verified,
   }
   ```

4. **Check if user exists**:
   - Look up user by `googleId` in user store
   - If not found, this is a **signup**

5. **Create or update user**:
   ```typescript
   if (!existingUser) {
     // SIGNUP: Create new user
     user = {
       id: crypto.randomUUID(),
       googleId: googleUser.googleId,
       email: googleUser.email,
       name: googleUser.name,
       picture: googleUser.picture,
       createdAt: new Date().toISOString(),
       lastLoginAt: new Date().toISOString(),
     }
     await saveUser(user)
   } else {
     // LOGIN: Update last login time
     user = existingUser
     user.lastLoginAt = new Date().toISOString()
     await updateUser(user)
   }
   ```

6. **Create session**:
   ```typescript
   const sessionToken = await createSession({
     userId: user.id,
     email: user.email,
     name: user.name,
   })
   ```

7. **Set session cookie**:
   ```typescript
   const cookieConfig = getSessionCookieConfig()
   cookies().set(cookieConfig.name, sessionToken, cookieConfig.options)
   ```

8. **Redirect to app**:
   ```typescript
   redirect('/study')
   ```

### 4. Session Validation

**Middleware**: `/frontend/src/middleware.ts`

**Process**:
1. Extract session token from cookie
2. Verify token using `verifySession(token)`
3. If valid, allow request to proceed
4. If invalid, redirect to `/login`

**Protected Routes**:
- `/study`
- `/questions/*`
- Any route except `/login` and `/api/login`

## API Endpoints

### `GET /api/auth/google`

Initiates Google OAuth flow by redirecting to Google consent screen.

**Response**: HTTP 302 redirect to Google OAuth URL

**Error Handling**:
- Missing environment variables → 500 with error message

---

### `GET /api/auth/callback/google`

Handles OAuth callback from Google.

**Query Parameters**:
- `code`: Authorization code from Google
- `error`: Error code if user denied access

**Response**:
- Success: HTTP 302 redirect to `/study` with session cookie
- Failure: HTTP 302 redirect to `/login?error=google_auth_failed`

**Error Scenarios**:
- `error=access_denied`: User denied Google permissions
- Missing authorization code: Invalid callback
- Token exchange failure: Google API error
- Invalid ID token: Malformed response

---

### `GET /api/auth/session`

Returns current session information.

**Response**:
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Unauthenticated Response**:
```json
{
  "authenticated": false
}
```

## Security Considerations

### 1. Token Validation

- ID tokens from Google are validated by verifying signature (optional, can trust Google's tokens)
- Session tokens are always verified using HMAC signature
- Expired tokens are rejected

### 2. Cookie Security

```typescript
{
  httpOnly: true,          // Prevents XSS attacks
  secure: true,            // HTTPS only in production
  sameSite: 'lax',         // CSRF protection
  maxAge: 604800,          // 7 days
  path: '/',               // Available site-wide
}
```

### 3. CSRF Protection

- Use `state` parameter in OAuth flow to prevent CSRF
- Generate random state value and store in session storage
- Verify state matches on callback

### 4. Environment Variables

Required configuration:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Session
SESSION_SECRET=random-secret-at-least-32-characters-long
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800

# Application
NEXTAUTH_URL=http://localhost:3000  # Production: https://your-domain.com
```

### 5. User Privacy

- Only request necessary OAuth scopes: `openid email profile`
- Do not store unnecessary user data
- Provide clear privacy policy on consent screen

## Error Handling

### User-Facing Errors

| Scenario | Action | User Message |
|----------|--------|--------------|
| User denies OAuth | Redirect to `/login?error=access_denied` | "Google authentication was cancelled. Please try again." |
| Token exchange fails | Redirect to `/login?error=auth_failed` | "Authentication failed. Please try again." |
| Network error | Redirect to `/login?error=network_error` | "Network error. Please check your connection." |
| Missing configuration | Show 500 error page | "Service temporarily unavailable." |

### Backend Errors

- Log all errors with context (user email, error type, timestamp)
- Do not expose internal error details to users
- Use structured error codes for monitoring

## Testing Requirements

### Unit Tests

1. **Google OAuth utilities** (`src/lib/google-oauth.ts`):
   - ✓ Generate authorization URL with correct parameters
   - ✓ Exchange authorization code for tokens
   - ✓ Decode and validate ID token
   - ✓ Extract user information from ID token
   - ✓ Handle token exchange errors
   - ✓ Handle invalid ID tokens

2. **User management** (`src/lib/users.ts`):
   - ✓ Create new user from Google data
   - ✓ Find user by Google ID
   - ✓ Find user by email
   - ✓ Update user last login timestamp
   - ✓ Handle duplicate user creation

### Integration Tests

3. **OAuth callback endpoint** (`/api/auth/callback/google`):
   - ✓ Successful authentication creates session
   - ✓ First-time user creates account (signup)
   - ✓ Existing user updates last login
   - ✓ Session cookie is set correctly
   - ✓ Redirects to `/study` on success
   - ✓ Handles missing authorization code
   - ✓ Handles Google API errors
   - ✓ Handles access denied error
   - ✓ Validates state parameter (CSRF protection)

4. **Session validation**:
   - ✓ Valid session allows access to protected routes
   - ✓ Expired session redirects to login
   - ✓ Missing session redirects to login
   - ✓ Tampered session is rejected

### End-to-End Tests

5. **Complete signup flow**:
   - ✓ User clicks "Sign in with Google"
   - ✓ Redirects to Google consent screen
   - ✓ After consent, creates account and session
   - ✓ User lands on `/study` page
   - ✓ User can access protected routes

6. **Complete login flow** (existing user):
   - ✓ User clicks "Sign in with Google"
   - ✓ Existing account is recognized
   - ✓ Session is created
   - ✓ User lands on `/study` page

## Implementation Checklist

### Backend Implementation

- [ ] Create `src/lib/google-oauth.ts` with OAuth utilities
- [ ] Create `src/lib/users.ts` with user management functions
- [ ] Create `/api/auth/google/route.ts` for OAuth initiation
- [ ] Create `/api/auth/callback/google/route.ts` for OAuth callback
- [ ] Update `src/lib/session.ts` to support Google user sessions
- [ ] Add environment variable validation on startup

### Frontend Implementation

- [ ] Add "Sign in with Google" button to `/login` page
- [ ] Add loading state during OAuth flow
- [ ] Add error message display for OAuth failures
- [ ] Update session hook to support Google users
- [ ] Add profile picture display (if available)

### Testing Implementation

- [x] Set up Vitest testing framework
- [ ] Write unit tests for Google OAuth utilities
- [ ] Write unit tests for user management
- [ ] Write integration tests for OAuth callback
- [ ] Write integration tests for session validation
- [ ] Configure test environment variables
- [ ] Add GitHub Actions workflow for CI

### DevOps

- [ ] Set up Google Cloud Console project
- [ ] Configure OAuth consent screen
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized redirect URIs
- [ ] Set up production environment variables
- [ ] Update deployment documentation

## Migration Strategy

### Phase 1: Add Google Auth (Parallel)

- Deploy Google auth alongside existing username/password auth
- Both methods work independently
- Existing users continue using username/password

### Phase 2: Monitor and Iterate

- Monitor Google auth usage and errors
- Collect user feedback
- Fix bugs and improve UX

### Phase 3: Future Enhancements (Optional)

- Allow account linking (merge Google and username/password accounts)
- Add other OAuth providers (GitHub, Microsoft)
- Implement multi-factor authentication
- Add user profile management

## Success Metrics

- **Signup success rate**: % of users who complete Google signup
- **Login success rate**: % of successful Google logins
- **Error rate**: % of OAuth flows that fail
- **Session duration**: Average time users stay logged in
- **Adoption rate**: % of new users choosing Google auth vs. username/password

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OpenID Connect Specification](https://openid.net/connect/)
- [Next.js Authentication Patterns](https://nextjs.org/docs/authentication)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
