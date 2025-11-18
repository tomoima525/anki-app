#!/usr/bin/env node

/**
 * Helper script to base64 encode a bcrypt password hash
 * 
 * Usage:
 *   node scripts/encode-password-hash.js "$2b$10$..."
 *   or pipe:
 *   echo "$2b$10$..." | node scripts/encode-password-hash.js
 * 
 * This is useful when storing password hashes in environment variables
 * that contain special characters (dots, dollar signs) that can cause parsing issues.
 */

const readline = require('readline');

function encodeHash(hash) {
  if (!hash) {
    console.error('Error: No hash provided');
    console.log('\nUsage:');
    console.log('  node scripts/encode-password-hash.js "$2b$10$..."');
    console.log('  echo "$2b$10$..." | node scripts/encode-password-hash.js');
    process.exit(1);
  }

  // Remove any trailing whitespace
  hash = hash.trim();

  // Validate it looks like a bcrypt hash
  if (!hash.startsWith('$2')) {
    console.warn('Warning: Input does not appear to be a bcrypt hash (should start with $2)');
  }

  // Encode to base64
  const encoded = Buffer.from(hash, 'utf-8').toString('base64');

  console.log('\nOriginal hash:');
  console.log(hash);
  console.log('\nBase64 encoded (for APP_PASSWORD_HASH_B64):');
  console.log(encoded);
  console.log('\nAdd this to your .env.local:');
  console.log(`APP_PASSWORD_HASH_B64=${encoded}`);
  console.log('\nOr verify decoding:');
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  console.log('Decoded:', decoded);
  console.log('Match:', decoded === hash ? '✓' : '✗');
}

// Check if hash is provided as command line argument
if (process.argv.length > 2) {
  encodeHash(process.argv[2]);
} else {
  // Read from stdin
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let input = '';
  rl.on('line', (line) => {
    input += line;
  });

  rl.on('close', () => {
    encodeHash(input);
  });
}

