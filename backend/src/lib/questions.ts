import { generateQuestionId } from "./db";
import { Question } from "../types/database";

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export async function upsertQuestion(
  db: D1Database,
  question: string,
  answer: string,
  source: string,
  sourceName?: string
): Promise<"inserted" | "updated"> {
  const id = await generateQuestionId(question);
  const now = new Date().toISOString();

  // Check if question exists
  const existing = await db
    .prepare("SELECT id, updated_at FROM questions WHERE id = ?")
    .bind(id)
    .first<Pick<Question, "id" | "updated_at">>();

  if (existing) {
    // Update existing question
    await db
      .prepare(
        `UPDATE questions
         SET answer_text = ?, source = ?, source_name = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(answer, source, sourceName || null, now, id)
      .run();

    return "updated";
  } else {
    // Insert new question
    await db
      .prepare(
        `INSERT INTO questions (id, question_text, answer_text, source, source_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, question, answer, source, sourceName || null, now, now)
      .run();

    return "inserted";
  }
}

export async function upsertQuestions(
  db: D1Database,
  questions: Array<{ question: string; answer: string }>,
  source: string,
  sourceName?: string
): Promise<UpsertResult> {
  const result: UpsertResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: questions.length,
  };

  for (const { question, answer } of questions) {
    try {
      const action = await upsertQuestion(db, question, answer, source, sourceName);

      if (action === "inserted") {
        result.inserted++;
      } else {
        result.updated++;
      }
    } catch (error) {
      console.error(`Failed to upsert question:`, error);
      result.skipped++;
    }
  }

  return result;
}

// Batch upsert using D1 batch API for better performance
export async function batchUpsertQuestions(
  db: D1Database,
  questions: Array<{ question: string; answer: string }>,
  source: string,
  sourceName?: string
): Promise<UpsertResult> {
  const result: UpsertResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: questions.length,
  };

  const now = new Date().toISOString();
  const statements = [];

  for (const { question, answer } of questions) {
    const id = await generateQuestionId(question);

    // Use INSERT OR REPLACE for simpler upsert
    statements.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO questions
         (id, question_text, answer_text, source, source_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM questions WHERE id = ?), ?), ?)`
        )
        .bind(id, question, answer, source, sourceName || null, id, now, now)
    );
  }

  try {
    // Execute in batches of 100
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await db.batch(batch);
      result.inserted += batch.length; // Simplified - actual tracking would need more logic
    }
  } catch (error) {
    console.error("Batch upsert error:", error);
    throw error;
  }

  return result;
}
