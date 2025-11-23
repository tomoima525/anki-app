export interface Chunk {
  content: string;
  metadata: {
    headers: string[]; // Breadcrumb of headers (e.g., ["Introduction", "Basic Concepts"])
    level: number; // Deepest header level in this chunk
    startLine?: number;
    endLine?: number;
  };
  wordCount: number;
  estimatedTokens: number;
}

export interface ChunkingOptions {
  maxWordsPerChunk?: number; // Default: 750 (roughly 1000 tokens)
  minWordsPerChunk?: number; // Default: 50
  preserveCodeBlocks?: boolean; // Default: true
}

/**
 * Splits markdown content by headers (H1, H2, H3) to preserve semantic context
 * This ensures questions aren't separated from their answers
 */
export function splitMarkdownByHeaders(
  markdown: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const {
    maxWordsPerChunk = 750,
    minWordsPerChunk = 50,
    preserveCodeBlocks = true,
  } = options;

  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentHeaders: string[] = [];
  let headerStack: Array<{ level: number; text: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Check if we should create a new chunk
      const currentWordCount = currentChunk.join("\n").split(/\s+/).filter(Boolean).length;

      if (currentWordCount >= maxWordsPerChunk && currentChunk.length > 0) {
        // Save current chunk
        const chunkContent = currentChunk.join("\n");
        if (chunkContent.trim()) {
          chunks.push(createChunk(chunkContent, [...currentHeaders]));
        }
        currentChunk = [];
      }

      // Update header stack
      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, text: headerText });

      // Update current headers breadcrumb
      currentHeaders = headerStack.map((h) => h.text);
    }

    currentChunk.push(line);
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n");
    if (chunkContent.trim()) {
      chunks.push(createChunk(chunkContent, currentHeaders));
    }
  }

  // Filter out chunks that are too small
  const validChunks = chunks.filter((chunk) => chunk.wordCount >= minWordsPerChunk);

  // If no valid chunks, return the entire content as one chunk
  if (validChunks.length === 0 && markdown.trim()) {
    return [createChunk(markdown, [])];
  }

  return validChunks;
}

function createChunk(content: string, headers: string[]): Chunk {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const estimatedTokens = Math.ceil(content.length / 4);

  return {
    content,
    metadata: {
      headers,
      level: headers.length,
    },
    wordCount,
    estimatedTokens,
  };
}

/**
 * Determines processing strategy based on word count
 */
export type ProcessingStrategy = "reject" | "single_pass" | "chunked";

export function determineProcessingStrategy(wordCount: number): ProcessingStrategy {
  if (wordCount < 50) return "reject";
  if (wordCount <= 3000) return "single_pass";
  return "chunked";
}
