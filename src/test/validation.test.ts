import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLLMResponse } from '../extension/llm/validation';

const validResponse = {
  summary: 'Adds a greeting helper.',
  howToReview: '1) Read greet.ts. 2) See the call in main.',
  chapters: [
    {
      title: 'Wire up greeting',
      briefing: 'Main starts calling greet so the helper actually runs.',
      filePaths: ['src/main.ts', 'src/greet.ts'],
      symbolIds: ['src/main.ts:main'],
    },
  ],
};

describe('validateLLMResponse', () => {
  it('accepts a well-formed chapter recommendation', () => {
    const parsed = validateLLMResponse(validResponse);
    assert.equal(parsed.summary, validResponse.summary);
    assert.equal(parsed.chapters.length, 1);
    assert.deepEqual(parsed.chapters[0].filePaths, ['src/main.ts', 'src/greet.ts']);
  });

  it('rejects a payload missing summary', () => {
    const { summary: _summary, ...rest } = validResponse;
    assert.throws(() => validateLLMResponse(rest), /Invalid LLM response/);
  });

  it('defaults missing chapters, howToReview, and filePaths', () => {
    const parsed = validateLLMResponse({
      summary: 'Just a summary.',
      chapters: [{ title: 'Core', briefing: 'The main idea.' }],
    });
    assert.equal(parsed.howToReview, '');
    assert.equal(parsed.chapters.length, 1);
    assert.deepEqual(parsed.chapters[0].filePaths, []);
  });
});
