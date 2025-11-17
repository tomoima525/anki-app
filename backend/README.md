# Anki Interview Backend

Cloudflare Workers backend with D1 database for the Anki Interview App.

## Overview

This backend provides API endpoints for:

- Question management (CRUD operations)
- Study session tracking
- Answer logging
- GitHub sync operations

## Technology Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono (lightweight web framework)

## Development

```bash
# Install dependencies
pnpm install

# Run local development server
pnpm dev

# Apply database migrations (local)
pnpm db:migrate

# Seed database with sample data
pnpm db:seed
```

## Database

Database schema and migrations are located in `db/`:

- `db/schema.sql` - Complete database schema
- `db/migrations/` - Migration files
- `db/seed.sql` - Sample data for development

## Deployment

```bash
# Deploy to Cloudflare
pnpm deploy

# Apply migrations to production
pnpm db:migrate:prod
```

## Environment Variables

Required secrets (set via `wrangler secret put`):

- `APP_USERNAME` - Admin username
- `APP_PASSWORD_HASH` - Bcrypt hash of admin password
- `SESSION_SECRET` - JWT signing secret

## API Endpoints

_To be implemented based on specs_

- `GET /api/questions` - List questions
- `GET /api/questions/:id` - Get question details
- `POST /api/study/next` - Get next question for study
- `POST /api/study/:id/answer` - Log answer
- `POST /api/sync` - Sync from GitHub
