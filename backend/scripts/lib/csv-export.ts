/**
 * CSV Export Utility
 * Converts D1 database query results to CSV format
 */

import { readFileSync, writeFileSync } from "fs";

interface WranglerResult {
  results: Record<string, any>[];
  success: boolean;
  meta: {
    duration: number;
  };
}

/**
 * Escape CSV values
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined || value === "null") {
    return "";
  }
  const stringValue = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

/**
 * Convert array of objects to CSV format
 */
function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  headers: (keyof T)[]
): string {
  if (data.length === 0) {
    return headers.join(",") + "\n";
  }

  // Create header row
  const headerRow = headers.join(",");

  // Create data rows
  const dataRows = data
    .map((row) => {
      return headers.map((header) => escapeCSV(row[header])).join(",");
    })
    .join("\n");

  return headerRow + "\n" + dataRows;
}

/**
 * Export questions from wrangler JSON output to CSV
 */
export function exportQuestionsToCSV(
  jsonFilePath: string,
  csvFilePath: string
): { count: number; outputPath: string } {
  const jsonContent = readFileSync(jsonFilePath, "utf-8");
  const data: WranglerResult[] = JSON.parse(jsonContent);

  if (!data[0] || !data[0].results) {
    throw new Error("No data found in wrangler output");
  }

  const results = data[0].results;

  const csv = arrayToCSV(results, [
    "id",
    "question_text",
    "answer_text",
    "source",
    "created_at",
    "updated_at",
    "last_answered_at",
    "last_difficulty",
    "answer_count",
    "source_name",
  ]);

  writeFileSync(csvFilePath, csv, "utf-8");

  return {
    count: results.length,
    outputPath: csvFilePath,
  };
}

/**
 * Export answer logs from wrangler JSON output to CSV
 */
export function exportAnswerLogsToCSV(
  jsonFilePath: string,
  csvFilePath: string
): { count: number; outputPath: string } {
  const jsonContent = readFileSync(jsonFilePath, "utf-8");
  const data: WranglerResult[] = JSON.parse(jsonContent);

  if (!data[0] || !data[0].results) {
    // No answer logs found - create empty CSV with headers
    writeFileSync(csvFilePath, "id,question_id,difficulty,answered_at\n", "utf-8");
    return {
      count: 0,
      outputPath: csvFilePath,
    };
  }

  const results = data[0].results;

  const csv = arrayToCSV(results, [
    "id",
    "question_id",
    "difficulty",
    "answered_at",
  ]);

  writeFileSync(csvFilePath, csv, "utf-8");

  return {
    count: results.length,
    outputPath: csvFilePath,
  };
}

// CLI interface
if (require.main === module) {
  const [, , type, jsonPath, csvPath] = process.argv;

  if (!type || !jsonPath || !csvPath) {
    console.error("Usage: tsx csv-export.ts <questions|answer_logs> <json_path> <csv_path>");
    process.exit(1);
  }

  try {
    let result;
    if (type === "questions") {
      result = exportQuestionsToCSV(jsonPath, csvPath);
      console.log(`✅ Exported ${result.count} questions to: ${result.outputPath}`);
    } else if (type === "answer_logs") {
      result = exportAnswerLogsToCSV(jsonPath, csvPath);
      if (result.count === 0) {
        console.log(`⚠️  No answer logs found`);
      }
      console.log(`✅ Exported ${result.count} answer logs to: ${result.outputPath}`);
    } else {
      console.error(`Unknown type: ${type}. Use 'questions' or 'answer_logs'`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Export failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
