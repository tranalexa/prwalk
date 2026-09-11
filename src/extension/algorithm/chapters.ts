import { ChapterKind, DiffHunk, HunkChangeKind, WalkthroughChapter } from '../webview/messaging';
import { DependencyMap } from '../parser/callGraph';
import { LLMChapterRecommendation } from '../llm/types';

const MAX_RECOMMENDED_CHAPTERS = 8;

export interface CatalogFile {
  path: string;
  kind: ChapterKind;
  symbolIds: string[];
  sampleDiff: string;
}

export interface ReviewCatalog {
  files: CatalogFile[];
  hunksByFile: Map<string, DiffHunk[]>;
  symbols: Array<{ id: string; name: string; filePath: string }>;
  entryPoints: Array<{ id: string; name: string; filePath: string }>;
  leafNodes: Array<{ id: string; name: string; filePath: string }>;
  edges: Array<{ from: string; to: string; fromName: string; toName: string }>;
  treeText: string;
}

export function buildReviewCatalog(
  orderedHunks: DiffHunk[],
  dependencyMap: DependencyMap
): ReviewCatalog {
  const hunksByFile = new Map<string, DiffHunk[]>();
  const fileOrder: string[] = [];

  for (const hunk of orderedHunks) {
    if (!hunksByFile.has(hunk.filePath)) {
      fileOrder.push(hunk.filePath);
      hunksByFile.set(hunk.filePath, []);
    }
    hunksByFile.get(hunk.filePath)!.push(hunk);
  }

  const symbols = Array.from(dependencyMap.symbols.values()).map((symbol) => ({
    id: symbol.id,
    name: symbol.name,
    filePath: symbol.filePath,
  }));

  const files: CatalogFile[] = fileOrder.map((path) => {
    const fileHunks = hunksByFile.get(path) || [];
    return {
      path,
      kind: classifyFile(path, fileHunks),
      symbolIds: symbols.filter((symbol) => symbol.filePath === path).map((symbol) => symbol.id),
      sampleDiff: fileHunks.map((hunk) => clipDiff(hunk.content)).join('\n'),
    };
  });

  const edges: ReviewCatalog['edges'] = [];
  for (const [from, callees] of dependencyMap.callees) {
    const fromSymbol = dependencyMap.symbols.get(from);
    for (const to of callees) {
      const toSymbol = dependencyMap.symbols.get(to);
      if (!fromSymbol || !toSymbol) {
        continue;
      }
      edges.push({
        from,
        to,
        fromName: fromSymbol.name,
        toName: toSymbol.name,
      });
    }
  }

  return {
    files,
    hunksByFile,
    symbols,
    entryPoints: namedSymbols(dependencyMap, dependencyMap.entryPoints),
    leafNodes: namedSymbols(dependencyMap, dependencyMap.leafNodes),
    edges,
    treeText: formatCallTree(dependencyMap),
  };
}

export function bindRecommendedChapters(
  recommendations: LLMChapterRecommendation[],
  catalog: ReviewCatalog,
  orderedHunks: DiffHunk[]
): WalkthroughChapter[] {
  const allowedFiles = new Set(catalog.files.map((file) => file.path));
  const symbolToFile = new Map(catalog.symbols.map((symbol) => [symbol.id, symbol.filePath]));
  const claimed = new Set<string>();
  const chapters: WalkthroughChapter[] = [];

  for (const recommendation of recommendations.slice(0, MAX_RECOMMENDED_CHAPTERS)) {
    const filePaths: string[] = [];

    for (const filePath of recommendation.filePaths || []) {
      claimFile(filePath, allowedFiles, claimed, filePaths);
    }

    for (const symbolId of recommendation.symbolIds || []) {
      const filePath = symbolToFile.get(symbolId);
      if (filePath) {
        claimFile(filePath, allowedFiles, claimed, filePaths);
      }
    }

    if (filePaths.length === 0) {
      continue;
    }

    chapters.push(makeChapter(
      `chapter-${chapters.length + 1}`,
      majorityKind(filePaths, catalog),
      recommendation.title.trim() || stubTitle(filePaths),
      recommendation.briefing.trim() || stubBriefing(filePaths),
      filePaths,
      catalog,
      orderedHunks
    ));
  }

  const leftovers = catalog.files.filter((file) => !claimed.has(file.path));
  const leftoverTests = leftovers.filter((file) => file.kind === 'test');
  const leftoverOther = leftovers.filter((file) => file.kind === 'other');
  const leftoverLogic = leftovers.filter((file) => file.kind === 'logic');

  if (leftoverLogic.length > 0) {
    chapters.push(makeChapter(
      'more-logic',
      'logic',
      'Also in this PR',
      leftoverBriefing(leftoverLogic),
      leftoverLogic.map((file) => file.path),
      catalog,
      orderedHunks
    ));
  }

  if (leftoverTests.length > 0) {
    chapters.push(makeChapter(
      'tests',
      'test',
      'Tests',
      leftoverTests.length === 1
        ? 'A test for the new behavior.'
        : `${leftoverTests.length} tests for the new behavior.`,
      leftoverTests.map((file) => file.path),
      catalog,
      orderedHunks
    ));
  }

  if (leftoverOther.length > 0) {
    chapters.push(makeChapter(
      'other',
      'other',
      'Docs and config',
      'Notes and settings. Skip these if you are reviewing how the product works.',
      leftoverOther.map((file) => file.path),
      catalog,
      orderedHunks
    ));
  }

  return chapters;
}

