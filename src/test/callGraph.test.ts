import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCallGraph, buildDependencyMap } from '../extension/parser/callGraph';
import { FileSymbolMap } from '../extension/parser/symbolMapper';
import { SymbolInfo } from '../extension/parser/treeSitter';
import { resolveBindings } from '../extension/parser/imports';
import { formatCallTree } from '../extension/algorithm/chapters';

function symbol(id: string, name: string, filePath: string, callee?: string, inPr = true): SymbolInfo {
  const definitionNode = callee
    ? {
        type: 'function_declaration',
        childForFieldName: () => null,
        children: [
          {
            type: 'call_expression',
            childForFieldName: (field: string) => {
              return field === 'function' ? { type: 'identifier', text: callee } : null;
            },
            children: [],
          },
        ],
      }
    : { type: 'function_declaration', childForFieldName: () => null, children: [] };

  return {
    id,
    name,
    filePath,
    kind: 'function',
    byteRange: [0, 20],
    lineRange: [1, 8],
    definitionNode: definitionNode as unknown as SymbolInfo['definitionNode'],
    inPr,
  };
}

function fileMap(
  path: string,
  symbols: SymbolInfo[],
  imports: FileSymbolMap['imports'] = [],
  inPr = true
): FileSymbolMap {
  return {
    filePath: path,
    preSymbols: [],
    postSymbols: symbols,
    hunks: [],
    imports,
    inPr,
  };
}

describe('buildCallGraph', () => {
  it('draws an edge when a PR file imports and calls a symbol in another PR file', () => {
    const greet = symbol('src/greet.ts:greet', 'greet', 'src/greet.ts');
    const main = symbol('src/main.ts:main', 'main', 'src/main.ts', 'greet');
    const maps = [
      fileMap('src/greet.ts', [greet]),
      fileMap('src/main.ts', [main], [
        { localName: 'greet', importedName: 'greet', specifier: './greet' },
      ]),
    ];

    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.deepEqual(graph.edges, [
      { from: 'src/main.ts:main', to: 'src/greet.ts:greet', type: 'call' },
    ]);

    const dep = buildDependencyMap(graph);
    assert.deepEqual(dep.entryPoints, ['src/main.ts:main']);
    assert.ok(dep.leafNodes.includes('src/greet.ts:greet'));
  });

  it('draws a one-hop edge to a symbol outside the PR', () => {
    const helper = symbol('src/helper.ts:helper', 'helper', 'src/helper.ts', undefined, false);
    const main = symbol('src/main.ts:main', 'main', 'src/main.ts', 'helper');
    const maps = [
      fileMap('src/main.ts', [main], [
        { localName: 'helper', importedName: 'helper', specifier: './helper' },
      ]),
      fileMap('src/helper.ts', [helper], [], false),
    ];

    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.equal(graph.edges[0]?.to, 'src/helper.ts:helper');
    assert.match(formatCallTree(buildDependencyMap(graph)), /outside PR/);
  });

  it('does not walk context files for a second hop', () => {
    const leaf = symbol('src/leaf.ts:leaf', 'leaf', 'src/leaf.ts', undefined, false);
    const helper = symbol('src/helper.ts:helper', 'helper', 'src/helper.ts', 'leaf', false);
    const main = symbol('src/main.ts:main', 'main', 'src/main.ts', 'helper');
    const maps = [
      fileMap('src/main.ts', [main], [
        { localName: 'helper', importedName: 'helper', specifier: './helper' },
      ]),
      fileMap('src/helper.ts', [helper], [
        { localName: 'leaf', importedName: 'leaf', specifier: './leaf' },
      ], false),
      fileMap('src/leaf.ts', [leaf], [], false),
    ];

    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.deepEqual(
      graph.edges.map((edge) => `${edge.from}->${edge.to}`),
      ['src/main.ts:main->src/helper.ts:helper']
    );
  });

  it('draws a Go same-package edge without imports', () => {
    const hello = symbol('cmd/hello.go:Hello', 'Hello', 'cmd/hello.go');
    const main = symbol('cmd/main.go:main', 'main', 'cmd/main.go', 'Hello');
    const maps = [
      fileMap('cmd/hello.go', [hello]),
      fileMap('cmd/main.go', [main]),
    ];

    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.deepEqual(graph.edges, [
      { from: 'cmd/main.go:main', to: 'cmd/hello.go:Hello', type: 'call' },
    ]);
  });
});
