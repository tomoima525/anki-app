import OpenAI from "openai";

export interface ParsedQuestion {
  question: string;
  answer: string;
}

/**
 * Detects if the markdown contains pre-written answers
 * by looking for common Q&A patterns (regex-based, fast)
 */
export function hasPrewrittenAnswers(markdown: string): boolean {
  const answerPatterns = [
    /\*\*Answer:\*\*/i, // **Answer:**
    /\*\*Answer\*\*/i, // **Answer**
    /<details>/i, // Collapsible sections often contain answers
    /####?\s*Answer/i, // ## Answer or ### Answer
    /####?\s*Solution/i, // ## Solution or ### Solution
  ];

  // Check if document has numbered questions with answers following
  const hasNumberedQA = /####?\s*\d+\.\s*.+\?\s*\n+.+/s.test(markdown);

  return (
    answerPatterns.some((pattern) => pattern.test(markdown)) || hasNumberedQA
  );
}

/**
 * Uses OpenAI to intelligently detect if the markdown contains pre-written answers
 * More robust than regex patterns but incurs API cost
 */
export async function hasPrewrittenAnswersWithAI(
  markdown: string,
  apiKey: string,
  model: string = "gpt-4o-mini"
): Promise<boolean> {
  const openai = new OpenAI({ apiKey });

  // Take a sample of the markdown to reduce token usage
  const sampleStart = markdown.slice(0, 10000);
  const sampleEnd = markdown.slice(-10000);
  const sample = `${sampleStart}\n\n${sampleEnd}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing document structure. Respond with only 'yes' or 'no'.",
        },
        {
          role: "user",
          content: `Does this markdown document contain interview questions WITH their answers already written (not just a list of questions)?

Respond with only:
- "yes" if the document has questions AND answers
- "no" if it only has questions without answers

Document sample:
${sample}`,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const answer = response.choices[0]?.message?.content?.toLowerCase().trim();
    return answer === "yes";
  } catch (error) {
    console.error("Error detecting answers with OpenAI:", error);
    // Fallback to regex-based detection on error
    return hasPrewrittenAnswers(markdown);
  }
}

/**
 * Parses Q&A pairs directly from markdown that already contains answers
 * Uses LLM parsing with chunking to avoid token limits
 */
export async function parsePrewrittenQA(
  markdown: string,
  apiKey: string,
  model: string = "gpt-4o-mini"
): Promise<ParsedQuestion[]> {
  return await parseQuestionsInChunks(markdown, apiKey, model);
}

/**
 * Normalizes question text for comparison to detect duplicates
 * Removes punctuation, extra whitespace, and converts to lowercase
 */
function normalizeQuestionForComparison(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Deduplicates questions based on normalized question text
 * When duplicates are found, keeps the one with the longest answer
 */
export function deduplicateQuestions(
  questions: ParsedQuestion[]
): ParsedQuestion[] {
  const questionMap = new Map<string, ParsedQuestion>();

  for (const q of questions) {
    const normalizedQuestion = normalizeQuestionForComparison(q.question);
    const existing = questionMap.get(normalizedQuestion);

    if (!existing) {
      // First time seeing this question
      questionMap.set(normalizedQuestion, q);
    } else {
      // Duplicate found - keep the one with the longer answer
      if (q.answer.length > existing.answer.length) {
        questionMap.set(normalizedQuestion, q);
      }
      // Otherwise keep the existing one (do nothing)
    }
  }

  return Array.from(questionMap.values());
}

const PARSING_PROMPT = `You are a helpful assistant that extracts interview questions and answers from markdown documents.

Given the markdown content, extract all question-answer pairs. Format your response as a JSON array with this structure:

{
  "questions": [
    {
      "question": "The question text",
      "answer": "The answer text"
    }
  ]
}

Guidelines:
- Identify questions by common patterns: "Q:", "Question:", bullet points followed by "?", numbered lists, section headings
- The answer is typically the text following the question until the next question
- Clean up formatting (remove markdown symbols like *, #, etc. from content)
- Preserve code blocks in answers
- If a section doesn't have a clear answer, skip it
- Return valid JSON only, no other text

Here's the markdown content:

`;

export async function parseQuestionsWithOpenAI(
  markdown: string,
  apiKey: string,
  model: string = "gpt-4o-mini"
): Promise<ParsedQuestion[]> {
  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a precise question-answer extractor. Always return valid JSON.",
        },
        {
          role: "user",
          content: PARSING_PROMPT + markdown,
        },
      ],
      temperature: 0.1, // Low temperature for consistent parsing
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    // Handle both array response and object with array property
    const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

    // Validate structure
    return questions.filter(
      (q: unknown): q is ParsedQuestion =>
        typeof q === "object" &&
        q !== null &&
        "question" in q &&
        "answer" in q &&
        typeof q.question === "string" &&
        typeof q.answer === "string"
    );
  } catch (error) {
    console.error("OpenAI parsing error:", error);
    throw new Error(`Failed to parse questions: ${error}`);
  }
}

// Parse in chunks to avoid token limits
export async function parseQuestionsInChunks(
  markdown: string,
  apiKey: string,
  model: string = "gpt-4o-mini",
  chunkSize: number = 8000
): Promise<ParsedQuestion[]> {
  const chunks = splitMarkdownIntoChunks(markdown, chunkSize);
  console.log(`Splitting into ${chunks.length} chunks`);
  const allQuestions: ParsedQuestion[] = [];

  for (const chunk of chunks) {
    const questions = await parseQuestionsWithOpenAI(chunk, apiKey, model);
    allQuestions.push(...questions);
    console.log(`Parsed ${questions.length} questions from chunk`);
  }

  // Deduplicate questions across all chunks
  const deduplicated = deduplicateQuestions(allQuestions);
  const duplicateCount = allQuestions.length - deduplicated.length;
  if (duplicateCount > 0) {
    console.log(`Removed ${duplicateCount} duplicate question(s)`);
  }

  return deduplicated;
}

function splitMarkdownIntoChunks(
  content: string,
  maxChunkSize: number
): string[] {
  const chunks: string[] = [];
  const lines = content.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
    } else {
      currentChunk += "\n" + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
