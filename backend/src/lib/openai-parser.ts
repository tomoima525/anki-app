import OpenAI from "openai";

export interface ParsedQuestion {
  question: string;
  answer: string;
}

/**
 * Detects if the markdown contains pre-written answers
 * by looking for common Q&A patterns
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

  return answerPatterns.some((pattern) => pattern.test(markdown)) || hasNumberedQA;
}

/**
 * Parses Q&A pairs directly from markdown that already contains answers
 */
export function parsePrewrittenQA(markdown: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Pattern 1: Numbered headings with Q&A format (e.g., "### 1. Question?" followed by answer)
  const numberedPattern = /####?\s*(\d+)\.\s*(.+?)(?=####?\s*\d+\.|$)/gs;
  let match;

  while ((match = numberedPattern.exec(markdown)) !== null) {
    const fullText = match[2].trim();

    // Try to split by common answer markers
    const answerMarkers = [
      /\*\*Answer:\*\*/i,
      /\*\*Answer\*\*/i,
      /<details>/i,
      /####?\s*Answer/i,
      /####?\s*Solution/i,
    ];

    let question = fullText;
    let answer = "";

    for (const marker of answerMarkers) {
      const parts = fullText.split(marker);
      if (parts.length > 1) {
        question = parts[0].trim();
        answer = parts.slice(1).join("").trim();
        // Clean up details tag if present
        answer = answer.replace(/<\/details>/gi, "").trim();
        answer = answer.replace(/<summary>.*?<\/summary>/gi, "").trim();
        break;
      }
    }

    // If no explicit answer marker, try to find where question ends (usually at first line break followed by text)
    if (!answer) {
      const lines = fullText.split("\n");
      const questionLine = lines[0];
      const answerLines = lines.slice(1).filter(line => line.trim()).join("\n").trim();

      if (questionLine && answerLines) {
        question = questionLine;
        answer = answerLines;
      }
    }

    // Only add if we have both question and answer
    if (question && answer) {
      questions.push({
        question: cleanText(question),
        answer: cleanText(answer),
      });
    }
  }

  return questions;
}

/**
 * Cleans text by removing excessive markdown formatting while preserving code blocks
 */
function cleanText(text: string): string {
  // Preserve code blocks
  const codeBlocks: string[] = [];
  let cleaned = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Remove excessive asterisks (but preserve single *)
  cleaned = cleaned.replace(/\*\*\*/g, "");
  cleaned = cleaned.replace(/\*\*/g, "");

  // Remove HTML tags except code-related ones
  cleaned = cleaned.replace(/<(?!code|pre|\/code|\/pre)[^>]+>/g, "");

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    cleaned = cleaned.replace(`__CODEBLOCK_${i}__`, block);
  });

  return cleaned.trim();
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
    console.log(`Parsed ${questions.length} questions`);
  }

  return allQuestions;
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
