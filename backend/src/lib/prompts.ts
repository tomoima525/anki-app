/**
 * System prompt for atomic flashcard generation
 * Enforces one concept per card, self-contained questions
 */
export const ATOMIC_FLASHCARD_SYSTEM_PROMPT = `You are an expert educator creating Anki flashcards for technical interview preparation.

CORE PRINCIPLES:
1. **Atomic**: Each card tests exactly ONE concept or fact
2. **Self-Contained**: Questions must make sense without the source text
3. **No Fluff**: Avoid phrases like "According to the text..." - state facts directly
4. **Preserve Code**: Keep code blocks intact with proper formatting
5. **Technical Accuracy**: Maintain precise technical terminology

FORMAT:
Return a JSON array with this exact structure:
{
  "questions": [
    {
      "question": "Clear, specific question",
      "answer": "Concise, complete answer"
    }
  ]
}

QUALITY STANDARDS:
- Questions should be specific and unambiguous
- Answers should be complete but concise (2-4 sentences ideal)
- Include code examples where relevant
- Focus on "what", "how", and "why" questions
- Avoid yes/no questions unless testing recognition`;

/**
 * User prompt template for extracting flashcards from content
 */
export function createExtractionPrompt(
  content: string,
  context?: { headers?: string[]; sourceType?: string }
): string {
  const contextInfo = context?.headers?.length
    ? `\n\nSection Context: ${context.headers.join(" > ")}`
    : "";

  return `Extract high-quality technical flashcards from the content below.

Focus on:
- Key concepts and definitions
- Technical patterns and best practices
- Common interview questions and answers
- Code examples and their explanations
- Relationships between concepts

Create flashcards that help someone prepare for technical interviews.${contextInfo}

CONTENT:
${content}

Return only valid JSON with the questions array. No additional text.`;
}

/**
 * Prompt for code-heavy content
 */
export const CODE_FOCUSED_PROMPT = `You are creating flashcards for coding interview preparation.

SPECIAL INSTRUCTIONS FOR CODE:
1. Always preserve code blocks with their language tags
2. Format code blocks as:
   \`\`\`language
   code here
   \`\`\`
3. Create cards that test:
   - What the code does
   - Time/space complexity
   - Edge cases
   - Common patterns
   - Implementation details

4. Include "trace the output" style questions for short code snippets
5. Ask about optimization opportunities

Return JSON array of question-answer pairs.`;

/**
 * Validates that generated Q&A meets quality standards
 */
export function validateQuestion(question: string, answer: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check minimum lengths
  if (question.length < 10) {
    issues.push("Question too short (< 10 characters)");
  }
  if (answer.length < 10) {
    issues.push("Answer too short (< 10 characters)");
  }

  // Check for common anti-patterns
  if (question.toLowerCase().includes("according to")) {
    issues.push("Question contains 'according to' - should be self-contained");
  }

  if (!/\?$/.test(question.trim()) && !question.includes("What") && !question.includes("How")) {
    issues.push("Question may not be properly formatted");
  }

  // Check that question and answer aren't identical
  if (question.toLowerCase() === answer.toLowerCase()) {
    issues.push("Question and answer are identical");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
