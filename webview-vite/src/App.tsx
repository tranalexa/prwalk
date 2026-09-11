import { useState, useEffect } from 'react';
import { useWebviewMessage } from './hooks/useWebviewMessage';
import { ModelSetupInfo, WebviewData } from './types';
import Header from './components/Header';
import ChapterList from './components/ChapterList';
import ChapterView from './components/ChapterView';
import Loading from './components/Loading';
import SetupModel from './components/SetupModel';
import { reviewSteps } from './reviewSteps';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { demoData } from './demoData';
import { getVsCodeApi } from './vscodeApi';

function App() {
  const { message, sendMessage } = useWebviewMessage();
  const [data, setData] = useState<WebviewData | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Loading PR Walkthrough…');
  const [error, setError] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>();
  const [setup, setSetup] = useState<ModelSetupInfo | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV && !getVsCodeApi()) {
      setData(demoData);
      setSelectedChapterId(demoData.chapters[0].id);
      setModelLabel('gemini');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!message) return;

    switch (message.type) {
      case 'init':
      case 'regenerated':
        setData(message.data);
        setModelLabel(message.modelLabel);
        setLoading(false);
        setError(null);
        setSetup(null);
        setSetupError(null);
        if (message.data.chapters.length > 0) {
          setSelectedChapterId(message.data.chapters[0].id);
        }
        break;
      case 'loading':
        setLoading(true);
        setLoadingProgress(message.progress);
        setLoadingStage(message.stage || 'Loading PR Walkthrough…');
        setError(null);
        setSetup(null);
        break;
      case 'needsModel':
        setSetup(message.setup);
        setSetupError(message.error ?? null);
        setModelLabel(message.setup.currentLabel);
        setLoading(false);
        setError(null);
        break;
      case 'error':
        setError(message.error);
        setLoading(false);
        setSetup(null);
        break;
    }
  }, [message]);

  const saveModel = (payload: {
    provider: 'vscode' | 'openai' | 'anthropic' | 'openrouter' | 'gemini';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }) => {
    sendMessage({ type: 'saveModel', ...payload });
  };

  if (loading) {
    return <Loading progress={loadingProgress} stage={loadingStage} />;
  }

  if (setup && !data) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Header prMetadata={null} />
        <div className="flex flex-1 items-center justify-center overflow-auto p-8">
          <SetupModel
            setup={setup}
            error={setupError}
            onSave={saveModel}
            onOpenUrl={(url) => sendMessage({ type: 'openUrl', url })}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Header prMetadata={null} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <h2 className="text-base font-semibold text-destructive">Error</h2>
          <p className="max-w-xl text-center text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Header prMetadata={null} />
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          No PR data loaded
        </div>
      </div>
    );
  }

  const selectedChapter = data.chapters.find((chapter) => chapter.id === selectedChapterId);

  return (
    <div className="relative flex h-full flex-col bg-background">
      <Header
        prMetadata={data.prMetadata}
        modelLabel={modelLabel}
        onRegenerate={() => sendMessage({ type: 'regenerate' })}
        onCustomize={(userPrompt) => sendMessage({ type: 'customize', userPrompt })}
        onChangeModel={() => sendMessage({ type: 'configureModel' })}
      />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="32" minSize="22" className="flex min-h-0 flex-col">
          <div className="border-b border-border bg-muted px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              What changed
            </h3>
            <p className="text-sm leading-relaxed">{data.summary}</p>
            {data.howToReview && (
              <>
                <h3 className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  How to review
                </h3>
                <ol className="list-decimal space-y-1.5 pl-4 text-sm leading-relaxed">
                  {reviewSteps(data.howToReview).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <ChapterList
            chapters={data.chapters}
            selectedChapterId={selectedChapterId}
            onSelectChapter={setSelectedChapterId}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="68" minSize="30" className="flex min-h-0 flex-col">
          {selectedChapter && (
            <ChapterView
              chapter={selectedChapter}
              hunks={data.hunks}
              files={data.files}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      {setup && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-8">
          <SetupModel
            setup={setup}
            error={setupError}
            onSave={saveModel}
            onOpenUrl={(url) => sendMessage({ type: 'openUrl', url })}
            onCancel={() => setSetup(null)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
