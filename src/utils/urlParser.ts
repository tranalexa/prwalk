export interface GitHubPRUrlParts {
  owner: string;
  repo: string;
  prNumber: number;
}

export function parseGitHubPRUrl(url: string): GitHubPRUrlParts {
  const match = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error('Invalid GitHub PR URL format');
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}
