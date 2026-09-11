import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
// CC0 — Jason of GDN, https://opengameart.org/content/dog-spritesheets
import shibaWalk from '@/assets/shiba-walk-3x.gif';
import shibaIdle from '@/assets/shiba-idle-3x.png';

interface LoadingProps {
  progress?: number;
  stage?: string;
}

const PUP_LINES = [
  'Sniffing the diff…',
  'Chasing the interesting files…',
  'Who’s a good reviewer? You’re a good reviewer.',
  'Tail wag at 100%. Almost there!',
];

const DOG_WIDTH = 48;

function Loading({ progress = 0, stage }: LoadingProps) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLine((value) => (value + 1) % PUP_LINES.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const percent = Math.max(6, Math.min(progress, 100));
  const finished = progress >= 100;
  const halfDog = DOG_WIDTH / 2;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-border bg-muted px-3 py-2">
        <h1 className="text-sm font-semibold">PR Walk</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm">{stage || 'Loading PR Walkthrough…'}</p>
        <div className="relative w-72 pt-12">
          <div
            className={`loading-dog ${finished ? 'loading-dog-sit' : 'loading-dog-run'}`}
            style={{
              left: `clamp(0px, calc(${percent}% - ${halfDog}px), calc(100% - ${DOG_WIDTH}px))`,
            }}
            aria-hidden="true"
          >
            <img
              src={finished ? shibaIdle : shibaWalk}
              alt=""
              width={DOG_WIDTH}
              height={DOG_WIDTH}
              className="block h-12 w-12 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <Progress value={percent} className="h-2.5 w-full" />
        </div>
        <p className="text-xs text-muted-foreground">{PUP_LINES[line]}</p>
      </div>
    </div>
  );
}

export default Loading;
