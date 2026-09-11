import * as vscode from 'vscode';
import { LLMConfig, LLMProvider } from './types';
import {
  editorHost,
  formatModelLabel,
  LLM_DEFAULTS,
  LLMSource,
  ModelSetupInfo,
  NeedsModelError,
  pickLLMConfig,
} from './resolve';

const STORAGE_KEYS = {
  OPENAI_API_KEY: 'prwalk.llm.openai.key',
  OPENAI_BASE_URL: 'prwalk.llm.openai.baseUrl',
  OPENAI_MODEL: 'prwalk.llm.openai.model',
  ANTHROPIC_API_KEY: 'prwalk.llm.anthropic.key',
  ANTHROPIC_MODEL: 'prwalk.llm.anthropic.model',
  OPENROUTER_API_KEY: 'prwalk.llm.openrouter.key',
  OPENROUTER_MODEL: 'prwalk.llm.openrouter.model',
  GEMINI_API_KEY: 'prwalk.llm.gemini.key',
  GEMINI_MODEL: 'prwalk.llm.gemini.model',
  PREFERRED_PROVIDER: 'prwalk.llm.provider',
};

export type LLMResolveResult =
  | { ok: true; config: LLMConfig; source: LLMSource; setup: ModelSetupInfo }
  | { ok: false; setup: ModelSetupInfo };

export async function resolveLLMConfig(context: vscode.ExtensionContext): Promise<LLMResolveResult> {
  const models = await vscode.lm.selectChatModels();
  const picked = pickLLMConfig({
    saved: await readSavedConfig(context),
    editorModelCount: models.length,
  });

  const setup: ModelSetupInfo = {
    host: editorHost(),
    hasEditorModels: models.length > 0,
    defaults: LLM_DEFAULTS,
    currentLabel: picked.ok ? formatModelLabel(picked.config) : undefined,
  };

  if (!picked.ok) {
    return { ok: false, setup };
  }
  return { ok: true, config: picked.config, source: picked.source, setup };
}

export async function ensureLLMConfig(context: vscode.ExtensionContext): Promise<LLMConfig> {
  const resolved = await resolveLLMConfig(context);
  if (!resolved.ok) {
    throw new NeedsModelError(resolved.setup);
  }
  return resolved.config;
}

export async function setLLMConfig(context: vscode.ExtensionContext, config: LLMConfig): Promise<void> {
  await context.globalState.update(STORAGE_KEYS.PREFERRED_PROVIDER, config.provider);
  await context.globalState.update(STORAGE_KEYS.OPENAI_BASE_URL, config.provider === 'openai' ? config.baseUrl : undefined);
  await context.globalState.update(STORAGE_KEYS.OPENAI_MODEL, config.provider === 'openai' ? config.model : undefined);
  await context.globalState.update(STORAGE_KEYS.ANTHROPIC_MODEL, config.provider === 'anthropic' ? config.model : undefined);
  await context.globalState.update(STORAGE_KEYS.OPENROUTER_MODEL, config.provider === 'openrouter' ? config.model : undefined);
  await context.globalState.update(STORAGE_KEYS.GEMINI_MODEL, config.provider === 'gemini' ? config.model : undefined);

  if (config.provider === 'openai' && config.apiKey) {
    await context.secrets.store(STORAGE_KEYS.OPENAI_API_KEY, config.apiKey);
  }
  if (config.provider === 'anthropic' && config.apiKey) {
    await context.secrets.store(STORAGE_KEYS.ANTHROPIC_API_KEY, config.apiKey);
  }
  if (config.provider === 'openrouter' && config.apiKey) {
    await context.secrets.store(STORAGE_KEYS.OPENROUTER_API_KEY, config.apiKey);
  }
  if (config.provider === 'gemini' && config.apiKey) {
    await context.secrets.store(STORAGE_KEYS.GEMINI_API_KEY, config.apiKey);
  }
}

async function readSavedConfig(context: vscode.ExtensionContext): Promise<LLMConfig | null> {
  const provider = context.globalState.get<string>(STORAGE_KEYS.PREFERRED_PROVIDER) as LLMProvider | undefined;
  if (!provider) {
    return null;
  }

  if (provider === 'openai') {
    const apiKey = await context.secrets.get(STORAGE_KEYS.OPENAI_API_KEY);
    if (!apiKey) {
      return null;
    }
    return {
      provider: 'openai',
      apiKey,
      baseUrl: context.globalState.get<string>(STORAGE_KEYS.OPENAI_BASE_URL) || undefined,
      model: context.globalState.get<string>(STORAGE_KEYS.OPENAI_MODEL) || LLM_DEFAULTS.openai.model,
    };
  }

  if (provider === 'anthropic') {
    const apiKey = await context.secrets.get(STORAGE_KEYS.ANTHROPIC_API_KEY);
    if (!apiKey) {
      return null;
    }
    return {
      provider: 'anthropic',
      apiKey,
      model: context.globalState.get<string>(STORAGE_KEYS.ANTHROPIC_MODEL) || LLM_DEFAULTS.anthropic.model,
    };
  }

  if (provider === 'openrouter') {
    const apiKey = await context.secrets.get(STORAGE_KEYS.OPENROUTER_API_KEY);
    if (!apiKey) {
      return null;
    }
    return {
      provider: 'openrouter',
      apiKey,
      model: context.globalState.get<string>(STORAGE_KEYS.OPENROUTER_MODEL) || LLM_DEFAULTS.openrouter.model,
      baseUrl: LLM_DEFAULTS.openrouter.baseUrl,
    };
  }

  if (provider === 'gemini') {
    const apiKey = await context.secrets.get(STORAGE_KEYS.GEMINI_API_KEY);
    if (!apiKey) {
      return null;
    }
    return {
      provider: 'gemini',
      apiKey,
      model: context.globalState.get<string>(STORAGE_KEYS.GEMINI_MODEL) || LLM_DEFAULTS.gemini.model,
    };
  }

  return { provider: 'vscode' };
}

export function configFromWebview(message: {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): LLMConfig {
  if (message.provider === 'vscode') {
    return { provider: 'vscode' };
  }

  if (message.provider === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey: message.apiKey?.trim(),
      model: message.model?.trim() || LLM_DEFAULTS.anthropic.model,
    };
  }

  if (message.provider === 'openrouter') {
    return {
      provider: 'openrouter',
      apiKey: message.apiKey?.trim(),
      model: message.model?.trim() || LLM_DEFAULTS.openrouter.model,
      baseUrl: LLM_DEFAULTS.openrouter.baseUrl,
    };
  }

  if (message.provider === 'gemini') {
    return {
      provider: 'gemini',
      apiKey: message.apiKey?.trim(),
      model: message.model?.trim() || LLM_DEFAULTS.gemini.model,
    };
  }

  return {
    provider: 'openai',
    apiKey: message.apiKey?.trim(),
    model: message.model?.trim() || LLM_DEFAULTS.openai.model,
    baseUrl: message.baseUrl?.trim() || undefined,
  };
}
