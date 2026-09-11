import { useState, useEffect } from 'react';
import { useWebviewMessage } from './hooks/useWebviewMessage';
import { ModelSetupInfo, WebviewData } from './types';
import './App.css';
import Header from './components/Header';
import ChapterList from './components/ChapterList';
import ChapterView from './components/ChapterView';
import Loading from './components/Loading';
import SetupModel from './components/SetupModel';

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
      <div className="app">
        <Header prMetadata={null} />
        <div className="content">
          <div className="setup-page">
            <SetupModel
              setup={setup}
              error={setupError}
              onSave={saveModel}
              onOpenUrl={(url) => sendMessage({ type: 'openUrl', url })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <Header prMetadata={null} />
        <div className="content">
          <div className="error">
            <h2>Error</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <Header prMetadata={null} />
        <div className="content">
          <p>No PR data loaded</p>
        </div>
      </div>
    );
  }

  const selectedChapter = data.chapters.find((chapter) => chapter.id === selectedChapterId);

  return (
    <div className="app">
      <Header
        prMetadata={data.prMetadata}
        modelLabel={modelLabel}
        onRegenerate={() => sendMessage({ type: 'regenerate' })}
        onCustomize={(userPrompt) => sendMessage({ type: 'customize', userPrompt })}
        onChangeModel={() => sendMessage({ type: 'configureModel' })}
      />
      <div className="content">
        <div className="left-pane">
          <div className="summary">
            <h3>What changed</h3>
            <p>{data.summary}</p>
            {data.howToReview && (
              <>
                <h3 className="review-heading">How to review</h3>
                <p>{data.howToReview}</p>
              </>
            )}
          </div>
          <ChapterList
            chapters={data.chapters}
            selectedChapterId={selectedChapterId}
            onSelectChapter={setSelectedChapterId}
          />
        </div>
        <div className="right-pane">
          {selectedChapter && (
            <ChapterView
              chapter={selectedChapter}
              hunks={data.hunks}
              files={data.files}
            />
          )}
        </div>
      </div>
      {setup && (
        <div className="setup-overlay">
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
