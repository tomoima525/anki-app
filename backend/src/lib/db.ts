/**
 * Database utility functions
 */

/**
 * Generates a stable ID for a question based on its text using SHA-256 hash
 */
export async function generateQuestionId(questionText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(questionText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
