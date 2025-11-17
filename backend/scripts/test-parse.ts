import { parseQuestionsWithOpenAI } from '../src/lib/openai-parser';

const sampleMarkdown = `
# Interview Questions

## Question 1
What is a RESTful API?

A RESTful API is an architectural style for building web services...

## Question 2
Explain database indexing

Database indexing is a technique...
`;

interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';

    try {
      console.log('Testing OpenAI parsing...\n');
      const questions = await parseQuestionsWithOpenAI(sampleMarkdown, apiKey, model);
      console.log('Parsed questions:', JSON.stringify(questions, null, 2));

      return new Response(JSON.stringify(questions, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error}`, { status: 500 });
    }
  },
};
