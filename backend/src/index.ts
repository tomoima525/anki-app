/**
 * Cloudflare Workers backend for Anki Interview App
 * Provides API endpoints for database operations
 */

export interface Env {
  DB: D1Database;
  APP_USERNAME: string;
  APP_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // API routes will be implemented here
    // Examples:
    // - /api/questions - CRUD operations for questions
    // - /api/study - Study session management
    // - /api/sync - GitHub sync operations

    return new Response('Anki Interview Backend API', { status: 200 });
  },
};
