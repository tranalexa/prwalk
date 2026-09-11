import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHunk, parseDiff } from '../extension/parser/diffParser';
import { DiffHunk } from '../extension/webview/messaging';
import { CROSS_FILE_DIFF, SAMPLE_DIFF } from './fixtures';

describe('parseDiff', () => {
  it('parses a multi-file unified diff into hunks', () => {
    const hunks = parseDiff(SAMPLE_DIFF);

    assert.equal(hunks.length, 2);
    assert.equal(hunks[0].filePath, 'src/greet.ts');
    assert.equal(hunks[1].filePath, 'src/main.ts');
  });

  it('captures add, delete, and context lines with line numbers', () => {
    const [greetHunk] = parseDiff(SAMPLE_DIFF);

    assert.equal(greetHunk.oldStart, 1);
    assert.equal(greetHunk.oldLines, 3);
    assert.equal(greetHunk.newStart, 1);
    assert.equal(greetHunk.newLines, 3);

    const deleted = greetHunk.changes.find(change => change.type === 'delete');
    const added = greetHunk.changes.find(change => change.type === 'add');
    const context = greetHunk.changes.filter(change => change.type === 'context');

    assert.ok(deleted);
    assert.match(deleted.line, /return name/);
    assert.equal(deleted.oldLineNumber, 2);
    assert.equal(deleted.newLineNumber, null);

    assert.ok(added);
    assert.match(added.line, /Hello/);
    assert.equal(added.oldLineNumber, null);
    assert.equal(added.newLineNumber, 2);

    assert.ok(context.length >= 2);
    assert.equal(context[0].oldLineNumber, 1);
    assert.equal(context[0].newLineNumber, 1);
  });

  it('returns an empty list for an empty diff', () => {
    assert.deepEqual(parseDiff(''), []);
  });

  it('classifies SAMPLE_DIFF hunks as logic', () => {
    const hunks = parseDiff(SAMPLE_DIFF);
    assert.equal(hunks[0].changeKind, 'logic');
    assert.equal(hunks[1].changeKind, 'logic');
  });

  it('classifies comment-only edits', () => {
    const hunk: DiffHunk = {
      filePath: 'src/app.ts',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      content: '',
      changeKind: 'logic',
      changes: [
        { type: 'add', line: '  // remember to reset the cache', oldLineNumber: null, newLineNumber: 2 },
      ],
    };
    assert.equal(classifyHunk(hunk), 'comment');
  });

  it('does not glue the next file header into the previous hunk', () => {
    const hunks = parseDiff(CROSS_FILE_DIFF);

    assert.equal(hunks.length, 2);
    assert.equal(hunks[0].filePath, 'src/wrapper.ts');
    assert.equal(hunks[1].filePath, 'test/e2e/app-dir/demo/page.tsx');
    assert.doesNotMatch(hunks[0].content, /dev\/null/);
    assert.doesNotMatch(hunks[0].content, /page\.tsx/);
    assert.match(hunks[0].content, /isValidationRender/);
    assert.match(hunks[1].content, /export default function Page/);
  });

  it('classifies test files as test even when they contain logic', () => {
    const hunk: DiffHunk = {
      filePath: 'test/e2e/app-dir/foo.test.ts',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      content: '',
      changeKind: 'logic',
      changes: [
        { type: 'add', line: 'expect(page).toBeVisible()', oldLineNumber: null, newLineNumber: 2 },
      ],
    };
    assert.equal(classifyHunk(hunk), 'test');
  });

  it('classifies Python and tests/ paths as test', () => {
    const python: DiffHunk = {
      filePath: 'tests/unit_tests/migrations/viz/table_v1_v2_test.py',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      content: '',
      changeKind: 'logic',
      changes: [
        { type: 'add', line: 'assert migrated.viz_type == "table_v2"', oldLineNumber: null, newLineNumber: 2 },
      ],
    };
    assert.equal(classifyHunk(python), 'test');
  });
});
