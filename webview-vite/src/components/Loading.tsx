import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

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
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-border bg-muted px-3 py-2">
        <h1 className="text-sm font-semibold">PR Walk</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">{stage || 'Loading PR Walkthrough…'}</p>
        <Progress value={percent} className="w-60" />
        <p className="max-w-md text-center text-xs text-muted-foreground">
          {seconds}s elapsed. Large PRs often take 20–40s; writing the walkthrough is usually the longest step.
        </p>
      </div>
    </div>
  );
}

export default Loading;
