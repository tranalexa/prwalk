import { useEffect, useState } from 'react';

interface LoadingProps {
  progress?: number;
  stage?: string;
}

function Loading({ progress = 0, stage }: LoadingProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const percent = Math.max(4, Math.min(progress, 100));

  return (
    <div className="app">
      <div className="header">
        <h1>PR Walkthrough</h1>
      </div>
      <div className="content">
        <div className="loading">
          <div className="spinner"></div>
          <p>{stage || 'Loading PR Walkthrough…'}</p>
          <div className="loading-bar" aria-hidden="true">
            <div className="loading-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="loading-hint">
            {seconds}s elapsed. Large PRs often take 20–40s; writing the walkthrough is usually the longest step.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Loading;
