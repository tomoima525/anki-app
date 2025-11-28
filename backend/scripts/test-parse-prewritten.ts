/**
 * Test for parsePrewrittenQA function using real GitHub markdown content
 *
 * This test uses actual content from:
 * - JavaScript Interview Questions (has pre-written answers)
 */

import "dotenv/config";
import {
  hasPrewrittenAnswers,
  hasPrewrittenAnswersWithAI,
  parsePrewrittenQA,
} from "../src/lib/openai-parser";

// Sample from: https://raw.githubusercontent.com/sudheerj/javascript-interview-questions/master/README.md
// This document HAS answers
const javascriptQuestionsWithAnswers = `
### 102. Who created javascript

JavaScript was created by Brendan Eich in 1995 during his time at Netscape Communications. Initially it was developed under the name \`Mocha\`, but later the language was officially called \`LiveScript\` when it first shipped in beta releases of Netscape.

**[⬆ Back to Top](#table-of-contents)**

### 103. What is the use of preventDefault method

The preventDefault() method cancels the event if it is cancelable, meaning that the default action or behaviour that belongs to the event will not occur. For example, prevent form submission when clicking on submit button and prevent opening the page URL when clicking on hyperlink are some common use cases.

\`\`\`javascript
document
  .getElementById("link")
  .addEventListener("click", function (event) {
    event.preventDefault();
  });
\`\`\`

**Note:** Remember that not all events are cancelable.

**[⬆ Back to Top](#table-of-contents)**

### 104. What is the use of stopPropagation method

The stopPropagation method is used to stop the event from bubbling up the event chain. For example, the below nested divs with stopPropagation method prevents default event propagation when clicking on nested div(Div1)

\`\`\`javascript
<p>Click DIV1 Element</p>
<div onclick="secondFunc()">DIV 2
  <div onclick="firstFunc(event)">DIV 1</div>
</div>

<script>
function firstFunc(event) {
  alert("DIV 1");
  event.stopPropagation();
}

function secondFunc() {
  alert("DIV 2");
}
</script>
\`\`\`

**[⬆ Back to Top](#table-of-contents)**

### 105. What is BOM

The Browser Object Model (BOM) allows JavaScript to "talk to" the browser. It consists of the objects navigator, history, screen, location and document which are children of the window. The Browser Object Model is not standardized and can change based on different browsers.

![Screenshot](images/bom.png)

**[⬆ Back to Top](#table-of-contents)**
`;

// Sample from: https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md
// This document does NOT have answers (just questions)
const backendQuestionsWithoutAnswers = `
### Questions about Design Patterns:

#### Globals Are Evil
Why are global and static objects evil? Can you show it with a code example?

#### Inversion of Control
Tell me about Inversion of Control and how it improves the design of code.

#### Law of Demeter
The Law of Demeter (the Principle of Least Knowledge) states that each unit should have only limited knowledge about other units and it should only talk to its immediate friends (sometimes stated as "don't talk to strangers").
Would you write code violating this principle, show why it is a bad design and then fix it?

#### Singleton
Singleton is a design pattern that restricts the instantiation of a class to one single object. Writing a Thread-Safe Singleton class is not so obvious. Would you try?
`;

async function runTests() {
  console.log("=== Testing parsePrewrittenQA with Real GitHub Content ===\n");

  // Test 1: Regex-based detection
  console.log("1. Testing regex-based answer detection:");
  console.log(
    "   JavaScript questions (has answers):",
    hasPrewrittenAnswers(javascriptQuestionsWithAnswers)
  );
  console.log(
    "   Backend questions (no answers):",
    hasPrewrittenAnswers(backendQuestionsWithoutAnswers)
  );
  console.log("");

  // Test 2: AI-based detection (requires OPENAI_API_KEY)
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    console.log("2. Testing AI-based answer detection:");
    try {
      const jsHasAnswers = await hasPrewrittenAnswersWithAI(
        javascriptQuestionsWithAnswers,
        apiKey
      );
      const beHasAnswers = await hasPrewrittenAnswersWithAI(
        backendQuestionsWithoutAnswers,
        apiKey
      );
      console.log("   JavaScript questions (has answers):", jsHasAnswers);
      console.log("   Backend questions (no answers):", beHasAnswers);
    } catch (error) {
      console.log("   ✗ AI detection failed:", error);
    }
    console.log("");
  } else {
    console.log("2. Skipping AI-based detection (OPENAI_API_KEY not set)\n");
  }

  // Test 3: Parse Q&A from JavaScript questions (requires OPENAI_API_KEY)
  if (apiKey) {
    console.log("3. Testing parsePrewrittenQA with LLM on JavaScript questions:");
    try {
      const parsedQuestions = await parsePrewrittenQA(
        javascriptQuestionsWithAnswers,
        apiKey
      );
      console.log(`   ✓ Parsed ${parsedQuestions.length} questions\n`);

      // Display parsed questions
      parsedQuestions.forEach((q, i) => {
        console.log(`   Question ${i + 1}:`);
        console.log(`     Q: ${q.question.substring(0, 80)}...`);
        console.log(`     A: ${q.answer.substring(0, 80)}...`);
        console.log("");
      });

      // Test 4: Parse Q&A from Backend questions (should return empty or partial)
      console.log("4. Testing parsePrewrittenQA on Backend questions:");
      const parsedBackend = await parsePrewrittenQA(
        backendQuestionsWithoutAnswers,
        apiKey
      );
      console.log(`   ✓ Parsed ${parsedBackend.length} questions\n`);

      // Test 5: Verify question quality
      console.log("5. Verifying parsed question quality:");
      const hasValidQuestions = parsedQuestions.every(
        (q) =>
          q.question &&
          q.question.length > 10 &&
          q.answer &&
          q.answer.length > 10
      );
      console.log(
        `   All questions have valid Q&A: ${hasValidQuestions ? "✓" : "✗"}`
      );

      // Test 6: Check for code block preservation
      const hasCodeBlocks = parsedQuestions.some((q) =>
        q.answer.includes("```")
      );
      console.log(`   Code blocks preserved: ${hasCodeBlocks ? "✓" : "✗"}`);
    } catch (error) {
      console.log("   ✗ Parsing failed:", error);
    }
  } else {
    console.log(
      "3-6. Skipping parsePrewrittenQA tests (OPENAI_API_KEY not set)"
    );
  }

  console.log("\n=== Test Complete ===");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
