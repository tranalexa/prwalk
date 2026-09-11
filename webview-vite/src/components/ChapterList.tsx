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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
      <h3 className="sidebar-section-label mb-2 text-balance">Walkthrough</h3>
      <div className="flex flex-col gap-1">
        {chapters.map((chapter, index) => {
          const selected = selectedChapterId === chapter.id;
          return (
            <button
              key={chapter.id}
              type="button"
              className={cn(
                'pressable w-full rounded-lg px-2.5 py-2 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50',
                selected
                  ? 'bg-primary/12 shadow-[inset_2px_0_0_0_var(--primary)]'
                  : 'interactive-surface hover:shadow-xs'
              )}
              onClick={() => onSelectChapter(chapter.id)}
            >
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={selected ? 'default' : 'outline'}>{index + 1}</Badge>
                <span className="min-w-0 flex-1 text-sm font-semibold text-balance">{chapter.title}</span>
                <Badge variant="outline">{kindLabel(chapter.kind)}</Badge>
              </div>
              {chapter.briefing && (
                <p className="mb-1 line-clamp-3 text-xs leading-relaxed text-pretty text-muted-foreground">
                  {chapter.briefing}
                </p>
              )}
              <div className="text-[11px] text-muted-foreground">{fileSummary(chapter.filePaths)}</div>
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
