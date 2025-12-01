# Quick Start Guide

Get the Anki Interview App running in 5 minutes.

## Project Structure

This is a monorepo with separate frontend and backend:

- **frontend/** - Next.js application
- **backend/** - Cloudflare Workers + D1 database

## 1. Install Dependencies

From the project root:

```bash
pnpm install
```

Or install individually:

```bash
# Frontend
cd frontend && pnpm install

# Backend
cd backend && pnpm install
```

## 2. Set Up Environment Variables

### Frontend

Copy the example and customize:

```bash
cd frontend
cp .env.local.example .env.local
```

Sign in with your Google account. Make sure to set up Google OAuth credentials first (see frontend/README.md).

### Backend

For local development, create `.dev.vars`:

```bash
cd backend
cat > .dev.vars << EOF
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=$(openssl rand -hex 32)
EOF
```

> **Note:** The `SESSION_SECRET` must be at least 32 characters long. The command above generates a secure random secret automatically.

## 3. Set Up Database

Initialize the local D1 database:

```bash
cd backend
pnpm db:migrate
pnpm db:seed  # Optional: add sample data
```

## 4. Run Development Servers

### Option A: Run Frontend Only

```bash
cd frontend
pnpm dev
```

Visit: http://localhost:3000

### Option B: Run Backend Only

```bash
cd backend
pnpm dev
```

API available at: http://localhost:8787

### Option C: Run Both (in separate terminals)

Terminal 1:

```bash
cd frontend && pnpm dev
```

Terminal 2:

```bash
cd backend && pnpm dev
```

## 5. Login

Navigate to http://localhost:3000 and sign in with your Google account.

## Next Steps

- Review the implementation specs in `specs/`
- Customize your environment variables
- Deploy to Cloudflare (see README.md)

## Troubleshooting

### Port Already in Use

Frontend runs on port 3000, backend on 8787. If these ports are in use:

```bash
# Frontend: specify port
cd frontend
PORT=3001 pnpm dev

# Backend: edit wrangler.toml
```

### Database Migration Fails

```bash
cd backend
rm -rf .wrangler  # Remove local state
pnpm db:migrate  # Try again
```

### Authentication Not Working

1. Verify `.env.local` exists in `frontend/`
2. Check Google OAuth credentials are configured correctly
3. Verify redirect URI matches in Google Cloud Console
4. Restart the development server

## Common Commands

```bash
# From root
pnpm dev              # Run frontend
pnpm dev:frontend     # Run frontend
pnpm dev:backend      # Run backend

# Frontend specific
cd frontend
pnpm build           # Build for production (standard Next.js build)
pnpm preview         # Build and preview with OpenNext.js locally
pnpm deploy          # Build and deploy to Cloudflare Workers

# Backend specific
cd backend
pnpm deploy          # Deploy to Cloudflare
pnpm db:migrate:prod # Run migrations on production
```
