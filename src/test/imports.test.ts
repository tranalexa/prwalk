import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hopCandidatePaths,
  isProjectSpecifier,
  resolveBindings,
  resolveModulePath,
  stripQuotes,
} from '../extension/parser/imports';

describe('import path resolution', () => {
  it('resolves a relative import to a PR file', () => {
    const known = ['src/greet.ts', 'src/main.ts'];
    assert.equal(resolveModulePath('src/main.ts', './greet', known), 'src/greet.ts');
    assert.equal(resolveModulePath('src/main.ts', './greet.ts', known), 'src/greet.ts');
    assert.equal(resolveModulePath('src/main.ts', './missing', known), null);
  });

  it('resolves parent-directory imports and TS-from-JS specifiers', () => {
    const known = ['packages/next/src/server/after/after-context.ts'];
    assert.equal(
      resolveModulePath(
        'packages/next/src/server/app-render/app-render.tsx',
        '../after/after-context',
        known
      ),
      'packages/next/src/server/after/after-context.ts'
    );
    assert.equal(
      resolveModulePath(
        'packages/next/src/server/app-render/app-render.tsx',
        '../after/after-context.js',
        known
      ),
      'packages/next/src/server/after/after-context.ts'
    );
  });

  it('ignores package imports and lists hop candidates for missing relative files', () => {
    assert.equal(isProjectSpecifier('react'), false);
    assert.equal(resolveModulePath('src/main.ts', 'react', ['src/main.ts']), null);
    const hops = hopCandidatePaths('src/main.ts', './helper', ['src/main.ts']);
    assert.ok(hops.includes('src/helper.ts'));
    assert.equal(hopCandidatePaths('src/main.ts', './greet', ['src/greet.ts']).length, 0);
  });

  it('binds named imports to resolved files', () => {
    const bindings = resolveBindings(
      [
        {
          filePath: 'src/main.ts',
          imports: [{ localName: 'greet', importedName: 'greet', specifier: './greet' }],
        },
      ],
      ['src/main.ts', 'src/greet.ts']
    );

    assert.deepEqual(bindings.get('src/main.ts'), [
      { localName: 'greet', importedName: 'greet', path: 'src/greet.ts' },
    ]);
  });

  it('strips quotes from specifiers', () => {
    assert.equal(stripQuotes("'./greet'"), './greet');
    assert.equal(stripQuotes('"./greet"'), './greet');
  });

  it('resolves Python relative and dotted modules', () => {
    assert.equal(
      resolveModulePath('pkg/main.py', './greet', ['pkg/main.py', 'pkg/greet.py']),
      'pkg/greet.py'
    );
    assert.equal(
      resolveModulePath('pkg/main.py', 'pkg.util', ['pkg/main.py', 'pkg/util.py']),
      'pkg/util.py'
    );
  });

  it('resolves a Go import path to every file in that package dir', () => {
    const known = ['cmd/main.go', 'pkg/greet/greet.go', 'pkg/greet/format.go'];
    const bindings = resolveBindings(
      [
        {
          filePath: 'cmd/main.go',
          imports: [{ localName: 'greet', importedName: '*', specifier: 'pkg/greet' }],
        },
      ],
      known
    );
    assert.deepEqual(
      (bindings.get('cmd/main.go') || []).map((binding) => binding.path).sort(),
      ['pkg/greet/format.go', 'pkg/greet/greet.go']
    );
  });

  it('resolves Rust mod, Java import, and quoted C includes', () => {
    assert.equal(
      resolveModulePath('src/main.rs', './greet', ['src/main.rs', 'src/greet.rs']),
      'src/greet.rs'
    );
    assert.equal(
      resolveModulePath(
        'src/App.java',
        'com/acme/Greeter',
        ['src/App.java', 'com/acme/Greeter.java']
      ),
      'com/acme/Greeter.java'
    );
    assert.equal(
      resolveModulePath('src/main.c', './greet.h', ['src/main.c', 'src/greet.h']),
      'src/greet.h'
    );
  });
});
