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
npm install

# Run local development server
npm run dev

# Apply database migrations (local)
npm run db:migrate

# Seed database with sample data
npm run db:seed
```

## Database

Database schema and migrations are located in `db/`:
- `db/schema.sql` - Complete database schema
- `db/migrations/` - Migration files
- `db/seed.sql` - Sample data for development

## Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Apply migrations to production
npm run db:migrate:prod
```

## Environment Variables

Required secrets (set via `wrangler secret put`):
- `APP_USERNAME` - Admin username
- `APP_PASSWORD_HASH` - Bcrypt hash of admin password
- `SESSION_SECRET` - JWT signing secret

## API Endpoints

*To be implemented based on specs*

- `GET /api/questions` - List questions
- `GET /api/questions/:id` - Get question details
- `POST /api/study/next` - Get next question for study
- `POST /api/study/:id/answer` - Log answer
- `POST /api/sync` - Sync from GitHub
