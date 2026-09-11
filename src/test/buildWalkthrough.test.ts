import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkthrough, MAX_FILES, WARN_HUNKS } from '../extension/orchestration';
import { FileSymbolMap } from '../extension/parser/symbolMapper';
import { SymbolInfo } from '../extension/parser/treeSitter';
import { LLMRequest, LLMResponse } from '../extension/llm/types';
import { DiffHunk } from '../extension/webview/messaging';
import { PRFile, RawPRData } from '../extension/github/types';
import { SAMPLE_DIFF, SAMPLE_GREET_POST, SAMPLE_MAIN_POST } from './fixtures';

function symbol(id: string, name: string, filePath: string): SymbolInfo {
  return {
    id,
    name,
    filePath,
    kind: 'function',
    byteRange: [0, 20],
    lineRange: [1, 8],
    definitionNode: {} as SymbolInfo['definitionNode'],
  };
}

const rawPRData: RawPRData = {
  metadata: {
    owner: 'acme',
    repo: 'demo',
    prNumber: 12,
    title: 'Add greet helper',
    baseSha: 'aaa',
    headSha: 'bbb',
  },
  diff: SAMPLE_DIFF,
  files: [
    {
      path: 'src/greet.ts',
      status: 'modified',
      preContent: 'export function greet(name: string): string {\n  return name;\n}\n',
      postContent: SAMPLE_GREET_POST,
    },
    {
      path: 'src/main.ts',
      status: 'modified',
      preContent: 'export function main() {\n}\n',
      postContent: SAMPLE_MAIN_POST,
    },
  ],
};

function fakeMaps(hunks: DiffHunk[], files: PRFile[]): FileSymbolMap[] {
  const greet = symbol('src/greet.ts:greet', 'greet', 'src/greet.ts');
  const main = symbol('src/main.ts:main', 'main', 'src/main.ts');

  return files.map((file) => {
    const fileSymbol = file.path.endsWith('main.ts') ? main : greet;
    return {
      filePath: file.path,
      preSymbols: [],
      postSymbols: [fileSymbol],
      hunks: hunks
        .filter((hunk) => hunk.filePath === file.path)
        .map((hunk) => ({
          hunk,
          symbols: [fileSymbol],
          isAmbiguous: false,
        })),
      imports: file.path.endsWith('main.ts')
        ? [{ localName: 'greet', importedName: 'greet', specifier: './greet' }]
        : [],
      inPr: true,
    };
  });
}

function fakeLLM(request: LLMRequest): LLMResponse {
  const logicFiles = request.files.filter((file) => file.kind === 'logic').map((file) => file.path);

  return {
    summary: 'Adds a greet helper and calls it from main.',
    howToReview: '1) Start at main. 2) Read the helper it calls.',
    chapters: [
      {
        title: 'Wire up greeting',
        briefing: 'Main starts calling greet so the helper actually runs.',
        filePaths: logicFiles,
        symbolIds: request.entryPoints.map((entry) => entry.id),
      },
    ],
  };
}

describe('buildWalkthrough', () => {
  it('sends the call graph and binds recommended files to our hunks', async () => {
    let captured: LLMRequest | undefined;

    const result = await buildWalkthrough(
      'https://github.com/acme/demo/pull/12',
      rawPRData,
      { provider: 'vscode' },
      'Focus on error handling',
      {
        mapHunksToSymbols: async (hunks, files) => fakeMaps(hunks, files),
        callLLM: async (request) => {
          captured = request;
          return fakeLLM(request);
        },
      }
    );

    assert.ok(captured);
    assert.match(captured.treeText, /greet/);
    assert.deepEqual(
      captured.files.map((file) => file.path).sort(),
      ['src/greet.ts', 'src/main.ts']
    );
    assert.equal(result.summary, 'Adds a greet helper and calls it from main.');
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0].title, 'Wire up greeting');
    assert.deepEqual(
      [...result.chapters[0].filePaths].sort(),
      ['src/greet.ts', 'src/main.ts']
    );
    assert.equal(
      result.hunks[result.chapters[0].hunkIndices[0]].filePath,
      result.chapters[0].filePaths[0]
    );
    assert.ok(
      result.chapters[0].hunkIndices.every((index) => {
        return result.chapters[0].filePaths.includes(result.hunks[index].filePath);
      })
    );
  });

  it('throws when the PR has too many files', async () => {
    const huge: RawPRData = {
      ...rawPRData,
      files: Array.from({ length: MAX_FILES + 1 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        status: 'modified' as const,
        preContent: '',
        postContent: '',
      })),
    };

    await assert.rejects(
      () =>
        buildWalkthrough(
          'https://github.com/acme/demo/pull/12',
          huge,
          { provider: 'vscode' },
          undefined
        ),
      /PR too large/
    );
  });

  it('keeps every hunk instead of truncating the walkthrough', async () => {
    const extraFiles = Array.from({ length: 12 }, (_, index) => ({
      path: `src/extra-${index}.ts`,
      status: 'modified' as const,
      preContent: 'export function extra() {}\n',
      postContent: 'export function extra() { return true; }\n',
    }));
    const extraDiff = extraFiles.map((file) => {
      return `diff --git a/${file.path} b/${file.path}
index 111..222 100644
--- a/${file.path}
+++ b/${file.path}
@@ -1,1 +1,1 @@
-export function extra() {}
+export function extra() { return true; }
`;
    }).join('');

    const result = await buildWalkthrough(
      'https://github.com/acme/demo/pull/12',
      {
        ...rawPRData,
        diff: rawPRData.diff + extraDiff,
        files: [...rawPRData.files, ...extraFiles],
      },
      { provider: 'vscode' },
      undefined,
      {
        mapHunksToSymbols: async () => [],
        callLLM: async (request) => fakeLLM(request),
      }
    );

    assert.equal(result.hunks.length, 14);
    assert.ok(result.chapters.some((chapter) => chapter.filePaths.includes('src/extra-11.ts')));
  });

  it('throws when the user cancels a very large hunk warning', async () => {
    const manyHunks = Array.from({ length: WARN_HUNKS + 1 }, (_, index) => {
      return `diff --git a/src/f${index}.ts b/src/f${index}.ts
index 111..222 100644
--- a/src/f${index}.ts
+++ b/src/f${index}.ts
@@ -1,1 +1,1 @@
-old
+new
`;
    }).join('');

    const largeDiff: RawPRData = {
      ...rawPRData,
      diff: manyHunks,
    };

    await assert.rejects(
      () =>
        buildWalkthrough(
          'https://github.com/acme/demo/pull/12',
          largeDiff,
          { provider: 'vscode' },
          undefined,
          {
            onTooManyHunks: async () => false,
            mapHunksToSymbols: async () => [],
            callLLM: async (request) => fakeLLM(request),
          }
        ),
      /User cancelled due to large PR size/
    );
  });
});
