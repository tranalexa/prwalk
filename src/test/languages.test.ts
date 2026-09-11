import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { grammarFromPath, isJavaScriptFamily } from '../extension/parser/languages';
import { extractSymbols, initializeTreeSitter, parseFile } from '../extension/parser/treeSitter';
import { buildCallGraph, buildDependencyMap } from '../extension/parser/callGraph';
import { FileSymbolMap } from '../extension/parser/symbolMapper';

const distDir = path.join(__dirname, '../../dist');

before(async () => {
  await initializeTreeSitter(distDir);
});

describe('grammarFromPath', () => {
  it('maps common extensions to grammar names', () => {
    assert.equal(grammarFromPath('src/app.ts'), 'typescript');
    assert.equal(grammarFromPath('src/Page.tsx'), 'tsx');
    assert.equal(grammarFromPath('scripts/setup.py'), 'python');
    assert.equal(grammarFromPath('cmd/main.go'), 'go');
  });

  it('skips files with no grammar', () => {
    assert.equal(grammarFromPath('yarn.lock'), undefined);
    assert.equal(grammarFromPath('README'), undefined);
    assert.equal(isJavaScriptFamily('src/app.ts'), true);
    assert.equal(isJavaScriptFamily('scripts/setup.py'), false);
  });
});

describe('tag extraction', () => {
  it('finds Python functions and same-file calls', async () => {
    const filePath = 'scripts/setup.py';
    const tree = await parseFile(
      'def greet(name):\n    return name\n\ndef main():\n    greet("hi")\n',
      filePath
    );
    assert.ok(tree);
    const symbols = extractSymbols(tree, filePath);
    assert.deepEqual(
      symbols.map((symbol) => symbol.name).sort(),
      ['greet', 'main']
    );
    const main = symbols.find((symbol) => symbol.name === 'main');
    assert.ok(main?.callNames?.includes('greet'));

    const graph = buildCallGraph([fileMap(filePath, symbols)]);
    assert.deepEqual(graph.edges, [
      { from: 'scripts/setup.py:main', to: 'scripts/setup.py:greet', type: 'call' },
    ]);
    assert.deepEqual(buildDependencyMap(graph).entryPoints, ['scripts/setup.py:main']);
  });

  it('finds Go functions', async () => {
    const filePath = 'cmd/hello.go';
    const tree = await parseFile(
      'package main\n\nfunc Hello() {}\n\nfunc main() {\n\tHello()\n}\n',
      filePath
    );
    assert.ok(tree);
    const symbols = extractSymbols(tree, filePath);
    assert.ok(symbols.some((symbol) => symbol.name === 'Hello'));
    assert.ok(symbols.some((symbol) => symbol.name === 'main'));
  });

  it('parses a mixed TypeScript and Python set of files', async () => {
    const tsPath = 'src/app.ts';
    const pyPath = 'scripts/setup.py';
    const tsTree = await parseFile(
      'export function boot() {\n  return 1;\n}\n',
      tsPath
    );
    const pyTree = await parseFile(
      'def setup():\n    return True\n',
      pyPath
    );
    assert.ok(tsTree);
    assert.ok(pyTree);

    const tsSymbols = extractSymbols(tsTree, tsPath);
    const pySymbols = extractSymbols(pyTree, pyPath);
    assert.ok(tsSymbols.some((symbol) => symbol.name === 'boot'));
    assert.ok(pySymbols.some((symbol) => symbol.name === 'setup'));

    const graph = buildCallGraph([
      fileMap(tsPath, tsSymbols),
      fileMap(pyPath, pySymbols),
    ]);
    assert.equal(graph.edges.length, 0);
  });

  it('does not parse unknown files', async () => {
    assert.equal(await parseFile('{"a":1}', 'config.lock'), null);
  });
});

function fileMap(filePath: string, symbols: FileSymbolMap['postSymbols']): FileSymbolMap {
  return {
    filePath,
    preSymbols: [],
    postSymbols: symbols,
    hunks: [],
    imports: [],
    inPr: true,
  };
}
