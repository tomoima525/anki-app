# Quick Start Guide

Get the Anki Interview App running in 5 minutes.

## Project Structure

This is a monorepo with separate frontend and backend:

- **frontend/** - Next.js application
- **backend/** - Cloudflare Workers + D1 database

## 1. Install Dependencies

From the project root:

```bash
npm run install:all
```

Or install individually:

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

## 2. Set Up Environment Variables

### Frontend

Copy the example and customize:

```bash
cd frontend
cp .env.local.example .env.local
```

The default credentials are:
- Username: `admin`
- Password: `admin123`

### Backend

For local development, create `.dev.vars`:

```bash
cd backend
cat > .dev.vars << EOF
APP_USERNAME=admin
APP_PASSWORD_HASH=$2b$10$4QDRqTYragCE2YD.uskSM.Y4PUtBi05qp7bLiQtQRoYnQiU9W.yRG
SESSION_SECRET=1238444b8eea019baaf3c1a71845a5d042a8a5adbb787a7d49ba60e9223b680d
EOF
```

## 3. Set Up Database

Initialize the local D1 database:

```bash
cd backend
npm run db:migrate
npm run db:seed  # Optional: add sample data
```

## 4. Run Development Servers

### Option A: Run Frontend Only

```bash
cd frontend
npm run dev
```

Visit: http://localhost:3000

### Option B: Run Backend Only

```bash
cd backend
npm run dev
```

API available at: http://localhost:8787

### Option C: Run Both (in separate terminals)

Terminal 1:
```bash
cd frontend && npm run dev
```

Terminal 2:
```bash
cd backend && npm run dev
```

## 5. Login

Navigate to http://localhost:3000

- **Username**: `admin`
- **Password**: `admin123`

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
PORT=3001 npm run dev

# Backend: edit wrangler.toml
```

### Database Migration Fails

```bash
cd backend
rm -rf .wrangler  # Remove local state
npm run db:migrate  # Try again
```

### Authentication Not Working

1. Verify `.env.local` exists in `frontend/`
2. Check password hash matches
3. Restart the development server

## Common Commands

```bash
# From root
npm run dev              # Run frontend
npm run dev:frontend     # Run frontend
npm run dev:backend      # Run backend

# Frontend specific
cd frontend
npm run build           # Build for production
npm run pages:build     # Build for Cloudflare Pages

# Backend specific
cd backend
npm run deploy          # Deploy to Cloudflare
npm run db:migrate:prod # Run migrations on production
```
