import { DiffHunk } from '../webview/messaging';
import { FileSymbolMap, getPrimarySymbol } from '../parser/symbolMapper';
import { DependencyMap } from '../parser/callGraph';

export function orderHunksByStory(
  hunks: DiffHunk[],
  fileMaps: FileSymbolMap[],
  dependencyMap: DependencyMap
): DiffHunk[] {
  // Step 1: Assign each hunk to a primary symbol (or mark ambiguous)
  const hunkToSymbol = new Map<number, string | null>();

  hunks.forEach((hunk, index) => {
    const fileMap = fileMaps.find(fm => fm.filePath === hunk.filePath);
    if (!fileMap) {
      hunkToSymbol.set(index, null);
      return;
    }

    const hunkMapping = fileMap.hunks.find(hm => hm.hunk === hunk);
    if (!hunkMapping) {
      hunkToSymbol.set(index, null);
      return;
    }

    const primary = getPrimarySymbol(hunkMapping);
    hunkToSymbol.set(index, primary?.id || null);
  });

  // Step 2: Topological sort of symbols
  const sortedSymbols = topologicalSort(dependencyMap);

  // Step 3: Create symbol -> rank map
  const symbolRank = new Map<string, number>();
  sortedSymbols.forEach((id, index) => symbolRank.set(id, index));

  // Step 4: Sort hunks by symbol rank, then by file, then by line number
  const ordered = [...hunks].sort((a, b) => {
    const indexA = hunks.indexOf(a);
    const indexB = hunks.indexOf(b);

    const symbolA = hunkToSymbol.get(indexA);
    const symbolB = hunkToSymbol.get(indexB);

    // Ambiguous hunks go last
    if (symbolA === null && symbolB === null) return 0;
    if (symbolA === null) return 1;
    if (symbolB === null) return -1;

    // Sort by symbol rank
    const rankA = symbolA ? symbolRank.get(symbolA) ?? Infinity : Infinity;
    const rankB = symbolB ? symbolRank.get(symbolB) ?? Infinity : Infinity;
    if (rankA !== rankB) return rankA - rankB;

    // Same rank: group by file
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);

    // Same file: sort by line number
    return a.newStart - b.newStart;
  });

  return ordered;
}

function topologicalSort(depMap: DependencyMap): string[] {
  // Kahn's algorithm with cycle detection
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: string[] = [];

  // Initialize in-degrees
  for (const [symbol] of depMap.symbols) {
    inDegree.set(symbol, 0);
  }

  // Calculate in-degrees from callees
  for (const [symbol, calleeSet] of depMap.callees) {
    for (const callee of calleeSet) {
      inDegree.set(callee, (inDegree.get(callee) ?? 0) + 1);
    }
  }

  // Find nodes with in-degree 0 (entry points)
  for (const [symbol, degree] of inDegree) {
    if (degree === 0) queue.push(symbol);
  }

  // Process queue
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const calleeSet = depMap.callees.get(current);
    if (calleeSet) {
      for (const callee of calleeSet) {
        inDegree.set(callee, (inDegree.get(callee) ?? 0) - 1);
        if (inDegree.get(callee) === 0) queue.push(callee);
      }
    }
  }

  // Handle cycles (remaining nodes)
  const remaining = [...inDegree.entries()].filter(([_, degree]) => degree > 0);
  for (const [symbol] of remaining) {
    result.push(symbol); // Append cycle nodes in any order
  }

  return result;
}
