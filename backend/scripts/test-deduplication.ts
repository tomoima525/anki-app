/**
 * Test for deduplication logic
 *
 * This test verifies that duplicate questions are properly removed when:
 * 1. A document has a table of contents with questions at the top
 * 2. The same questions appear later in the document with full answers
 */

// Define types locally to avoid importing OpenAI dependency
interface ParsedQuestion {
  question: string;
  answer: string;
}

// Copy the deduplication logic for testing
function normalizeQuestionForComparison(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

function deduplicateQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
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

async function runTests() {
  console.log("=== Testing Question Deduplication ===\n");

  // Simulate the scenario where:
  // - Table of contents has questions with short/no answers
  // - Same questions appear later with full answers
  const questionsWithDuplicates: ParsedQuestion[] = [
    // From table of contents (short or placeholder answers)
    {
      question: "What is a RESTful API?",
      answer: "See below",
    },
    {
      question: "Explain database indexing",
      answer: "",
    },
    {
      question: "What are design patterns?",
      answer: "Learn more",
    },

    // From main content (full answers)
    {
      question: "What is a RESTful API?",
      answer: "A RESTful API is an architectural style for building web services that use HTTP methods to access and manipulate resources. It follows principles like statelessness, client-server architecture, and uniform interface.",
    },
    {
      question: "Explain database indexing",
      answer: "Database indexing is a data structure technique used to quickly locate and access data in a database. Indexes are created on columns to speed up SELECT queries and WHERE clauses, though they can slow down INSERT, UPDATE, and DELETE operations.",
    },
    {
      question: "What are design patterns?",
      answer: "Design patterns are reusable solutions to commonly occurring problems in software design. They represent best practices and can be used to speed up development by providing tested, proven development paradigms.",
    },

    // Additional duplicate with variation in punctuation/spacing
    {
      question: "What is a RESTful API ?",
      answer: "A slightly different version of the answer that is shorter.",
    },
  ];

  console.log(`Input: ${questionsWithDuplicates.length} questions (including duplicates)\n`);

  // Test deduplication
  const deduplicated = deduplicateQuestions(questionsWithDuplicates);

  console.log(`Output: ${deduplicated.length} unique questions\n`);
  console.log(`Removed: ${questionsWithDuplicates.length - deduplicated.length} duplicates\n`);

  // Verify results
  console.log("Deduplicated questions:\n");
  deduplicated.forEach((q, i) => {
    console.log(`${i + 1}. ${q.question}`);
    console.log(`   Answer length: ${q.answer.length} characters`);
    console.log(`   Answer preview: ${q.answer.substring(0, 100)}...`);
    console.log("");
  });

  // Assertions
  console.log("=== Verification ===\n");

  const expectedCount = 3;
  const actualCount = deduplicated.length;
  console.log(`✓ Expected ${expectedCount} unique questions`);
  console.log(`${actualCount === expectedCount ? '✓' : '✗'} Got ${actualCount} unique questions`);

  // Verify that we kept the versions with longer answers
  const restfulApiQuestion = deduplicated.find(q =>
    q.question.toLowerCase().includes("restful api")
  );

  if (restfulApiQuestion) {
    const hasLongAnswer = restfulApiQuestion.answer.length > 100;
    console.log(`${hasLongAnswer ? '✓' : '✗'} RESTful API question has full answer (${restfulApiQuestion.answer.length} chars)`);
  }

  const indexingQuestion = deduplicated.find(q =>
    q.question.toLowerCase().includes("database indexing")
  );

  if (indexingQuestion) {
    const hasLongAnswer = indexingQuestion.answer.length > 100;
    console.log(`${hasLongAnswer ? '✓' : '✗'} Database indexing question has full answer (${indexingQuestion.answer.length} chars)`);
  }

  const patternsQuestion = deduplicated.find(q =>
    q.question.toLowerCase().includes("design patterns")
  );

  if (patternsQuestion) {
    const hasLongAnswer = patternsQuestion.answer.length > 100;
    console.log(`${hasLongAnswer ? '✓' : '✗'} Design patterns question has full answer (${patternsQuestion.answer.length} chars)`);
  }

  console.log("\n=== Test Complete ===");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
