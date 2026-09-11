import { FileContents, WalkthroughChapter, DiffHunk } from '../types';

interface ChapterViewProps {
  chapter: WalkthroughChapter;
  hunks: DiffHunk[];
  files: Record<string, FileContents>;
}

function ChapterView({ chapter, hunks, files }: ChapterViewProps) {
  const chapterHunks = chapter.hunkIndices
    .map((index) => hunks[index])
    .filter((hunk): hunk is DiffHunk => Boolean(hunk));

  return (
    <div className="code-view">
      <div className="code-header">
        <h3>{chapter.title}</h3>
        <span className="line-range">
          {chapter.filePaths.length} file{chapter.filePaths.length === 1 ? '' : 's'}
          {chapterHunks.length ? ` · ${chapterHunks.length} diffs` : ''}
        </span>
      </div>
      <div className="code-explanation">
        {chapter.briefing}
      </div>
      {chapterHunks.map((hunk, index) => {
        const fileData = files[hunk.filePath];
        const postLineCount = fileData?.postContent
          ? fileData.postContent.split('\n').length
          : 0;

        return (
          <div key={`${hunk.filePath}:${hunk.newStart}:${index}`} className="chapter-hunk">
            <div className="code-header">
              <h3>{hunk.filePath}</h3>
              <span className="line-range">
                Lines {hunk.oldStart}-{hunk.oldStart + hunk.oldLines} → {hunk.newStart}-{hunk.newStart + hunk.newLines}
                {postLineCount > 0 ? ` · ${postLineCount} lines in file` : ''}
              </span>
            </div>
            <div className="diff-view">
              <pre
                className="diff-content"
                dangerouslySetInnerHTML={{ __html: highlightDiff(hunk.content) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
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
      return `<span class="diff-context">${escaped}</span>`;
    })
    .join('\n');
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
