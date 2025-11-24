# Anki Interview Frontend

Next.js frontend application for the Anki Interview App.

## Overview

A single-page application for spaced repetition study sessions with interview questions.

## Features

- **Authentication**: Google OAuth 2.0 with JWT-based session management
- **Study Flow**: Spaced repetition interface for reviewing questions
- **Question Management**: Browse and manage interview questions
- **GitHub Sync**: Import questions from GitHub repositories

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 18 with Tailwind CSS
- **Authentication**: Google OAuth 2.0 + JWT (jose library)
- **Deployment**: Cloudflare Pages

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Build for Cloudflare Pages
pnpm pages:build
```

The app will be available at `http://localhost:3000`.

## Environment Variables

Create a `.env.local` file:

```env
# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Session configuration
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800  # 7 days in seconds
```

### Google OAuth Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (development)
5. Add production redirect URI: `https://your-domain.com/api/auth/callback/google`
6. Copy Client ID and Client Secret to environment variables

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── api/         # API routes (login, logout, session)
│   ├── login/       # Login page
│   ├── study/       # Study interface
│   ├── layout.tsx   # Root layout
│   └── page.tsx     # Home page (redirects to /study)
├── components/      # React components
│   └── LogoutButton.tsx
├── lib/            # Utility libraries
│   ├── google-oauth.ts  # Google OAuth utilities
│   ├── users.ts    # User management
│   └── session.ts  # Session management
└── middleware.ts   # Route protection middleware
```

## Authentication

The app uses Google OAuth 2.0 authentication with the following flow:

1. User clicks "Sign in with Google" at `/login`
2. User is redirected to Google OAuth consent screen
3. After consent, Google redirects back with authorization code
4. Backend exchanges code for tokens and creates user account (if new)
5. JWT session token created and stored in HTTP-only cookie
6. Middleware protects all routes except `/login` and OAuth callback
7. Session expires after 7 days (configurable)

## Deployment

Deploy to Cloudflare Pages for dev:

```bash
pnpm pages:build
npx wrangler pages deploy .vercel/output/static --project-name=anki-interview-app
```

Set environment variables in Cloudflare dashboard:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same as GOOGLE_CLIENT_ID)
- `SESSION_SECRET`