export function formatCallTree(dependencyMap: DependencyMap): string {
  if (dependencyMap.symbols.size === 0) {
    return 'No function-level call graph. Group by file instead.';
  }

  const lines: string[] = [];
  const roots = dependencyMap.entryPoints.length > 0
    ? dependencyMap.entryPoints
    : [...dependencyMap.symbols.keys()];

  const seen = new Set<string>();

  const walk = (symbolId: string, depth: number) => {
    const symbol = dependencyMap.symbols.get(symbolId);
    if (!symbol) {
      return;
    }
    const prefix = `${'  '.repeat(depth)}${depth === 0 ? '' : '→ '}`;
    const outside = symbol.inPr === false ? ' [outside PR]' : '';
    lines.push(`${prefix}${symbol.name} (${symbol.filePath})${outside}${seen.has(symbolId) ? ' [already listed]' : ''}`);
    if (seen.has(symbolId)) {
      return;
    }
    seen.add(symbolId);
    const callees = dependencyMap.callees.get(symbolId);
    if (!callees) {
      return;
    }
    for (const callee of callees) {
      walk(callee, depth + 1);
    }
  };

  for (const root of roots) {
    walk(root, 0);
  }

  for (const [symbolId] of dependencyMap.symbols) {
    if (!seen.has(symbolId)) {
      walk(symbolId, 0);
    }
  }

  return lines.join('\n');
}

function leftoverBriefing(files: CatalogFile[]): string {
  if (files.length === 1) {
    return `One more file came with this change.`;
  }
  return `${files.length} more files came with this change. Open them if you want the full picture.`;
}

function claimFile(
  filePath: string,
  allowedFiles: Set<string>,
  claimed: Set<string>,
  filePaths: string[]
) {
  if (!allowedFiles.has(filePath) || claimed.has(filePath)) {
    return;
  }
  claimed.add(filePath);
  filePaths.push(filePath);
}

function makeChapter(
  id: string,
  kind: ChapterKind,
  title: string,
  briefing: string,
  filePaths: string[],
  catalog: ReviewCatalog,
  orderedHunks: DiffHunk[]
): WalkthroughChapter {
  const hunkIndices: number[] = [];
  for (const filePath of filePaths) {
    for (const hunk of catalog.hunksByFile.get(filePath) || []) {
      const index = orderedHunks.indexOf(hunk);
      if (index >= 0) {
        hunkIndices.push(index);
      }
    }
  }

  return {
    id,
    kind,
    title,
    briefing,
    filePaths,
    hunkIndices,
  };
}

function majorityKind(filePaths: string[], catalog: ReviewCatalog): ChapterKind {
  const kinds = filePaths.map((path) => {
    return catalog.files.find((file) => file.path === path)?.kind || 'logic';
  });
  if (kinds.every((kind) => kind === 'test')) {
    return 'test';
  }
  if (kinds.every((kind) => kind === 'other')) {
    return 'other';
  }
  return 'logic';
}

function classifyFile(filePath: string, hunks: DiffHunk[]): ChapterKind {
  if (hunks.some((hunk) => hunk.changeKind === 'test')) {
    return 'test';
  }

  const kinds = new Set(hunks.map((hunk) => hunk.changeKind));
  const onlyNoise = [...kinds].every((kind) => isNoiseKind(kind));
  return onlyNoise ? 'other' : 'logic';
}

function isNoiseKind(kind: HunkChangeKind): boolean {
  return kind === 'comment' || kind === 'docs' || kind === 'config';
}

function namedSymbols(dependencyMap: DependencyMap, ids: string[]) {
  return ids
    .map((id) => dependencyMap.symbols.get(id))
    .filter((symbol): symbol is NonNullable<typeof symbol> => Boolean(symbol))
    .map((symbol) => ({
      id: symbol.id,
      name: symbol.name,
      filePath: symbol.filePath,
    }));
}

function stubTitle(filePaths: string[]): string {
  const fileName = filePaths[0]?.split('/').pop();
  return fileName || 'Core change';
}

function stubBriefing(filePaths: string[]): string {
  if (filePaths.length === 1) {
    return `This part of the change lives in ${filePaths[0]}.`;
  }
  return `This part of the change covers ${filePaths.length} files.`;
}

function clipDiff(content: string, maxChars = 1200): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n... [diff truncated]`;
}
