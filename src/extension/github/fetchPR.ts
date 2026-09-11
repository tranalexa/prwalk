import { Octokit } from 'octokit';
import * as vscode from 'vscode';
import { parseGitHubPRUrl } from '../../utils/urlParser';
import { mapPool } from '../../utils/mapPool';
import { RawPRData, PRMetadata, PRFile, GitHubFile } from './types';
import { getOctokit, githubAuthKind, signInWithGitHub } from './api';
import { GITHUB_CONTENT_CONCURRENCY, MAX_FILES } from '../limits';
import { log } from '../log';

export async function fetchPR(
  context: vscode.ExtensionContext,
  prUrl: string,
  onFileProgress?: (completed: number, total: number) => void
): Promise<RawPRData> {
  const { owner, repo, prNumber } = parseGitHubPRUrl(prUrl);
  let octokit = await getOctokit(context);

  if (githubAuthKind() === 'anonymous') {
    log('Anonymous GitHub access is 60 requests/hour. Prompting sign-in.');
    const signedIn = await signInWithGitHub();
    if (signedIn) {
      octokit = await getOctokit(context);
    } else {
      log('Sign-in skipped; large PRs will likely hit the anonymous cap.');
    }
  }

  log('Fetching PR metadata');
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const metadata: PRMetadata = {
    owner,
    repo,
    prNumber: pr.number,
    title: pr.title,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
  };

  log('Listing changed files');
  const files: GitHubFile[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data: pageFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      page,
      per_page: 100,
    });

    files.push(...pageFiles);
    hasMore = pageFiles.length === 100;
    page++;

    if (files.length > MAX_FILES) {
      throw new Error(`PR too large: ${files.length} files. Maximum ${MAX_FILES} supported.`);
    }
  }

  if (githubAuthKind() === 'anonymous' && files.length > 20) {
    throw new Error(
      `This PR has ${files.length} files. Anonymous GitHub access cannot fetch it. Run "PR Walkthrough: Sign in to GitHub" and try again.`
    );
  }

  log(`Listed ${files.length} files, fetching diff`);
  const { data: diffData } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: 'diff',
    },
  });

  const diff = typeof diffData === 'string' ? diffData : '';

  log(`Fetching contents for ${files.length} files`);
  let completed = 0;
  const prFiles = await mapPool(files, GITHUB_CONTENT_CONCURRENCY, async (file) => {
    const result = await fetchFileContents(octokit, owner, repo, file, metadata);
    completed += 1;
    onFileProgress?.(completed, files.length);
    return result;
  });

  const missing = prFiles.filter((file) => {
    const needsPre = file.status !== 'added' && !file.preContent;
    const needsPost = file.status !== 'deleted' && !file.postContent;
    return needsPre || needsPost;
  }).length;
  log(`Fetched ${prFiles.length} files (${missing} missing pre/post content), diff ${diff.length} chars`);

  return {
    metadata,
    diff,
    files: prFiles,
  };
}

async function fetchFileContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  file: GitHubFile,
  metadata: PRMetadata
): Promise<PRFile> {
  let preContent: string | null = null;
  let postContent: string | null = null;

  if (file.status !== 'added') {
    preContent = await readRepoFile(octokit, owner, repo, file.filename, metadata.baseSha, 'pre');
  }

  if (file.status !== 'deleted') {
    postContent = await readRepoFile(octokit, owner, repo, file.filename, metadata.headSha, 'post');
  }

  return {
    path: file.filename,
    status: file.status === 'removed' ? 'deleted' : file.status as 'added' | 'modified' | 'deleted',
    preContent,
    postContent,
  };
}

async function readRepoFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  side: 'pre' | 'post'
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch (error) {
    if (isGitHubRateLimit(error)) {
      throw new Error('GitHub API rate limit exceeded. Run "PR Walkthrough: Sign in to GitHub" and try again.');
    }
    console.warn(`Failed to fetch ${side}-content for ${path}:`, error);
  }
  return null;
}

function isGitHubRateLimit(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || /rate limit|secondary rate/i.test(message);
}
