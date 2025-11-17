# Anki Interview Frontend

Next.js frontend application for the Anki Interview App.

## Overview

A single-page application for spaced repetition study sessions with interview questions.

## Features

- **Authentication**: JWT-based session management with HTTP-only cookies
- **Study Flow**: Spaced repetition interface for reviewing questions
- **Question Management**: Browse and manage interview questions
- **GitHub Sync**: Import questions from GitHub repositories

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 18 with Tailwind CSS
- **Authentication**: JWT (jose library) + bcrypt
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

Create a `.env.local` file (see `.env.local.example`):

```env
# Auth credentials
APP_USERNAME=admin
APP_PASSWORD_HASH=$2b$10$...  # bcrypt hash
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars

# Session configuration
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800  # 7 days in seconds
```

### Generate Password Hash

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(console.log);"
```

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
│   ├── auth.ts     # Authentication utilities
│   └── session.ts  # Session management
└── middleware.ts   # Route protection middleware
```

## Authentication

The app uses JWT-based authentication with the following flow:

1. User submits credentials at `/login`
2. Backend verifies credentials and creates JWT token
3. Token stored in HTTP-only cookie
4. Middleware protects all routes except `/login`
5. Session expires after 7 days (configurable)

Default credentials (development):

- **Username**: `admin`
- **Password**: `admin123`

## Deployment

Deploy to Cloudflare Pages:

```bash
pnpm pages:build
wrangler pages deploy
```

Set environment variables in Cloudflare dashboard:

- `APP_USERNAME`
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`
