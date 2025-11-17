import OpenAI from "openai";

export interface ParsedQuestion {
  question: string;
  answer: string;
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
      (q: any) =>
        q.question &&
        q.answer &&
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
