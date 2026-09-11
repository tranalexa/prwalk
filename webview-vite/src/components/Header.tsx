interface HeaderProps {
  prMetadata: {
    title: string;
    url: string;
    owner: string;
    repo: string;
    prNumber: number;
  } | null;
  modelLabel?: string;
  onRegenerate?: () => void;
  onCustomize?: (userPrompt: string) => void;
  onChangeModel?: () => void;
}

function Header({ prMetadata, modelLabel, onRegenerate, onCustomize, onChangeModel }: HeaderProps) {
  const handleCustomize = () => {
    if (!onCustomize) {
      return;
    }

    const userPrompt = prompt('Enter customization for this walkthrough (e.g., "Focus on error handling"):');
    if (userPrompt) {
      onCustomize(userPrompt);
    }
  };

  return (
    <div className="header">
      <div className="header-left">
        <h1>PR Walkthrough</h1>
        {prMetadata && (
          <span className="pr-title">
            {prMetadata.owner}/{prMetadata.repo} #{prMetadata.prNumber} - {prMetadata.title}
          </span>
        )}
      </div>
      <div className="header-right">
        {onChangeModel && (
          <button className="btn btn-secondary model-chip" onClick={onChangeModel} title="Change model">
            {modelLabel || 'Set model'}
          </button>
        )}
        {prMetadata && onRegenerate && onCustomize && (
          <>
            <button className="btn btn-secondary" onClick={handleCustomize}>
              Customize
            </button>
            <button className="btn btn-primary" onClick={onRegenerate}>
              Regenerate
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Header;
