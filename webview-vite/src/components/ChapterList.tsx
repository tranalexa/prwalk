import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';
import { ChapterKind, WalkthroughChapter } from '../types';
import { fileLabel } from '../reviewSteps';

interface ChapterListProps {
  chapters: WalkthroughChapter[];
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

function ChapterList({ chapters, selectedChapterId, onSelectChapter }: ChapterListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Walkthrough
      </h3>
      <div className="flex flex-col gap-1">
        {chapters.map((chapter, index) => {
          const selected = selectedChapterId === chapter.id;
          return (
            <button
              key={chapter.id}
              type="button"
              className={cn(
                'w-full rounded-md px-2.5 py-2 text-left transition-colors',
                selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
              onClick={() => onSelectChapter(chapter.id)}
            >
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={selected ? 'secondary' : 'outline'}>{index + 1}</Badge>
                <span className="min-w-0 flex-1 text-sm font-semibold">{chapter.title}</span>
                <Badge variant={selected ? 'secondary' : 'outline'}>{kindLabel(chapter.kind)}</Badge>
              </div>
              {chapter.briefing && (
                <p className={cn(
                  'mb-1 line-clamp-3 text-xs leading-relaxed',
                  selected ? 'opacity-90' : 'text-muted-foreground'
                )}>
                  {chapter.briefing}
                </p>
              )}
              <div className={cn('text-[11px]', selected ? 'opacity-80' : 'text-primary')}>
                {fileSummary(chapter.filePaths)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fileSummary(paths: string[]): string {
  if (paths.length === 1) {
    return fileLabel(paths[0]);
  }
  return `${fileLabel(paths[0])} +${paths.length - 1}`;
}

function kindLabel(kind: ChapterKind): string {
  if (kind === 'test') {
    return 'tests';
  }
  if (kind === 'other') {
    return 'docs';
  }
  return 'code';
}

export default ChapterList;
