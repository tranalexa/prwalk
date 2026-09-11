import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatModelLabel,
  isCursorHost,
  pickLLMConfig,
} from '../extension/llm/resolve';

describe('pickLLMConfig', () => {
  it('uses a saved API key before editor models', () => {
    const picked = pickLLMConfig({
      saved: { provider: 'gemini', apiKey: 'saved' },
      editorModelCount: 3,
    });
    assert.equal(picked.ok, true);
    if (picked.ok) {
      assert.equal(picked.source, 'saved');
      assert.equal(picked.config.provider, 'gemini');
    }
  });

  it('ignores a saved editor preference when no models are available', () => {
    const picked = pickLLMConfig({
      saved: { provider: 'vscode' },
      editorModelCount: 0,
    });
    assert.equal(picked.ok, false);
  });

  it('falls back to editor models when nothing is saved', () => {
    const picked = pickLLMConfig({
      saved: null,
      editorModelCount: 2,
    });
    assert.equal(picked.ok, true);
    if (picked.ok) {
      assert.equal(picked.source, 'editor');
      assert.equal(picked.config.provider, 'vscode');
    }
  });

  it('asks for setup when there is neither a saved key nor editor models', () => {
    const picked = pickLLMConfig({
      saved: null,
      editorModelCount: 0,
    });
    assert.equal(picked.ok, false);
  });
});

describe('formatModelLabel', () => {
  it('labels Gemini, OpenRouter, and editor models', () => {
    assert.equal(
      formatModelLabel({ provider: 'gemini', model: 'gemini-3.8-flash' }),
      'Gemini · gemini-3.8-flash'
    );
    assert.equal(
      formatModelLabel({ provider: 'openrouter', model: 'openrouter/free' }),
      'OpenRouter · openrouter/free'
    );
    assert.equal(formatModelLabel({ provider: 'vscode' }), 'Editor model');
  });

  it('labels a custom OpenAI-compatible endpoint', () => {
    assert.equal(
      formatModelLabel({
        provider: 'openai',
        model: 'local-model',
        baseUrl: 'http://localhost:11434/v1',
      }),
      'Custom · local-model'
    );
  });
});

describe('isCursorHost', () => {
  it('detects Cursor from the app name', () => {
    assert.equal(isCursorHost('Cursor'), true);
    assert.equal(isCursorHost('Visual Studio Code'), false);
  });
});
