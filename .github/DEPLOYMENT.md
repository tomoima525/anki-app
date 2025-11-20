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
