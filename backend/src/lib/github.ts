import { Octokit } from "@octokit/rest";

export interface FetchResult {
  content: string;
  source: string;
  fetchedAt: Date;
}

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  path: string;
  ref?: string; // branch, tag, or commit SHA
}

/**
 * Parses a GitHub URL (raw or regular) to extract owner, repo, path, and ref
 * Supports:
 * - https://raw.githubusercontent.com/owner/repo/branch/path
 * - https://github.com/owner/repo/blob/branch/path
 */
function parseGitHubUrl(url: string): ParsedGitHubUrl {
  try {
    const urlObj = new URL(url);

    // Handle raw.githubusercontent.com URLs
    if (urlObj.hostname === "raw.githubusercontent.com") {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length < 3) {
        throw new Error("Invalid raw GitHub URL format");
      }

      const owner = parts[0];
      const repo = parts[1];
      let ref: string | undefined;
      let pathStartIndex: number;

      // Handle refs/heads/branch format
      if (parts.length >= 5 && parts[2] === "refs" && parts[3] === "heads") {
        ref = parts[4]; // branch name
        pathStartIndex = 5;
      } else {
        // Simple format: owner/repo/branch/path
        ref = parts[2];
        pathStartIndex = 3;
      }

      const path = parts.slice(pathStartIndex).join("/");

      return {
        owner,
        repo,
        ref,
        path,
      };
    }

    // Handle github.com URLs
    if (urlObj.hostname === "github.com") {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length < 5 || parts[2] !== "blob") {
        throw new Error(
          "Invalid GitHub URL format. Expected: /owner/repo/blob/branch/path"
        );
      }

      return {
        owner: parts[0],
        repo: parts[1],
        ref: parts[3],
        path: parts.slice(4).join("/"),
      };
    }

    throw new Error(`Unsupported GitHub URL hostname: ${urlObj.hostname}`);
  } catch (error) {
    throw new Error(`Failed to parse GitHub URL: ${error}`);
  }
}

export async function fetchMarkdownFromGitHub(
  url: string,
  githubToken: string
): Promise<FetchResult> {
  try {
    const parsed = parseGitHubUrl(url);

    // Initialize Octokit with authentication if provided
    const octokit = new Octokit({
      auth: githubToken,
    });

    // Fetch file content using GitHub API
    const response = await octokit.rest.repos.getContent({
      owner: parsed.owner,
      repo: parsed.repo,
      path: parsed.path,
      ref: parsed.ref,
    });

    // Check if response is a file (not a directory)
    if (Array.isArray(response.data)) {
      throw new Error("URL points to a directory, not a file");
    }

    // Decode base64 content
    if (response.data.type !== "file" || !response.data.content) {
      throw new Error("Response is not a file or has no content");
    }

    // Decode base64 using atob (Web API available in Cloudflare Workers)
    // GitHub API returns content with newlines, so we need to remove them first
    const base64Content = response.data.content.replace(/\n/g, "");
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const content = new TextDecoder().decode(bytes);

    return {
      content,
      source: url,
      fetchedAt: new Date(),
    };
  } catch (error) {
    console.error("GitHub fetch error:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to fetch markdown from GitHub: ${error.message}`);
    }
    throw new Error(`Failed to fetch markdown from GitHub: ${error}`);
  }
}

export async function fetchMultipleSources(
  urls: string[],
  githubToken: string
): Promise<FetchResult[]> {
  const promises = urls.map((url) => fetchMarkdownFromGitHub(url, githubToken));
  return await Promise.all(promises);
}
