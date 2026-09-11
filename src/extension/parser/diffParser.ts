import { DiffHunk, HunkChangeKind } from '../webview/messaging';

export function parseDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split('\n');
  let currentFile: string | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineCounter = 0;
  let newLineCounter = 0;

  const closeHunk = () => {
    if (!currentHunk) {
      return;
    }
    currentHunk.changeKind = classifyHunk(currentHunk);
    hunks.push(currentHunk);
    currentHunk = null;
  };

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      closeHunk();
      currentFile = pickFilePath(fileMatch[1], fileMatch[2]);
      continue;
    }

    if (isMetaLine(line)) {
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
    if (hunkMatch && currentFile) {
      closeHunk();

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLines = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLines = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

      currentHunk = {
        filePath: currentFile,
        oldStart,
        oldLines,
        newStart,
        newLines,
        content: line,
        changeKind: 'logic',
        changes: [],
      };

      oldLineCounter = oldStart;
      newLineCounter = newStart;
      continue;
    }

    if (!currentHunk || !isHunkBodyLine(line)) {
      continue;
    }

    const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'delete' : 'context';
    const contentLine = line.substring(1);

    let oldLineNumber: number | null = null;
    let newLineNumber: number | null = null;

    if (type === 'add') {
      newLineNumber = newLineCounter++;
    } else if (type === 'delete') {
      oldLineNumber = oldLineCounter++;
    } else {
      oldLineNumber = oldLineCounter++;
      newLineNumber = newLineCounter++;
    }

    currentHunk.changes.push({
      type,
      line: contentLine,
      oldLineNumber,
      newLineNumber,
    });

    currentHunk.content += '\n' + line;
  }

  closeHunk();
  return hunks;
}

function pickFilePath(aPath: string, bPath: string): string {
  if (!bPath || bPath === 'dev/null') {
    return aPath;
  }
  return bPath;
}

function isMetaLine(line: string): boolean {
  return (
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('old mode ') ||
    line.startsWith('new mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('copy from ') ||
    line.startsWith('copy to ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('\\')
  );
}

function isHunkBodyLine(line: string): boolean {
  if (isMetaLine(line) || line.startsWith('diff --git ')) {
    return false;
  }
  return line.startsWith('+') || line.startsWith('-') || line.startsWith(' ');
}

export function classifyHunk(hunk: DiffHunk): HunkChangeKind {
  const path = hunk.filePath.toLowerCase();
  if (/\.(md|mdx|rst|txt)$/.test(path) || /(^|\/)docs\//.test(path)) {
    return 'docs';
  }
  if (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /_test\.py$/.test(path) ||
    path.includes('__tests__') ||
    /(^|\/)tests?\//.test(path) ||
    path.includes('/e2e/') ||
    path.includes('.test.')
  ) {
    return 'test';
  }
  if (
    /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|\.eslintrc|prettier)/.test(path)
  ) {
    return 'config';
  }

  const edited = hunk.changes.filter((change) => change.type === 'add' || change.type === 'delete');
  if (edited.length === 0) {
    return 'comment';
  }

  const allComments = edited.every((change) => isCommentOrWhitespace(change.line));
  return allComments ? 'comment' : 'logic';
}

function isCommentOrWhitespace(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/') ||
    trimmed.startsWith('{/*') ||
    trimmed.startsWith('<!--')
  );
}
