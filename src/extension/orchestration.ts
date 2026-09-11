import * as vscode from 'vscode';
import { fetchPR } from './github/fetchPR';
import { PRFile, RawPRData } from './github/types';
import { parseDiff } from './parser/diffParser';
import { initializeTreeSitter } from './parser/treeSitter';
import { FileSymbolMap, mapContextFiles, mapHunksToSymbols } from './parser/symbolMapper';
import { buildCallGraph, buildDependencyMap } from './parser/callGraph';
import { hopCandidatePaths, resolveBindings } from './parser/imports';
import { fetchRepoFiles } from './github/fetchContext';
import { MAX_CONTEXT_FILES, MAX_FILES, MAX_PROMPT_DIFFS, WARN_HUNKS } from './limits';
import { callLLM } from './llm/client';
import { LLMConfig, LLMRequest, LLMResponse } from './llm/types';
import { PromptSanitizer } from './llm/sanitizer';
import { NeedsModelError, formatModelLabel } from './llm/resolve';
import { ensureLLMConfig } from './llm/secretStorage';
import { DiffHunk, WebviewData } from './webview/messaging';
import { orderHunksByStory } from './algorithm/storyOrder';
import { bindRecommendedChapters, buildReviewCatalog } from './algorithm/chapters';
import { log, timed } from './log';

export { MAX_FILES, WARN_HUNKS };

export interface LoadProgress {
  progress: number;
  stage: string;
}

export interface BuildWalkthroughDeps {
  mapHunksToSymbols?: (hunks: DiffHunk[], files: PRFile[]) => Promise<FileSymbolMap[]>;
  callLLM?: (request: LLMRequest, config: LLMConfig) => Promise<LLMResponse>;
  onTooManyHunks?: (hunkCount: number) => Promise<boolean>;
  fetchContextFiles?: (paths: string[]) => Promise<Array<{ path: string; content: string }>>;
  onProgress?: (update: LoadProgress) => void;
}

export async function buildWalkthrough(
  prUrl: string,
  rawPRData: RawPRData,
  llmConfig: LLMConfig,
  userPrompt: string | undefined,
  deps: BuildWalkthroughDeps = {}
): Promise<WebviewData> {
  if (rawPRData.files.length > MAX_FILES) {
    throw new Error(`PR too large: ${rawPRData.files.length} files. Maximum ${MAX_FILES} supported.`);
  }

  const hunks = parseDiff(rawPRData.diff);
  log(`Diff: ${hunks.length} hunks, ${rawPRData.files.length} files, ${rawPRData.diff.length} chars`);

  if (hunks.length > WARN_HUNKS) {
    const shouldContinue = deps.onTooManyHunks
      ? await deps.onTooManyHunks(hunks.length)
      : true;

    if (!shouldContinue) {
      throw new Error('User cancelled due to large PR size');
    }
  }

  const mapSymbols = deps.mapHunksToSymbols ?? mapHunksToSymbols;
  const invokeLLM = deps.callLLM ?? callLLM;
  const report = deps.onProgress;

  let fileMaps: FileSymbolMap[] = [];
  try {
    report?.({ progress: 52, stage: `Parsing ${rawPRData.files.length} files…` });
    fileMaps = await timed('parse symbols', () => mapSymbols(hunks, rawPRData.files), `${rawPRData.files.length} files`);
    report?.({ progress: 60, stage: 'Loading related files…' });
    fileMaps = await timed('one-hop context', () => attachOneHopContext(fileMaps, deps.fetchContextFiles));
  } catch (error) {
    console.error('Symbol mapping failed, continuing without symbols:', error);
  }

  const knownPaths = fileMaps.map((fileMap) => fileMap.filePath);
  const bindings = resolveBindings(fileMaps, knownPaths);
  const callGraph = buildCallGraph(fileMaps, bindings);
  const dependencyMap = buildDependencyMap(callGraph);
  const orderedHunks = orderHunksByStory(hunks, fileMaps, dependencyMap);
  const catalog = buildReviewCatalog(orderedHunks, dependencyMap);

  const llmRequest: LLMRequest = {
    prMetadata: rawPRData.metadata,
    treeText: catalog.treeText,
    entryPoints: catalog.entryPoints,
    leafNodes: catalog.leafNodes,
    edges: catalog.edges,
    files: catalog.files.map((file, index) => ({
      path: file.path,
      kind: file.kind,
      symbolIds: file.symbolIds,
      sampleDiff: index < MAX_PROMPT_DIFFS ? file.sampleDiff : '',
    })),
    contextFiles: fileMaps
      .filter((fileMap) => !fileMap.inPr && fileMap.sourceSnippet)
      .map((fileMap) => ({
        path: fileMap.filePath,
        symbolNames: fileMap.postSymbols.map((symbol) => symbol.name),
        snippet: fileMap.sourceSnippet || '',
      })),
    userPrompt,
  };

  report?.({ progress: 78, stage: 'Writing the walkthrough…' });
  const promptFiles = llmRequest.files.filter((file) => file.sampleDiff).length;
  log(`LLM ${formatModelLabel(llmConfig)}; ${promptFiles} diffs, ${llmRequest.contextFiles?.length || 0} context files`);
  const llmResponse = await timed('llm', () => invokeLLM(llmRequest, llmConfig));

  const files: WebviewData['files'] = {};
  for (const file of rawPRData.files) {
    files[file.path] = {
      preContent: file.preContent || '',
      postContent: file.postContent || '',
    };
  }

  return {
    prMetadata: {
      title: rawPRData.metadata.title,
      url: prUrl,
      owner: rawPRData.metadata.owner,
      repo: rawPRData.metadata.repo,
      prNumber: rawPRData.metadata.prNumber,
    },
    summary: llmResponse.summary,
    howToReview: llmResponse.howToReview,
    chapters: bindRecommendedChapters(llmResponse.chapters, catalog, orderedHunks),
    files,
    hunks: orderedHunks,
  };
}

