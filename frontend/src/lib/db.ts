import { D1Database } from '@cloudflare/workers-types';
import crypto from 'crypto';

export function generateQuestionId(questionText: string): string {
  return crypto
    .createHash('sha256')
    .update(questionText.trim())
    .digest('hex');
}

export function getDB(): D1Database {
  // Access binding from Cloudflare context
  // This will be environment-specific
  if (typeof process.env.DB !== 'undefined') {
    return process.env.DB as D1Database;
  }
  throw new Error('Database binding not available');
}
