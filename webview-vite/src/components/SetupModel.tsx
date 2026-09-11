import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from 'cn';
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Set a model</CardTitle>
        <CardDescription>
          {inCursor
            ? 'Cursor does not share its chat models with extensions. Paste a Gemini API key from Google AI Studio — no OpenAI credits needed.'
            : setup.hasEditorModels
              ? 'Use GitHub Copilot, or paste an API key if you want a specific provider.'
              : 'Sign in to GitHub Copilot, or paste a Gemini API key from Google AI Studio.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm',
                  provider === item.id
                    ? 'border-ring bg-accent'
                    : 'border-border bg-background hover:bg-accent/70'
                )}
                onClick={() => selectProvider(item.id)}
              >
                <span>{item.label}</span>
                <small className="text-[11px] text-muted-foreground">{item.hint}</small>
              </button>
            ))}
          </div>

          {provider !== 'vscode' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="api-key">API key</Label>
                <Input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  placeholder={keyPlaceholder(provider)}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              <Button type="button" variant="link" className="h-auto justify-start px-0" onClick={() => onOpenUrl(PROVIDER_LINKS[provider])}>
                {keyLinkLabel(provider)}
              </Button>
              <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
              {provider === 'openai' && (
                <div className="grid gap-2">
                  <Label htmlFor="base-url">Base URL</Label>
                  <Input
                    id="base-url"
                    value={baseUrl}
                    placeholder={setup.defaults.openai.baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Optional</p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <CardFooter className="justify-end gap-2 px-0">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit">
              {provider === 'vscode' ? 'Use editor model' : 'Save and continue'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
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
