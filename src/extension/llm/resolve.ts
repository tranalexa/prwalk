import * as vscode from 'vscode';
import { LLMConfig } from './types';

export const LLM_DEFAULTS = {
  openrouter: {
    model: 'openrouter/free',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    model: 'claude-haiku-4-5',
  },
  gemini: {
    model: 'gemini-3.8-flash',
  },
} as const;

export type LLMSource = 'saved' | 'editor';
export type EditorHost = 'cursor' | 'vscode';

export interface ModelSetupInfo {
  host: EditorHost;
  hasEditorModels: boolean;
  currentLabel?: string;
  preferredProvider?: 'vscode' | 'openai' | 'anthropic' | 'openrouter' | 'gemini';
  defaults: typeof LLM_DEFAULTS;
}

export class NeedsModelError extends Error {
  constructor(public readonly setup: ModelSetupInfo) {
    super('PR Walk needs a language model before it can write a walkthrough.');
    this.name = 'NeedsModelError';
  }
}

export function isCursorHost(appName: string = vscode.env.appName): boolean {
  return /cursor/i.test(appName);
}

export function editorHost(appName?: string): EditorHost {
  return isCursorHost(appName) ? 'cursor' : 'vscode';
}

export function isUsableConfig(config: LLMConfig, editorModelCount: number): boolean {
  if (config.provider === 'vscode') {
    return editorModelCount > 0;
  }
  return Boolean(config.apiKey);
}

export function pickLLMConfig(input: {
  saved: LLMConfig | null;
  editorModelCount: number;
}): { ok: true; config: LLMConfig; source: LLMSource } | { ok: false } {
  if (input.saved && isUsableConfig(input.saved, input.editorModelCount)) {
    return { ok: true, config: input.saved, source: 'saved' };
  }
  if (input.editorModelCount > 0) {
    return { ok: true, config: { provider: 'vscode' }, source: 'editor' };
  }
  return { ok: false };
}

export function formatModelLabel(config: LLMConfig): string {
  switch (config.provider) {
    case 'openrouter':
      return `OpenRouter · ${config.model || LLM_DEFAULTS.openrouter.model}`;
    case 'openai':
      return isCustomOpenAI(config)
        ? `Custom · ${config.model || LLM_DEFAULTS.openai.model}`
        : `OpenAI · ${config.model || LLM_DEFAULTS.openai.model}`;
    case 'anthropic':
      return `Anthropic · ${config.model || LLM_DEFAULTS.anthropic.model}`;
    case 'gemini':
      return `Gemini · ${config.model || LLM_DEFAULTS.gemini.model}`;
    default:
      return 'Editor model';
  }
}

function isCustomOpenAI(config: LLMConfig): boolean {
  const base = (config.baseUrl || '').replace(/\/$/, '');
  return Boolean(base) && base !== LLM_DEFAULTS.openai.baseUrl;
}
