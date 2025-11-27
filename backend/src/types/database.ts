/**
 * Database types matching the schema
 */

export interface Question {
  id: string;
  question_text: string;
  answer_text: string;
  source: string;
  source_name: string | null;
  created_at: string;
  updated_at: string;
  last_answered_at: string | null;
  last_difficulty: "easy" | "medium" | "hard" | null;
  answer_count: number;
}

export interface AnswerLog {
  id: number;
  question_id: string;
  difficulty: "easy" | "medium" | "hard";
  answered_at: string;
}
