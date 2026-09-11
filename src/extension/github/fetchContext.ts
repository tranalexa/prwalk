import { getOctokit } from './api';
import * as vscode from 'vscode';
import { GITHUB_CONTENT_CONCURRENCY, MAX_CONTEXT_FILES } from '../limits';
import { mapPool } from '../../utils/mapPool';
import { log } from '../log';
import { hopFileStem } from '../parser/imports';

export async function fetchRepoFiles(
  context: vscode.ExtensionContext,
  owner: string,
  repo: string,
  ref: string,
  candidatePaths: string[],
  onFileProgress?: (completed: number, total: number) => void
): Promise<Array<{ path: string; content: string }>> {
  const octokit = await getOctokit(context);
  const found: Array<{ path: string; content: string }> = [];
  const foundStems = new Set<string>();
  const queued: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidatePaths) {
    if (queued.length >= MAX_CONTEXT_FILES * 6) {
      break;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    queued.push(candidate);
  }

  let completed = 0;
  await mapPool(
    queued,
    GITHUB_CONTENT_CONCURRENCY,
    async (candidate) => {
      if (found.length >= MAX_CONTEXT_FILES || foundStems.has(hopFileStem(candidate))) {
        completed += 1;
        onFileProgress?.(completed, queued.length);
        return;
      }

      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: candidate,
          ref,
        });

        if (!('content' in data) || !data.content || data.type !== 'file') {
          return;
        }

        const stem = hopFileStem(candidate);
        if (foundStems.has(stem) || found.length >= MAX_CONTEXT_FILES) {
          return;
        }

        foundStems.add(stem);
        found.push({
          path: candidate,
          content: Buffer.from(data.content, 'base64').toString('utf-8'),
        });
      } catch {
        // Missing candidates are expected while probing extensions.
      } finally {
        completed += 1;
        onFileProgress?.(completed, queued.length);
      }
    },
    { shouldStop: () => found.length >= MAX_CONTEXT_FILES }
  );

  const extra = found.slice(0, MAX_CONTEXT_FILES);
  log(`One-hop found ${extra.length}/${queued.length} candidates`);
  return extra;
}

