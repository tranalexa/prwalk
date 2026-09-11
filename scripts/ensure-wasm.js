#!/usr/bin/env node
/**
 * Copies web-tree-sitter runtime WASM and a small set of grammars into dist/.
 * Other grammars load on demand from node_modules/tree-sitter-wasm.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PACK_OUT = path.join(ROOT, 'node_modules', 'tree-sitter-wasm', 'out');
const CORE_WASM = path.join(DIST, 'web-tree-sitter.wasm');
const SHIPPED = ['javascript', 'typescript', 'tsx', 'python', 'go'];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${path.relative(ROOT, dest)}`);
}

function main() {
  fs.mkdirSync(DIST, { recursive: true });

  const coreSrc = path.join(ROOT, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
  if (!fs.existsSync(coreSrc)) {
    throw new Error('web-tree-sitter.wasm is missing. Run npm install.');
  }
  copyFile(coreSrc, CORE_WASM);

  for (const grammar of SHIPPED) {
    const srcDir = path.join(PACK_OUT, grammar);
    const destDir = path.join(DIST, 'grammars', grammar);
    const wasm = path.join(srcDir, `tree-sitter-${grammar}.wasm`);
    if (!fs.existsSync(wasm)) {
      throw new Error(`Missing ${wasm}. Is tree-sitter-wasm installed?`);
    }
    copyFile(wasm, path.join(destDir, `tree-sitter-${grammar}.wasm`));
    const tags = path.join(srcDir, 'tags.scm');
    if (fs.existsSync(tags)) {
      copyFile(tags, path.join(destDir, 'tags.scm'));
    }
  }

  console.log('WASM assets ready in dist/');
}

main();
