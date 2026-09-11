import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import GitHubLink from '@/components/GitHubLink';
import { githubFileUrl, githubHunkUrl, hunkRangeLabel } from '../githubLinks';
import { FileContents, PRMetadata, WalkthroughChapter, DiffHunk } from '../types';
import { fileLabel } from '../reviewSteps';

interface ChapterViewProps {
  chapter: WalkthroughChapter;
  hunks: DiffHunk[];
  files: Record<string, FileContents>;
  prMetadata: PRMetadata;
  onOpenUrl: (url: string) => void;
}

function ChapterView({ chapter, hunks, prMetadata, onOpenUrl }: ChapterViewProps) {
  const chapterHunks = chapter.hunkIndices
    .map((index) => hunks[index])
    .filter((hunk): hunk is DiffHunk => Boolean(hunk));
  const groups = groupHunks(chapterHunks);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-background px-3 py-3 pb-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-balance">{chapter.title}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {chapter.filePaths.length} file{chapter.filePaths.length === 1 ? '' : 's'}
          {chapterHunks.length ? ` · ${chapterHunks.length} diffs` : ''}
        </span>
      </div>
      <p className="mb-1 rounded-lg bg-muted/70 px-3 py-2.5 text-sm leading-relaxed text-pretty">
        {chapter.briefing}
      </p>
      {groups.map((group) => (
        <Collapsible
          key={group.path}
          defaultOpen
          className="rounded-lg border border-border shadow-xs transition-shadow hover:border-ring/40 hover:shadow-sm"
        >
          <CollapsibleTrigger className="pressable group flex w-full min-h-10 items-center gap-2 rounded-t-[calc(var(--radius-lg)-1px)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 interactive-surface data-[state=closed]:rounded-b-[calc(var(--radius-lg)-1px)]">
            <ChevronRight
              className="motion-chevron size-4 shrink-0 translate-x-px group-data-[state=open]:rotate-90"
              strokeWidth={2}
            />
            <GitHubLink
              href={githubFileUrl(prMetadata, group.path)}
              onOpen={onOpenUrl}
              className="relative z-[1] text-sm font-medium"
            >
              {fileLabel(group.path)}
            </GitHubLink>
            <GitHubLink
              href={githubFileUrl(prMetadata, group.path)}
              onOpen={onOpenUrl}
              className="relative z-[1] min-w-0 flex-1 truncate text-xs text-muted-foreground"
            >
              {group.path}
            </GitHubLink>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {group.hunks.map((hunk, index) => (
              <div key={`${hunk.filePath}:${hunk.newStart}:${index}`} className="mx-3 mb-3 last:mb-3">
                <GitHubLink
                  href={githubHunkUrl(prMetadata, hunk)}
                  onOpen={onOpenUrl}
                  className="mb-1.5 text-[11px] text-muted-foreground"
                >
                  {hunkRangeLabel(hunk)}
                </GitHubLink>
                <pre
                  className="overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed whitespace-pre shadow-xs"
                  style={{ fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)' }}
                  dangerouslySetInnerHTML={{ __html: highlightDiff(hunk.content) }}
                />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

function groupHunks(hunks: DiffHunk[]): Array<{ path: string; hunks: DiffHunk[] }> {
  const groups: Array<{ path: string; hunks: DiffHunk[] }> = [];
  for (const hunk of hunks) {
    const last = groups[groups.length - 1];
    if (last && last.path === hunk.filePath) {
      last.hunks.push(hunk);
    } else {
      groups.push({ path: hunk.filePath, hunks: [hunk] });
    }
  }
  return groups;
}

function highlightDiff(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.startsWith('+')) {
        return `<span class="diff-add">${escaped}</span>`;
      }
      if (line.startsWith('-')) {
        return `<span class="diff-remove">${escaped}</span>`;
      }
      if (line.startsWith('@@')) {
        return `<span class="diff-hunk-header">${escaped}</span>`;
      }
      return `<span>${escaped}</span>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default ChapterView;
