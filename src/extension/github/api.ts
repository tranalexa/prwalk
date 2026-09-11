import * as vscode from 'vscode';
import { Octokit } from 'octokit';
import { log } from '../log';

const GITHUB_SCOPES = ['repo'];

export type GitHubAuthKind = 'pat' | 'session' | 'anonymous';

let octokitInstance: Octokit | null = null;
let authKind: GitHubAuthKind = 'anonymous';

export function githubAuthKind(): GitHubAuthKind {
  return authKind;
}

export async function getOctokit(context: vscode.ExtensionContext): Promise<Octokit> {
  if (octokitInstance) {
    return octokitInstance;
  }

  const pat = (await context.secrets.get('prwalk.github.pat'))?.trim();
  const session = pat ? undefined : await editorGitHubToken();
  const token = pat || session;
  authKind = pat ? 'pat' : session ? 'session' : 'anonymous';
  log(`GitHub auth: ${authKind}`);

  octokitInstance = createOctokit(token);
  return octokitInstance;
}

export async function signInWithGitHub(): Promise<boolean> {
  const token = await editorGitHubToken({ prompt: true });
  if (!token) {
    return false;
  }
  authKind = 'session';
  octokitInstance = createOctokit(token);
  log('GitHub auth: session');
  return true;
}

export async function setGitHubPAT(context: vscode.ExtensionContext, pat: string): Promise<void> {
  await context.secrets.store('prwalk.github.pat', pat);
  authKind = 'pat';
  octokitInstance = createOctokit(pat);
}

export async function clearGitHubPAT(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete('prwalk.github.pat');
  invalidateOctokit();
}

export function invalidateOctokit(): void {
  octokitInstance = null;
  authKind = 'anonymous';
}

export function watchGitHubSessions(): vscode.Disposable {
  try {
    return vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === 'github') {
        invalidateOctokit();
      }
    });
  } catch {
    return { dispose() {} };
  }
}

function createOctokit(auth?: string): Octokit {
  return new Octokit({
    auth,
    request: { timeout: 20000 },
    throttle: {
      onRateLimit: (retryAfter: number) => {
        log(`Primary rate limit; GitHub asked to wait ${retryAfter}s. Not waiting.`);
        return false;
      },
      onSecondaryRateLimit: (retryAfter: number) => {
        log(`Secondary rate limit; GitHub asked to wait ${retryAfter}s. Not waiting.`);
        return false;
      },
    },
  });
}

async function editorGitHubToken(options?: { prompt?: boolean }): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession(
      'github',
      GITHUB_SCOPES,
      options?.prompt ? { createIfNone: true } : { silent: true }
    );
    return session?.accessToken;
  } catch {
    return undefined;
  }
}
