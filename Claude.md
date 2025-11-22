# Anki Interview App

## Project Overview

A spaced repetition application for practicing interview questions, built as a full-stack application deployed on Cloudflare. The app helps users prepare for technical interviews using spaced repetition techniques, allowing them to import questions from GitHub, study them systematically, and track progress over time.

## Architecture

This is a **monorepo** with two main packages:

- **Frontend**: Next.js 15 application deployed on Cloudflare Pages
- **Backend**: Cloudflare Workers API with D1 (SQLite) database

```
anki-interview-app/
├── frontend/          # Next.js application
├── backend/           # Cloudflare Workers + D1
├── specs/            # Implementation specifications
├── package.json      # Root workspace configuration
└── pnpm-workspace.yaml
```

## Tech Stack

### Frontend

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 4
- **Authentication**: JWT with HTTP-only cookies (using `jose` library)
- **Password Hashing**: bcrypt
- **Deployment**: Cloudflare Pages (using `@cloudflare/next-on-pages`)
- **Language**: TypeScript

### Backend

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite)
- **GitHub Integration**: @octokit/rest
- **AI Integration**: OpenAI API
- **Language**: TypeScript

## Package Manager

**IMPORTANT**: This project uses **pnpm** with workspaces. Always use `pnpm` commands, not npm or yarn.

## Development Commands

### Root Level

```bash
# Install all dependencies
pnpm install

# Run frontend dev server
pnpm dev
pnpm dev:frontend

# Run backend dev server
pnpm dev:backend

# Build all packages
pnpm build

# Build specific packages
pnpm build:frontend
pnpm build:backend
```

### Frontend (from `/frontend` directory)

```bash
# Development server (http://localhost:3000)
pnpm dev

# Build for production
pnpm build

# Build for Cloudflare Pages
pnpm pages:build

# Preview Cloudflare Pages build
pnpm preview

# Lint
pnpm lint
```

### Backend (from `/backend` directory)

```bash
# Development server
pnpm dev

# Deploy to Cloudflare
pnpm deploy

# Database migrations (local)
pnpm db:migrate

# Database migrations (production)
pnpm db:migrate:prod

# Seed database with sample data
pnpm db:seed

# Test GitHub sync
pnpm sync:local
pnpm sync
```

## Project Structure

### Frontend Structure

```
frontend/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/          # API routes
│   │   ├── auth/         # Authentication pages
│   │   ├── dashboard/    # Main app pages
│   │   └── layout.tsx    # Root layout
│   ├── components/       # React components
│   ├── lib/             # Utilities
│   │   ├── auth.ts      # Authentication logic
│   │   └── session.ts   # Session management
│   └── middleware.ts    # Route protection middleware
├── .env.local.example   # Environment variables template
├── next.config.js       # Next.js configuration
└── package.json
```

### Backend Structure

```
backend/
├── src/
│   ├── index.ts         # Main Workers entry point
│   ├── routes/          # API route handlers
│   └── middleware/      # Middleware functions
├── db/
│   ├── migrations/      # Database migration files
│   ├── schema.sql       # Database schema
│   └── seed.sql         # Sample data
├── scripts/
│   ├── sync-github.ts   # GitHub sync worker
│   └── test-parse.ts    # Testing utilities
├── wrangler.toml        # Cloudflare Workers configuration
└── package.json
```

## Database

The backend uses Cloudflare D1 (SQLite) with the following main tables:

- **questions**: Interview questions with metadata (title, content, tags, difficulty, GitHub URL)
- **answer_logs**: User answer history and difficulty ratings for spaced repetition

Migration files are in `backend/db/migrations/`. Always create new migrations for schema changes.

## Environment Variables

### Frontend (`frontend/.env.local`)

```env
APP_USERNAME=admin
APP_PASSWORD_HASH=$2b$10$...
SESSION_SECRET=your-super-secret-jwt-signing-key-min-32-chars
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
```

### Backend

Backend uses Cloudflare Workers secrets (set via `wrangler secret put`):

- `APP_USERNAME`
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`
- `GITHUB_TOKEN` (for GitHub API)
- `OPENAI_API_KEY` (for AI features)

## Key Features

1. **Authentication**: Single-user auth with bcrypt + JWT
2. **Question Management**: CRUD operations for interview questions
3. **GitHub Sync**: Import questions from GitHub repositories using Octokit
4. **Spaced Repetition**: Study algorithm for optimal learning
5. **Progress Tracking**: Answer logs and difficulty ratings

## Default Credentials

For local development:

- Username: `admin`
- Password: `admin123`

## Documentation

Detailed specifications are in the `specs/` directory:

- `01-database-setup.md` - Database schema and setup
- `02-authentication.md` - Authentication implementation
- `03-github-sync.md` - GitHub integration
- `04-study-flow.md` - Study interface and algorithm
- `05-questions-management.md` - Question CRUD operations
- `06-settings-admin.md` - Admin settings panel

## Important Notes

- This is a **monorepo** - be aware of which directory you're working in
- Always use **pnpm** for package management
- Frontend uses Next.js 15 App Router (not Pages Router)
- Backend runs on Cloudflare Workers (not Node.js)
- Database is D1/SQLite (not PostgreSQL or MySQL)
- Authentication is session-based with JWT tokens in HTTP-only cookies

## Common Tasks

### Adding a new frontend page

1. Create file in `frontend/src/app/[page-name]/page.tsx`
2. Update middleware if authentication is required

### Adding a new API endpoint

1. Add route handler in `backend/src/routes/`
2. Register route in `backend/src/index.ts`

### Modifying database schema

1. Create new migration in `backend/db/migrations/`
2. Run `pnpm db:migrate` to apply locally
3. Use `pnpm db:migrate:prod` for production

### Testing changes

- Frontend: Run `pnpm dev` in frontend directory
- Backend: Run `pnpm dev` in backend directory
- Test locally before deploying to Cloudflare

## Deployment

- **Frontend**: Deploy via Cloudflare Pages (`wrangler pages deploy`)
- **Backend**: Deploy via Wrangler (`wrangler deploy`)
- Both are configured for Cloudflare's edge network

## Before Committing

- Run `pnpm lint` to check for linting errors
- Run `pnpm format` to format the code

## Specs

- Always add a spec file under `specs/` when adding a new feature.
