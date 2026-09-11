import { FormEvent, useMemo, useState } from 'react';
import { ModelProvider, ModelSetupInfo } from '../types';

interface SetupModelProps {
  setup: ModelSetupInfo;
  error?: string | null;
  onSave: (payload: {
    provider: ModelProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }) => void;
  onOpenUrl: (url: string) => void;
  onCancel?: () => void;
}

const PROVIDER_LINKS: Record<Exclude<ModelProvider, 'vscode'>, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

function SetupModel({ setup, error, onSave, onOpenUrl, onCancel }: SetupModelProps) {
  const initialProvider: ModelProvider = setup.preferredProvider
    || (setup.hasEditorModels && setup.host !== 'cursor' ? 'vscode' : 'gemini');
  const [provider, setProvider] = useState<ModelProvider>(initialProvider);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModel(setup, initialProvider));
  const [baseUrl, setBaseUrl] = useState('');

  const providers = useMemo(() => {
    const items: Array<{ id: ModelProvider; label: string; hint: string }> = [];
    if (setup.hasEditorModels) {
      items.push({ id: 'vscode', label: 'Editor', hint: 'GitHub Copilot' });
    }
    items.push(
      { id: 'gemini', label: 'Gemini', hint: 'Free AI Studio key' },
      { id: 'openrouter', label: 'OpenRouter', hint: 'Free models' },
      { id: 'openai', label: 'OpenAI', hint: 'Needs credits' },
      { id: 'anthropic', label: 'Anthropic', hint: 'Claude' },
    );
    return items;
  }, [setup.hasEditorModels]);

  const selectProvider = (next: ModelProvider) => {
    setProvider(next);
    setModel(defaultModel(setup, next));
    if (next !== 'openai') {
      setBaseUrl('');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: provider === 'openai' ? baseUrl.trim() || undefined : undefined,
    });
  };

  const inCursor = setup.host === 'cursor';

  return (
    <div className="setup-card">
      <h2>Set a model</h2>
      <p className="setup-copy">
        {inCursor
          ? 'Cursor does not share its chat models with extensions. Paste a Gemini API key from Google AI Studio — no OpenAI credits needed.'
          : setup.hasEditorModels
            ? 'Use GitHub Copilot, or paste an API key if you want a specific provider.'
            : 'Sign in to GitHub Copilot, or paste a Gemini API key from Google AI Studio.'}
      </p>
      <div className="setup-providers">
        {providers.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`setup-provider ${provider === item.id ? 'selected' : ''}`}
            onClick={() => selectProvider(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        {provider !== 'vscode' && (
          <>
            <label className="setup-label">
              API key
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={keyPlaceholder(provider)}
              />
            </label>
            <button
              type="button"
              className="setup-link"
              onClick={() => onOpenUrl(PROVIDER_LINKS[provider])}
            >
              {keyLinkLabel(provider)}
            </button>
            <label className="setup-label">
              Model
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            {provider === 'openai' && (
              <label className="setup-label">
                Base URL <span className="setup-optional">(optional)</span>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={setup.defaults.openai.baseUrl}
                />
              </label>
            )}
          </>
        )}

        {error && <p className="setup-error">{error}</p>}

        <div className="setup-actions">
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            {provider === 'vscode' ? 'Use editor model' : 'Save and continue'}
          </button>
        </div>
      </form>
    </div>
  );
}

function defaultModel(setup: ModelSetupInfo, provider: ModelProvider): string {
  if (provider === 'anthropic') {
    return setup.defaults.anthropic.model;
  }
  if (provider === 'openai') {
    return setup.defaults.openai.model;
  }
  if (provider === 'openrouter') {
    return setup.defaults.openrouter.model;
  }
  if (provider === 'gemini') {
    return setup.defaults.gemini.model;
  }
  return '';
}

function keyPlaceholder(provider: ModelProvider): string {
  if (provider === 'gemini') {
    return 'AIza...';
  }
  if (provider === 'openrouter') {
    return 'sk-or-...';
  }
  return 'sk-...';
}

function keyLinkLabel(provider: ModelProvider): string {
  if (provider === 'gemini') {
    return 'Get a Gemini key from Google AI Studio';
  }
  if (provider === 'openrouter') {
    return 'Get a free OpenRouter key';
  }
  if (provider === 'openai') {
    return 'Get an OpenAI key';
  }
  return 'Get an Anthropic key';
}

export default SetupModel;
