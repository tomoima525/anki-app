import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export interface ExtractedContent {
  title: string;
  content: string; // Clean markdown
  textContent: string; // Plain text for word counting
  wordCount: number;
  url: string;
  byline?: string; // Author if available
  excerpt?: string; // Summary
  siteName?: string;
}

export interface ExtractionResult {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
  errorType?: "too_small" | "fetch_failed" | "parse_failed" | "empty_content";
}

/**
 * Fetches and extracts main content from a web URL
 * Uses Mozilla Readability for smart extraction (removes ads, navbars, etc.)
 */
export async function extractContentFromUrl(
  url: string,
  userAgent: string = "Anki-Interview-App/1.0"
): Promise<ExtractionResult> {
  try {
    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        errorType: "fetch_failed",
      };
    }

    const html = await response.text();

    // Parse HTML and extract main content using Readability
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article || !article.content) {
      return {
        success: false,
        error: "No main content found. This might be a landing page or login wall.",
        errorType: "empty_content",
      };
    }

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Preserve code blocks
    turndownService.addRule("preserveCode", {
      filter: ["pre", "code"],
      replacement: (content, node) => {
        if (node.nodeName === "PRE") {
          const codeElement = node.querySelector("code");
          const language = codeElement?.className.match(/language-(\w+)/)?.[1] || "";
          return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
        }
        return `\`${content}\``;
      },
    });

    const markdown = turndownService.turndown(article.content);
    const textContent = article.textContent || "";
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    // Phase 2 Guardrail: Check word count
    if (wordCount < 50) {
      return {
        success: false,
        error: `Insufficient content (${wordCount} words). Page may be too small or content unavailable.`,
        errorType: "too_small",
      };
    }

    return {
      success: true,
      data: {
        title: article.title || "Untitled",
        content: markdown,
        textContent,
        wordCount,
        url,
        byline: article.byline || undefined,
        excerpt: article.excerpt || undefined,
        siteName: article.siteName || undefined,
      },
    };
  } catch (error) {
    console.error("Content extraction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
      errorType: "parse_failed",
    };
  }
}

/**
 * Determines if URL is a GitHub URL and should use GitHub API instead
 */
export function isGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "github.com" ||
      urlObj.hostname === "raw.githubusercontent.com"
    );
  } catch {
    return false;
  }
}

/**
 * Estimates token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
