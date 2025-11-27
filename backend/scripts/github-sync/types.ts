export interface ParsedQuestion {
  content: string;
  answer?: string;
  hasAnswer: boolean;
  source: string;
  sourceUrl: string;
}

export interface ParseResult {
  source: string;
  sourceUrl: string;
  questions: ParsedQuestion[];
  hasAnswers: boolean;
  timestamp: string;
}

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
}