export async function processPR(
  context: vscode.ExtensionContext,
  prUrl: string,
  userPrompt?: string,
  onProgress?: (update: LoadProgress) => void
): Promise<WebviewData> {
  try {
    let sanitizedPrompt: string | undefined;
    if (userPrompt) {
      try {
        sanitizedPrompt = PromptSanitizer.sanitize(userPrompt);
      } catch (error) {
        vscode.window.showWarningMessage(`Invalid user prompt: ${error}`);
        sanitizedPrompt = undefined;
      }
    }

    const started = Date.now();
    log(`Walkthrough start ${prUrl}`);
    onProgress?.({ progress: 4, stage: 'Checking GitHub access…' });
    const llmConfig = await ensureLLMConfig(context);
    log(`Model: ${formatModelLabel(llmConfig)}`);

    try {
      await initializeTreeSitter(context);
    } catch (error) {
      console.error('Failed to initialize tree-sitter, continuing without symbols:', error);
    }

    onProgress?.({ progress: 8, stage: 'Fetching pull request…' });
    const rawPRData = await timed('fetch PR', () => fetchPR(context, prUrl, (completed, total) => {
      const fraction = total === 0 ? 1 : completed / total;
      onProgress?.({
        progress: 10 + Math.round(fraction * 40),
        stage: `Fetching files ${completed} of ${total}…`,
      });
    }));

    const result = await buildWalkthrough(prUrl, rawPRData, llmConfig, sanitizedPrompt, {
      onProgress,
      onTooManyHunks: async (hunkCount) => {
        const choice = await vscode.window.showWarningMessage(
          `PR has ${hunkCount} hunks. This may take a while.`,
          'Continue',
          'Cancel'
        );
        return choice !== 'Cancel';
      },
      fetchContextFiles: async (paths) => {
        log(`One-hop candidates: ${paths.length}`);
        return fetchRepoFiles(
          context,
          rawPRData.metadata.owner,
          rawPRData.metadata.repo,
          rawPRData.metadata.headSha,
          paths,
          (completed, total) => {
            const fraction = total === 0 ? 1 : completed / total;
            onProgress?.({
              progress: 60 + Math.round(fraction * 10),
              stage: `Loading related files ${completed} of ${total}…`,
            });
          }
        );
      },
    });
    log(`Walkthrough done ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    if (error instanceof NeedsModelError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        throw new Error('GitHub API rate limit exceeded. Run "PR Walkthrough: Sign in to GitHub" and try again.');
      }
      if (error.message.includes('language model')) {
        throw error;
      }
      if (error.message.includes('Failed to initialize tree-sitter')) {
        throw new Error('Failed to initialize code parser. Please try reinstalling the extension.');
      }
      throw error;
    }
    throw new Error('An unexpected error occurred while processing the PR');
  }
}

async function attachOneHopContext(
  fileMaps: FileSymbolMap[],
  fetchContextFiles?: (paths: string[]) => Promise<Array<{ path: string; content: string }>>
): Promise<FileSymbolMap[]> {
  if (!fetchContextFiles) {
    return fileMaps;
  }

  const prPaths = new Set(fileMaps.filter((fileMap) => fileMap.inPr).map((fileMap) => fileMap.filePath));
  const searchPaths: string[] = [];
  const seen = new Set<string>();

  for (const fileMap of fileMaps) {
    if (!fileMap.inPr) {
      continue;
    }
    for (const raw of fileMap.imports) {
      for (const candidate of hopCandidatePaths(fileMap.filePath, raw.specifier, prPaths)) {
        if (prPaths.has(candidate) || seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);
        searchPaths.push(candidate);
      }
    }
  }

  if (searchPaths.length === 0) {
    return fileMaps;
  }

  const extraFiles = await fetchContextFiles(searchPaths);
  const unique: Array<{ path: string; content: string }> = [];
  const foundStems = new Set<string>();

  for (const file of extraFiles) {
    const stem = file.path.replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/, '').replace(/\/index$/, '');
    if (foundStems.has(stem) || unique.length >= MAX_CONTEXT_FILES) {
      continue;
    }
    foundStems.add(stem);
    unique.push(file);
  }

  if (unique.length === 0) {
    return fileMaps;
  }

  try {
    return [...fileMaps, ...await mapContextFiles(unique)];
  } catch (error) {
    console.error('Failed to parse one-hop context files:', error);
    return fileMaps;
  }
}
