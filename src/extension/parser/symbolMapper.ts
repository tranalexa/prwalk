import { DiffHunk } from '../webview/messaging';
import { SymbolInfo, parseFile, buildLineIndex, extractSymbols } from './treeSitter';
import { PRFile } from '../github/types';
import { RawImport, extractRawImports } from './imports';
import { grammarFromPath, isJavaScriptFamily } from './languages';

export interface HunkSymbolMapping {
  hunk: DiffHunk;
  symbols: SymbolInfo[];
  isAmbiguous: boolean;
}

export interface FileSymbolMap {
  filePath: string;
  preSymbols: SymbolInfo[];
  postSymbols: SymbolInfo[];
  hunks: HunkSymbolMapping[];
  imports: RawImport[];
  inPr: boolean;
  sourceSnippet?: string;
}

export async function mapHunksToSymbols(
  hunks: DiffHunk[],
  files: PRFile[]
): Promise<FileSymbolMap[]> {
  const fileMaps: Map<string, FileSymbolMap> = new Map();

  // Initialize file maps
  for (const file of files) {
    if (file.status === 'deleted') {
      continue; // Skip deleted files for now
    }

    fileMaps.set(file.path, {
      filePath: file.path,
      preSymbols: [],
      postSymbols: [],
      hunks: [],
      imports: [],
      inPr: true,
    });
  }

  // Parse files and extract symbols
  for (const file of files) {
    if (file.status === 'deleted') {
      continue;
    }

    const fileMap = fileMaps.get(file.path);
    if (!fileMap) {
      continue;
    }

    if (file.postContent) {
      const tree = await parseFile(file.postContent, file.path);
      if (tree) {
        fileMap.postSymbols = extractSymbols(tree, file.path, true);
        if (isJavaScriptFamily(file.path)) {
          fileMap.imports = extractRawImports(tree.rootNode);
        }
      }
    }

    if (file.preContent) {
      const tree = await parseFile(file.preContent, file.path);
      if (tree) {
        fileMap.preSymbols = extractSymbols(tree, file.path, true);
      }
    }
  }

  // Map hunks to symbols
  for (const hunk of hunks) {
    const fileMap = fileMaps.get(hunk.filePath);
    if (!fileMap) {
      continue;
    }

    const file = files.find(f => f.path === hunk.filePath);
    const content = file?.postContent || null;
    const mapping = mapHunkToSymbols(hunk, fileMap.postSymbols, content);
    fileMap.hunks.push(mapping);
  }

  return Array.from(fileMaps.values());
}

export async function mapContextFiles(files: Array<{ path: string; content: string }>): Promise<FileSymbolMap[]> {
  const mapped: FileSymbolMap[] = [];
  for (const file of files) {
    if (!grammarFromPath(file.path)) {
      continue;
    }
    const tree = await parseFile(file.content, file.path);
    if (!tree) {
      continue;
    }

    mapped.push({
      filePath: file.path,
      preSymbols: [],
      postSymbols: extractSymbols(tree, file.path, false),
      hunks: [],
      imports: isJavaScriptFamily(file.path) ? extractRawImports(tree.rootNode) : [],
      inPr: false,
      sourceSnippet: clipSource(file.content),
    });
  }
  return mapped;
}

function mapHunkToSymbols(
  hunk: DiffHunk,
  symbols: SymbolInfo[],
  content: string | null
): HunkSymbolMapping {
  const touchedSymbols: SymbolInfo[] = [];

  // Build line index for byte conversion
  const lineIndex = content ? buildLineIndex(content) : new Map();

  for (const symbol of symbols) {
    // Check if hunk overlaps with symbol's line range
    const [symbolStart, symbolEnd] = symbol.lineRange;
    const hunkStart = hunk.newStart;
    const hunkEnd = hunk.newStart + hunk.newLines;

    // Check for overlap
    if (hunkStart <= symbolEnd && hunkEnd >= symbolStart) {
      touchedSymbols.push(symbol);
    }
  }

  // Determine if ambiguous
  const isAmbiguous = touchedSymbols.length === 0 || touchedSymbols.length > 1;

  return {
    hunk,
    symbols: touchedSymbols,
    isAmbiguous,
  };
}

export function getPrimarySymbol(mapping: HunkSymbolMapping): SymbolInfo | null {
  if (mapping.isAmbiguous || mapping.symbols.length === 0) {
    return null;
  }

  // Pick the symbol with the largest line range overlap
  const hunk = mapping.hunk;
  const hunkStart = hunk.newStart;
  const hunkEnd = hunk.newStart + hunk.newLines;

  let primary = mapping.symbols[0];
  let maxOverlap = 0;

  for (const symbol of mapping.symbols) {
    const [symbolStart, symbolEnd] = symbol.lineRange;
    const overlapStart = Math.max(hunkStart, symbolStart);
    const overlapEnd = Math.min(hunkEnd, symbolEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      primary = symbol;
    }
  }

  return primary;
}

function clipSource(content: string, maxChars = 800): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n... [truncated]`;
}
