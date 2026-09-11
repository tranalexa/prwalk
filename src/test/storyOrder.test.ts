import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderHunksByStory } from '../extension/algorithm/storyOrder';
import { DependencyMap } from '../extension/parser/callGraph';
import { FileSymbolMap } from '../extension/parser/symbolMapper';
import { SymbolInfo } from '../extension/parser/treeSitter';
import { DiffHunk } from '../extension/webview/messaging';

function makeHunk(filePath: string, newStart: number): DiffHunk {
  return {
    filePath,
    oldStart: newStart,
    oldLines: 3,
    newStart,
    newLines: 3,
    content: `@@ -${newStart},3 +${newStart},3 @@`,
    changeKind: 'logic',
    changes: [],
  };
}

function makeSymbol(id: string, name: string, filePath: string): SymbolInfo {
  return {
    id,
    name,
    filePath,
    kind: 'function',
    byteRange: [0, 10],
    lineRange: [1, 10],
    definitionNode: {} as SymbolInfo['definitionNode'],
  };
}

function mapForHunk(
  hunk: DiffHunk,
  symbol: SymbolInfo | null,
  ambiguous = false
): FileSymbolMap {
  return {
    filePath: hunk.filePath,
    preSymbols: [],
    postSymbols: symbol ? [symbol] : [],
    hunks: [
      {
        hunk,
        symbols: symbol ? [symbol] : [],
        isAmbiguous: ambiguous || !symbol,
      },
    ],
    imports: [],
    inPr: true,
  };
}

describe('orderHunksByStory', () => {
  it('orders entry-point hunks before their callees', () => {
    const helperHunk = makeHunk('src/greet.ts', 1);
    const entryHunk = makeHunk('src/main.ts', 1);
    const helper = makeSymbol('src/greet.ts:greet', 'greet', 'src/greet.ts');
    const entry = makeSymbol('src/main.ts:main', 'main', 'src/main.ts');

    const depMap: DependencyMap = {
      symbols: new Map([
        [entry.id, entry],
        [helper.id, helper],
      ]),
      callers: new Map([
        [entry.id, new Set()],
        [helper.id, new Set([entry.id])],
      ]),
      callees: new Map([
        [entry.id, new Set([helper.id])],
        [helper.id, new Set()],
      ]),
      entryPoints: [entry.id],
      leafNodes: [helper.id],
    };

    const ordered = orderHunksByStory(
      [helperHunk, entryHunk],
      [mapForHunk(helperHunk, helper), mapForHunk(entryHunk, entry)],
      depMap
    );

    assert.equal(ordered[0], entryHunk);
    assert.equal(ordered[1], helperHunk);
  });

  it('places ambiguous hunks last', () => {
    const knownHunk = makeHunk('src/main.ts', 1);
    const ambiguousHunk = makeHunk('src/config.json', 1);
    const entry = makeSymbol('src/main.ts:main', 'main', 'src/main.ts');

    const depMap: DependencyMap = {
      symbols: new Map([[entry.id, entry]]),
      callers: new Map([[entry.id, new Set()]]),
      callees: new Map([[entry.id, new Set()]]),
      entryPoints: [entry.id],
      leafNodes: [entry.id],
    };

    const ordered = orderHunksByStory(
      [ambiguousHunk, knownHunk],
      [mapForHunk(knownHunk, entry), mapForHunk(ambiguousHunk, null, true)],
      depMap
    );

    assert.equal(ordered[0], knownHunk);
    assert.equal(ordered[1], ambiguousHunk);
  });

  it('sorts same-symbol hunks by file then line number', () => {
    const later = makeHunk('src/main.ts', 20);
    const earlier = makeHunk('src/main.ts', 4);
    const entry = makeSymbol('src/main.ts:main', 'main', 'src/main.ts');

    const fileMap: FileSymbolMap = {
      filePath: 'src/main.ts',
      preSymbols: [],
      postSymbols: [entry],
      hunks: [
        { hunk: later, symbols: [entry], isAmbiguous: false },
        { hunk: earlier, symbols: [entry], isAmbiguous: false },
      ],
      imports: [],
      inPr: true,
    };

    const depMap: DependencyMap = {
      symbols: new Map([[entry.id, entry]]),
      callers: new Map([[entry.id, new Set()]]),
      callees: new Map([[entry.id, new Set()]]),
      entryPoints: [entry.id],
      leafNodes: [entry.id],
    };

    const ordered = orderHunksByStory([later, earlier], [fileMap], depMap);
    assert.equal(ordered[0], earlier);
    assert.equal(ordered[1], later);
  });

  it('still returns an order when the call graph has a cycle', () => {
    const hunkA = makeHunk('src/a.ts', 1);
    const hunkB = makeHunk('src/b.ts', 1);
    const a = makeSymbol('src/a.ts:a', 'a', 'src/a.ts');
    const b = makeSymbol('src/b.ts:b', 'b', 'src/b.ts');

    const depMap: DependencyMap = {
      symbols: new Map([
        [a.id, a],
        [b.id, b],
      ]),
      callers: new Map([
        [a.id, new Set([b.id])],
        [b.id, new Set([a.id])],
      ]),
      callees: new Map([
        [a.id, new Set([b.id])],
        [b.id, new Set([a.id])],
      ]),
      entryPoints: [],
      leafNodes: [],
    };

    const ordered = orderHunksByStory(
      [hunkA, hunkB],
      [mapForHunk(hunkA, a), mapForHunk(hunkB, b)],
      depMap
    );

    assert.equal(ordered.length, 2);
    assert.ok(ordered.includes(hunkA));
    assert.ok(ordered.includes(hunkB));
  });
});
