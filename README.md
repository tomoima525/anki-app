# Anki Interview App

A spaced repetition application for practicing interview questions, deployed on Cloudflare.

## Overview

This application helps you prepare for technical interviews using spaced repetition techniques. Import questions from GitHub, study them systematically, and track your progress over time.

## Architecture

This project is organized as a monorepo with separate frontend and backend:

```
anki-interview-app/
├── frontend/          # Next.js application (Cloudflare Pages)
├── backend/           # Cloudflare Workers + D1 Database
├── specs/            # Implementation specifications
└── README.md         # This file
```

### Frontend

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Authentication**: JWT sessions with HTTP-only cookies
- **Deployment**: Cloudflare Pages

### Backend

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono (lightweight)

## Features

- **Authentication**: Google OAuth 2.0 with JWT-based sessions
- **Question Management**: CRUD operations for interview questions
- **Study Flow**: Spaced repetition algorithm for optimal learning
- **GitHub Sync**: Import questions from GitHub repositories
- **Progress Tracking**: Track answers and difficulty ratings

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account (for deployment)
- Wrangler CLI (`pnpm add -g wrangler`)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd anki-interview-app

# Install all dependencies (frontend + backend)
pnpm install
```

### Development

#### Run Frontend

```bash
# From root directory
pnpm dev:frontend

# Or from frontend directory
cd frontend
pnpm dev
```

Visit `http://localhost:3000`

Sign in with your Google account.

#### Run Backend

```bash
# From root directory
pnpm dev:backend

# Or from backend directory
cd backend

# Apply database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Environment Setup

#### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
```

See `frontend/.env.local.example` for a complete example.

#### Backend

Cloudflare Workers use environment variables set via `wrangler secret put`:

```bash
cd backend
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
```

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js pages and API routes
│   ├── components/       # React components
│   ├── lib/             # Utilities (auth, session)
│   └── middleware.ts    # Route protection
└── package.json

backend/
├── src/
│   └── index.ts         # Workers entry point
├── db/
│   ├── migrations/      # Database migrations
│   ├── schema.sql       # Database schema
│   └── seed.sql         # Sample data
├── wrangler.toml        # Cloudflare configuration
└── package.json
```

## Database

The database schema includes:

- **questions**: Interview questions with metadata
- **answer_logs**: History of user answers and difficulty ratings

See `backend/db/schema.sql` for the complete schema.

### Migrations

```bash
cd backend

# Local development
pnpm db:migrate

# Production
pnpm db:migrate:prod
```

## Deployment

### Frontend (Cloudflare Pages)

```bash
cd frontend
pnpm pages:build
wrangler pages deploy
```

### Backend (Cloudflare Workers)

```bash
cd backend
pnpm deploy
```

## Development Roadmap

- [x] Database setup (D1)
- [x] Authentication system
- [ ] GitHub sync functionality
- [ ] Study flow implementation
- [ ] Question management UI
- [ ] Settings and admin panel

## Documentation

Detailed specifications are available in the `specs/` directory:

- `01-database-setup.md` - Database schema and setup
- `02-authentication.md` - Authentication implementation
- `03-github-sync.md` - GitHub integration
- `04-study-flow.md` - Study interface and algorithm
- `05-questions-management.md` - Question CRUD operations
- `06-settings-admin.md` - Admin settings panel

## License

MIT
