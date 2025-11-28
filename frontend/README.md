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
- **Deployment**: Vercel (Global Edge Network)

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server locally
pnpm start
```

The app will be available at `http://localhost:3000`.

## Environment Variables

Create a `.env.local` file for local development:

```env
# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Session configuration
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800  # 7 days in seconds

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
```

For production deployment on Vercel, configure these via the Vercel Dashboard.

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

This frontend is deployed to Vercel using GitHub integration for automatic deployments.

### Setup

1. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "Add New Project"
   - Import your repository
   - Select `frontend` directory as the root directory
   - Vercel will auto-detect Next.js configuration

2. **Configure Environment Variables**

   Add these environment variables in the Vercel Dashboard (Settings > Environment Variables):

   - `SESSION_SECRET` - Your JWT signing key (sensitive)
   - `GOOGLE_CLIENT_ID` - Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (sensitive)
   - `NEXT_PUBLIC_BACKEND_URL` - Backend API URL (e.g., `https://your-backend.workers.dev`)
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth client ID (public)
   - `SESSION_COOKIE_NAME` - `anki_session`
   - `SESSION_MAX_AGE` - `604800` (7 days in seconds)

3. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your application
   - Your app will be available at `https://your-project.vercel.app`

### Automatic Deployments

- **Production**: Automatic deployment on push to `main` branch
- **Preview**: Automatic preview deployments for all pull requests
- Each PR gets a unique preview URL for testing

### Configuration

The deployment is configured via:
- `vercel.json` - Vercel project settings
- `.env.production` - Production environment defaults (non-sensitive values)

### Global Edge Network

Your application is deployed to Vercel's Global Edge Network, providing:
- Automatic worldwide CDN distribution
- Edge-optimized Next.js server-side rendering
- Low latency for users globally
- Automatic HTTPS with SSL certificates
