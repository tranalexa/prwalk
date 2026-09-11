import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindRecommendedChapters,
  buildReviewCatalog,
  formatCallTree,
} from '../extension/algorithm/chapters';
import { DependencyMap } from '../extension/parser/callGraph';
import { SymbolInfo } from '../extension/parser/treeSitter';
import { parseDiff } from '../extension/parser/diffParser';
import { DiffHunk } from '../extension/webview/messaging';
import { CROSS_FILE_DIFF, SAMPLE_DIFF } from './fixtures';

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

function logicHunk(filePath: string): DiffHunk {
  return {
    filePath,
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 1,
    content: `@@ -1,1 +1,1 @@\n-${filePath}\n+${filePath} changed`,
    changeKind: 'logic',
    changes: [{ type: 'add', line: 'changed', oldLineNumber: null, newLineNumber: 1 }],
  };
}

function emptyDepMap(): DependencyMap {
  return {
    symbols: new Map(),
    callers: new Map(),
    callees: new Map(),
    entryPoints: [],
    leafNodes: [],
  };
}

function greetCallMap(): DependencyMap {
  const greet = symbol('src/greet.ts:greet', 'greet', 'src/greet.ts');
  const main = symbol('src/main.ts:main', 'main', 'src/main.ts');

  return {
    symbols: new Map([
      [main.id, main],
      [greet.id, greet],
    ]),
    callers: new Map([
      [main.id, new Set()],
      [greet.id, new Set([main.id])],
    ]),
    callees: new Map([
      [main.id, new Set([greet.id])],
      [greet.id, new Set()],
    ]),
    entryPoints: [main.id],
    leafNodes: [greet.id],
  };
}

describe('buildReviewCatalog', () => {
  it('lists files and renders the call tree from entry points', () => {
    const hunks = parseDiff(SAMPLE_DIFF);
    const catalog = buildReviewCatalog(hunks, greetCallMap());

    assert.deepEqual(
      catalog.files.map((file) => file.path),
      ['src/greet.ts', 'src/main.ts']
    );
    assert.match(catalog.treeText, /main \(src\/main\.ts\)/);
    assert.match(catalog.treeText, /→ greet \(src\/greet\.ts\)/);
  });
});

describe('bindRecommendedChapters', () => {
  it('groups files the model recommended from the tree', () => {
    const hunks = parseDiff(SAMPLE_DIFF);
    const catalog = buildReviewCatalog(hunks, greetCallMap());
    const chapters = bindRecommendedChapters(
      [
        {
          title: 'Wire up greeting',
          briefing: 'Main starts calling greet so the helper actually runs.',
          filePaths: ['src/main.ts', 'src/greet.ts'],
          symbolIds: ['src/main.ts:main'],
        },
      ],
      catalog,
      hunks
    );

    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].title, 'Wire up greeting');
    assert.deepEqual(chapters[0].filePaths, ['src/main.ts', 'src/greet.ts']);
    assert.deepEqual(
      chapters[0].hunkIndices.map((index) => hunks[index].filePath),
      ['src/main.ts', 'src/greet.ts']
    );
  });

  it('drops unknown paths and keeps the first claim on a file', () => {
    const hunks = parseDiff(SAMPLE_DIFF);
    const catalog = buildReviewCatalog(hunks, greetCallMap());
    const chapters = bindRecommendedChapters(
      [
        {
          title: 'Invented file',
          briefing: 'Should vanish.',
          filePaths: ['src/not-real.ts'],
        },
        {
          title: 'Format greeting',
          briefing: 'greet now returns Hello.',
          filePaths: ['src/greet.ts'],
        },
        {
          title: 'Duplicate greet',
          briefing: 'Second claim is ignored.',
          filePaths: ['src/greet.ts', 'src/main.ts'],
        },
      ],
      catalog,
      hunks
    );

    assert.equal(chapters[0].title, 'Format greeting');
    assert.deepEqual(chapters[0].filePaths, ['src/greet.ts']);
    assert.equal(chapters[1].title, 'Duplicate greet');
    assert.deepEqual(chapters[1].filePaths, ['src/main.ts']);
  });

  it('keeps unclaimed logic in a quiet chapter without listing paths', () => {
    const claimed = logicHunk('superset-frontend/plugins/plugin-chart-table/src/Table.tsx');
    const extra = logicHunk('superset-frontend/src/explore/ExploreViewContainer/index.tsx');
    const hunks = [claimed, extra];
    const catalog = buildReviewCatalog(hunks, emptyDepMap());
    const chapters = bindRecommendedChapters(
      [
        {
          title: 'New table',
          briefing: 'Charts can use the new table.',
          filePaths: [claimed.filePath],
        },
      ],
      catalog,
      hunks
    );

    assert.equal(chapters[0].title, 'New table');
    assert.deepEqual(chapters[0].filePaths, [claimed.filePath]);
    assert.equal(chapters[1].id, 'more-logic');
    assert.equal(chapters[1].title, 'Also in this PR');
    assert.deepEqual(chapters[1].filePaths, [extra.filePath]);
    assert.doesNotMatch(chapters[1].briefing, /recommended story/);
    assert.doesNotMatch(chapters[1].briefing, /ExploreViewContainer/);
  });

  it('appends leftover tests the model did not claim', () => {
    const hunks = parseDiff(CROSS_FILE_DIFF);
    const catalog = buildReviewCatalog(hunks, emptyDepMap());
    const chapters = bindRecommendedChapters(
      [
        {
          title: 'Skip validation render',
          briefing: 'The wrapper bails out during validation.',
          filePaths: ['src/wrapper.ts'],
        },
      ],
      catalog,
      hunks
    );

    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].filePaths[0], 'src/wrapper.ts');
    assert.equal(chapters[1].id, 'tests');
    assert.equal(chapters[1].kind, 'test');
    assert.equal(chapters[1].filePaths[0], 'test/e2e/app-dir/demo/page.tsx');
    assert.equal(hunks[chapters[0].hunkIndices[0]].filePath, 'src/wrapper.ts');
    assert.equal(hunks[chapters[1].hunkIndices[0]].filePath, 'test/e2e/app-dir/demo/page.tsx');
  });
});

describe('formatCallTree', () => {
  it('explains when there is no function graph', () => {
    assert.equal(formatCallTree(emptyDepMap()), 'No function-level call graph. Group by file instead.');
  });
});
