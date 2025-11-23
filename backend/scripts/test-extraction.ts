import { extractContentFromUrl } from "../src/lib/web-extractor";
import { splitMarkdownByHeaders } from "../src/lib/semantic-chunker";

interface Env {
  OPENAI_API_KEY: string;
}

const TEST_URLS = {
  good: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures",
  empty: "https://google.com",
  large: "https://eloquentjavascript.net/01_values.html",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const results = [];

    // Test 1: Good content
    console.log("Test 1: Extracting good content...");
    const good = await extractContentFromUrl(TEST_URLS.good);
    results.push({
      test: "good_content",
      success: good.success,
      wordCount: good.data?.wordCount,
    });
    console.log(`✓ Result: ${good.success ? "Success" : "Failed"}`);
    if (good.success && good.data) {
      console.log(`  Word count: ${good.data.wordCount}`);
      console.log(`  Title: ${good.data.title}`);
    } else {
      console.log(`  Error: ${good.error}`);
    }

    // Test 2: Empty/minimal content (should fail)
    console.log("\nTest 2: Testing minimal content rejection...");
    const empty = await extractContentFromUrl(TEST_URLS.empty);
    results.push({
      test: "empty_content",
      shouldFail: true,
      failed: !empty.success,
      errorType: empty.errorType,
    });
    console.log(`✓ Result: ${!empty.success ? "Correctly rejected" : "Unexpectedly succeeded"}`);
    if (!empty.success) {
      console.log(`  Error type: ${empty.errorType}`);
      console.log(`  Error: ${empty.error}`);
    }

    // Test 3: Semantic chunking
    console.log("\nTest 3: Testing semantic chunking...");
    if (good.success && good.data) {
      const chunks = splitMarkdownByHeaders(good.data.content);
      const avgWordsPerChunk =
        chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length;
      results.push({
        test: "chunking",
        chunkCount: chunks.length,
        avgWordsPerChunk: Math.round(avgWordsPerChunk),
      });
      console.log(`✓ Split into ${chunks.length} chunks`);
      console.log(`  Average words per chunk: ${Math.round(avgWordsPerChunk)}`);

      // Show first chunk details
      if (chunks.length > 0) {
        console.log(`  First chunk headers: ${chunks[0].metadata.headers.join(" > ")}`);
        console.log(`  First chunk words: ${chunks[0].wordCount}`);
      }
    } else {
      console.log(`✗ Skipped (good content extraction failed)`);
    }

    console.log("\n=== Test Summary ===");
    console.log(JSON.stringify(results, null, 2));

    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
