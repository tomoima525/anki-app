export interface FetchResult {
  content: string;
  source: string;
  fetchedAt: Date;
}

export async function fetchMarkdownFromGitHub(
  url: string,
  githubToken?: string
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'User-Agent': 'Anki-Interview-App',
  };

  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch from GitHub: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();

    return {
      content,
      source: url,
      fetchedAt: new Date(),
    };

  } catch (error) {
    console.error('GitHub fetch error:', error);
    throw new Error(`Failed to fetch markdown: ${error}`);
  }
}

export async function fetchMultipleSources(
  urls: string[],
  githubToken?: string
): Promise<FetchResult[]> {
  const promises = urls.map(url => fetchMarkdownFromGitHub(url, githubToken));
  return await Promise.all(promises);
}
