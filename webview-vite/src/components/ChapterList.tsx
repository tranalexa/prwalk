import { ChapterKind, WalkthroughChapter } from '../types';

interface ChapterListProps {
  chapters: WalkthroughChapter[];
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

function ChapterList({ chapters, selectedChapterId, onSelectChapter }: ChapterListProps) {
  return (
    <div className="step-list">
      <h3>How to read this PR</h3>
      <div className="steps">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            className={`step ${selectedChapterId === chapter.id ? 'selected' : ''}`}
            onClick={() => onSelectChapter(chapter.id)}
          >
            <div className="step-header">
              <span className="step-number">{index + 1}</span>
              <span className="step-title">{chapter.title}</span>
              <span className={`step-kind ${chapter.kind}`}>{kindLabel(chapter.kind)}</span>
            </div>
            <div className="step-file">
              {chapter.filePaths.length === 1
                ? chapter.filePaths[0]
                : `${chapter.filePaths.length} files`}
            </div>
            <div className="step-explanation">{chapter.briefing}</div>
          </div>
        ))}
      </div>
    </div>
  );
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
