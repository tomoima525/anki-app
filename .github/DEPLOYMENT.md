# Deployment Guide

This document explains how to set up and use the automated deployment workflows for the Anki Interview App.

## Backend Deployment

The backend is deployed to **Cloudflare Workers** using a GitHub Action workflow.

### Prerequisites

Before the deployment workflow can run, you need to configure the following GitHub secrets:

1. **CLOUDFLARE_API_TOKEN**
   - Navigate to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Create a new API token with the following permissions:
     - **Account** → **Cloudflare Workers** → **Edit**
     - **Account** → **Cloudflare D1** → **Edit**
   - Copy the token and add it to GitHub repository secrets

2. **CLOUDFLARE_ACCOUNT_ID**
   - Find your Account ID in the [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - It's displayed on the right sidebar of the Workers & Pages overview
   - Add it to GitHub repository secrets

### Setting up GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:
   - Name: `CLOUDFLARE_API_TOKEN`, Value: `<your-cloudflare-api-token>`
   - Name: `CLOUDFLARE_ACCOUNT_ID`, Value: `<your-cloudflare-account-id>`

### Deployment Triggers

The backend deployment workflow runs automatically when:

- **Push to main branch** with changes in:
  - `backend/**` directory
  - `.github/workflows/deploy-backend.yml`

You can also trigger it manually:

1. Go to **Actions** tab in GitHub
2. Select **Deploy Backend to Cloudflare Workers**
3. Click **Run workflow**
4. Select the branch and click **Run workflow**

### Deployment Process

The workflow performs the following steps:

1. **Checkout code** - Fetches the latest code from the repository
2. **Setup environment** - Installs Node.js 20 and pnpm
3. **Install dependencies** - Runs `pnpm install` in the backend directory
4. **Run database migrations** - Applies pending migrations to production D1 database
5. **Deploy to Cloudflare Workers** - Deploys the backend using Wrangler
6. **Generate summary** - Creates a deployment summary in the GitHub Actions UI

### Monitoring Deployments

- View deployment status in the **Actions** tab
- Each deployment creates a summary with environment details and timestamp
- Check Cloudflare Dashboard for runtime logs and metrics

### Troubleshooting

**Deployment fails with authentication error:**
- Verify `CLOUDFLARE_API_TOKEN` is valid and has correct permissions
- Ensure `CLOUDFLARE_ACCOUNT_ID` matches your Cloudflare account

**Database migration fails:**
- Check that the D1 database exists in Cloudflare
- Verify the database ID in `backend/wrangler.toml` matches production database

**Deployment succeeds but application doesn't work:**
- Check Cloudflare Workers logs in the dashboard
- Verify environment variables are set in Cloudflare (not in GitHub Actions)
- Ensure D1 database bindings are correctly configured

### Environment Variables

Note that sensitive environment variables (like `OPENAI_API_KEY`, `GITHUB_TOKEN`, etc.) should be configured directly in Cloudflare Workers settings, not in the GitHub Action workflow:

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker (`anki-interview-app`)
3. Go to **Settings** → **Variables and Secrets**
4. Add the required environment variables:
   - `APP_USERNAME`
   - `APP_PASSWORD_HASH`
   - `SESSION_SECRET`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `GITHUB_TOKEN`

## Database Migrations

The application uses Cloudflare D1 (SQLite) for data storage. Database schema changes are managed through SQL migration files.

### Migration Files

Migration files are located in `backend/db/migrations/` and follow this naming convention:
```
0001_initial_schema.sql
0002_add_user_preferences.sql
0003_add_indexes.sql
```

### Creating a New Migration

Use the helper script to create a new migration:

```bash
cd backend
./scripts/create-migration.sh <migration_name>

# Example:
./scripts/create-migration.sh add_user_preferences
```

This creates a new migration file with the next sequential number and a template to fill in.

### Running Migrations

**Automatically (via GitHub Actions):**
- Migrations run automatically during backend deployment
- The deployment workflow checks migration status before and after applying

**Manually (via GitHub Actions):**
1. Go to **Actions** tab in GitHub
2. Select **Database Migrations**
3. Click **Run workflow**
4. Choose:
   - **Environment**: `production` or `local`
   - **Dry run**: `true` to only check status, `false` to apply migrations
5. Click **Run workflow**

**Locally (via command line):**

```bash
cd backend

# Local development database
pnpm db:migrate

# Production database
pnpm db:migrate:prod

# Check migration status
npx wrangler d1 migrations list anki-interview-db --local
npx wrangler d1 migrations list anki-interview-db-prod --remote
```

### Migration Workflow Features

The standalone migration workflow provides:

- **Pre-migration status check** - See what migrations are already applied
- **Dry run mode** - Check status without applying changes
- **Post-migration verification** - Confirm migrations were applied successfully
- **Detailed summary** - View migration history and available migration files
- **Environment selection** - Run on production or local database

### Migration Best Practices

1. **Always use IF NOT EXISTS**
   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL
   );
   ```

2. **Add descriptive comments**
   ```sql
   -- Add email column for user notifications
   ALTER TABLE users ADD COLUMN email TEXT;
   ```

3. **Create indexes for performance**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
   ```

4. **Test locally first**
   ```bash
   pnpm db:migrate  # Test on local database
   # Verify the changes work correctly
   pnpm db:migrate:prod  # Apply to production
   ```

5. **Never modify existing migrations**
   - Once a migration is applied to production, never edit it
   - Create a new migration to make additional changes

6. **Keep migrations small and focused**
   - One migration should address one logical change
   - Easier to debug and rollback if needed

### Migration Monitoring

During deployment, the workflow provides:

- ✅ List of available migration files
- ✅ Current migration status before applying
- ✅ Migration application logs
- ✅ Final migration status after applying
- ✅ Summary in GitHub Actions UI

### Troubleshooting Migrations

**Migration fails during deployment:**
1. Check the Actions logs for specific SQL errors
2. Verify the migration SQL syntax is valid
3. Test the migration locally first: `pnpm db:migrate`
4. Check if the migration already exists in production

**Migration applied but changes not reflected:**
1. Verify you're checking the correct database (local vs production)
2. Run `npx wrangler d1 migrations list <database-name> --remote`
3. Check Cloudflare Dashboard → D1 → View your database

**Need to rollback a migration:**
- D1 doesn't support automatic rollbacks
- Create a new migration that reverses the changes
- Example: If you added a column, create a migration to drop it

## Frontend Deployment

Frontend deployment will be configured separately (to be added).

---

## Manual Deployment

If you prefer to deploy manually:

```bash
# Deploy backend
cd backend
pnpm install
pnpm db:migrate:prod  # Run production migrations
pnpm deploy           # Deploy to Cloudflare Workers
```

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
