import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubPRUrl } from '../utils/urlParser';

describe('parseGitHubPRUrl', () => {
  it('parses a standard GitHub PR URL', () => {
    const parsed = parseGitHubPRUrl('https://github.com/acme/demo/pull/42');
    assert.deepEqual(parsed, {
      owner: 'acme',
      repo: 'demo',
      prNumber: 42,
    });
  });

  it('accepts extra path after the PR number', () => {
    const parsed = parseGitHubPRUrl('https://github.com/acme/demo/pull/7/files');
    assert.equal(parsed.prNumber, 7);
    assert.equal(parsed.owner, 'acme');
  });

  it('rejects a non-PR URL', () => {
    assert.throws(
      () => parseGitHubPRUrl('https://github.com/acme/demo'),
      /Invalid GitHub PR URL format/
    );
  });

  it('rejects a non-GitHub URL', () => {
    assert.throws(
      () => parseGitHubPRUrl('https://gitlab.com/acme/demo/merge_requests/1'),
      /Invalid GitHub PR URL format/
    );
  });
});
