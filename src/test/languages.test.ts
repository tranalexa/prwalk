import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { grammarFromPath, isJavaScriptFamily } from '../extension/parser/languages';
import { extractSymbols, initializeTreeSitter, parseFile } from '../extension/parser/treeSitter';
import { buildCallGraph, buildDependencyMap } from '../extension/parser/callGraph';
import { FileSymbolMap } from '../extension/parser/symbolMapper';
import { extractImports, resolveBindings } from '../extension/parser/imports';

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
    assert.equal(grammarFromPath('lib.rs'), 'rust');
    assert.equal(grammarFromPath('Main.java'), 'java');
    assert.equal(grammarFromPath('main.c'), 'c');
    assert.equal(grammarFromPath('sketch.ino'), 'arduino');
    assert.equal(grammarFromPath('refs.bib'), 'bibtex');
    assert.equal(grammarFromPath('shell.nix'), 'nix');
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

describe('cross-file hops', () => {
  it('hops a Python relative import', async () => {
    const greetPath = 'pkg/greet.py';
    const mainPath = 'pkg/main.py';
    const greetTree = await parseFile('def greet():\n    return "hi"\n', greetPath);
    const mainTree = await parseFile('from .greet import greet\n\ndef main():\n    greet()\n', mainPath);
    assert.ok(greetTree);
    assert.ok(mainTree);

    const maps = [
      fileMap(greetPath, extractSymbols(greetTree, greetPath), extractImports(greetPath, greetTree.rootNode)),
      fileMap(mainPath, extractSymbols(mainTree, mainPath), extractImports(mainPath, mainTree.rootNode)),
    ];
    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.deepEqual(graph.edges, [
      { from: 'pkg/main.py:main', to: 'pkg/greet.py:greet', type: 'call' },
    ]);
  });

  it('hops a Go same-package call and an import path', async () => {
    const helloPath = 'cmd/hello.go';
    const mainPath = 'cmd/main.go';
    const greetPath = 'pkg/greet/greet.go';
    const helloTree = await parseFile('package main\n\nfunc Hello() {}\n', helloPath);
    const mainTree = await parseFile(
      'package main\n\nimport "example.com/app/pkg/greet"\n\nfunc main() {\n\tHello()\n\tgreet.Wave()\n}\n',
      mainPath
    );
    const greetTree = await parseFile('package greet\n\nfunc Wave() {}\n', greetPath);
    assert.ok(helloTree && mainTree && greetTree);

    const maps = [
      fileMap(helloPath, extractSymbols(helloTree, helloPath), extractImports(helloPath, helloTree.rootNode)),
      fileMap(mainPath, extractSymbols(mainTree, mainPath), extractImports(mainPath, mainTree.rootNode)),
      fileMap(greetPath, extractSymbols(greetTree, greetPath), extractImports(greetPath, greetTree.rootNode)),
    ];
    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
    assert.ok(edges.includes('cmd/main.go:main->cmd/hello.go:Hello'));
    assert.ok(edges.includes('cmd/main.go:main->pkg/greet/greet.go:Wave'));
  });

  it('hops a Rust mod file', async () => {
    const greetPath = 'src/greet.rs';
    const mainPath = 'src/main.rs';
    const greetTree = await parseFile('pub fn greet() {}\n', greetPath);
    const mainTree = await parseFile('mod greet;\n\nfn main() {\n    greet::greet();\n}\n', mainPath);
    assert.ok(greetTree && mainTree);

    const maps = [
      fileMap(greetPath, extractSymbols(greetTree, greetPath), extractImports(greetPath, greetTree.rootNode)),
      fileMap(mainPath, extractSymbols(mainTree, mainPath), extractImports(mainPath, mainTree.rootNode)),
    ];
    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.deepEqual(graph.edges, [
      { from: 'src/main.rs:main', to: 'src/greet.rs:greet', type: 'call' },
    ]);
  });

  it('hops a Java import to a class file', async () => {
    const greeterPath = 'com/acme/Greeter.java';
    const appPath = 'com/acme/App.java';
    const greeterTree = await parseFile(
      'package com.acme;\npublic class Greeter {\n  public static void hello() {}\n}\n',
      greeterPath
    );
    const appTree = await parseFile(
      'package com.acme;\nimport com.acme.Greeter;\npublic class App {\n  void run() { Greeter.hello(); }\n}\n',
      appPath
    );
    assert.ok(greeterTree && appTree);

    const maps = [
      fileMap(greeterPath, extractSymbols(greeterTree, greeterPath), extractImports(greeterPath, greeterTree.rootNode)),
      fileMap(appPath, extractSymbols(appTree, appPath), extractImports(appPath, appTree.rootNode)),
    ];
    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.ok(graph.edges.some((edge) => edge.from === 'com/acme/App.java:run' && edge.to === 'com/acme/Greeter.java:hello'));
  });

  it('hops a quoted C include', async () => {
    const headerPath = 'src/greet.h';
    const mainPath = 'src/main.c';
    const headerTree = await parseFile('void greet(void);\n', headerPath);
    const mainTree = await parseFile('#include "greet.h"\nvoid run(void) { greet(); }\n', mainPath);
    assert.ok(headerTree && mainTree);

    const maps = [
      fileMap(headerPath, extractSymbols(headerTree, headerPath), extractImports(headerPath, headerTree.rootNode)),
      fileMap(mainPath, extractSymbols(mainTree, mainPath), extractImports(mainPath, mainTree.rootNode)),
    ];
    const graph = buildCallGraph(maps, resolveBindings(maps, maps.map((file) => file.filePath)));
    assert.ok(
      maps[1].imports.some((item) => item.specifier === './greet.h'),
      JSON.stringify(maps[1].imports)
    );
    assert.ok(graph.edges.some((edge) => edge.from.endsWith(':run') && edge.to.endsWith(':greet')));
  });
});

function fileMap(
  filePath: string,
  symbols: FileSymbolMap['postSymbols'],
  imports: FileSymbolMap['imports'] = []
): FileSymbolMap {
  return {
    filePath,
    preSymbols: [],
    postSymbols: symbols,
    hunks: [],
    imports,
    inPr: true,
  };
}
