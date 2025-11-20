/**
 * CSV Import Utility
 * Converts CSV files to SQL INSERT statements for D1 database
 */

import { readFileSync, writeFileSync } from "fs";

/**
 * Parse a CSV line, handling quoted fields with commas/newlines
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

/**
 * Escape single quotes for SQL
 */
function escapeSQLString(str: string): string {
  return str ? str.replace(/'/g, "''") : "";
}

/**
 * Convert questions CSV to SQL INSERT statements
 */
export function questionsCSVToSQL(
  csvFilePath: string,
  sqlFilePath: string
): { count: number; outputPath: string } {
  const csv = readFileSync(csvFilePath, "utf-8");
  const lines = csv.split("\n");

  // Skip header
  const dataLines = lines.slice(1).filter((line) => line.trim());

  let sql = "BEGIN TRANSACTION;\n";
  let count = 0;

  for (const line of dataLines) {
    const values = parseCSVLine(line);
    if (values.length >= 9) {
      const [
        id,
        question_text,
        answer_text,
        source,
        created_at,
        updated_at,
        last_answered_at,
        last_difficulty,
        answer_count,
      ] = values;

      sql += `INSERT OR REPLACE INTO questions (id, question_text, answer_text, source, created_at, updated_at, last_answered_at, last_difficulty, answer_count)\n`;
      sql += `VALUES ('${escapeSQLString(id)}', '${escapeSQLString(question_text)}', '${escapeSQLString(answer_text)}', '${escapeSQLString(source)}', '${escapeSQLString(created_at)}', '${escapeSQLString(updated_at)}', ${last_answered_at ? "'" + escapeSQLString(last_answered_at) + "'" : "NULL"}, ${last_difficulty ? "'" + escapeSQLString(last_difficulty) + "'" : "NULL"}, ${answer_count || 0});\n`;
      count++;
    }
  }

  sql += "COMMIT;\n";

  writeFileSync(sqlFilePath, sql, "utf-8");

  return {
    count,
    outputPath: sqlFilePath,
  };
}

/**
 * Convert answer logs CSV to SQL INSERT statements
 */
export function answerLogsCSVToSQL(
  csvFilePath: string,
  sqlFilePath: string
): { count: number; outputPath: string } {
  const csv = readFileSync(csvFilePath, "utf-8");
  const lines = csv.split("\n");

  // Skip header
  const dataLines = lines.slice(1).filter((line) => line.trim());

  if (dataLines.length === 0) {
    // No data to import
    writeFileSync(sqlFilePath, "", "utf-8");
    return {
      count: 0,
      outputPath: sqlFilePath,
    };
  }

  let sql = "BEGIN TRANSACTION;\n";
  let count = 0;

  for (const line of dataLines) {
    const values = parseCSVLine(line);
    if (values.length >= 4) {
      const [id, question_id, difficulty, answered_at] = values;

      sql += `INSERT OR REPLACE INTO answer_logs (id, question_id, difficulty, answered_at)\n`;
      sql += `VALUES (${id || "NULL"}, '${escapeSQLString(question_id)}', '${escapeSQLString(difficulty)}', '${escapeSQLString(answered_at)}');\n`;
      count++;
    }
  }

  sql += "COMMIT;\n";

  writeFileSync(sqlFilePath, sql, "utf-8");

  return {
    count,
    outputPath: sqlFilePath,
  };
}

// CLI interface
if (require.main === module) {
  const [, , type, csvPath, sqlPath] = process.argv;

  if (!type || !csvPath || !sqlPath) {
    console.error("Usage: tsx csv-import.ts <questions|answer_logs> <csv_path> <sql_path>");
    process.exit(1);
  }

  try {
    let result;
    if (type === "questions") {
      result = questionsCSVToSQL(csvPath, sqlPath);
      console.log(`✅ Prepared ${result.count} questions for import`);
    } else if (type === "answer_logs") {
      result = answerLogsCSVToSQL(csvPath, sqlPath);
      if (result.count === 0) {
        console.log(`⚠️  No answer logs to import`);
      } else {
        console.log(`✅ Prepared ${result.count} answer logs for import`);
      }
    } else {
      console.error(`Unknown type: ${type}. Use 'questions' or 'answer_logs'`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Conversion failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
