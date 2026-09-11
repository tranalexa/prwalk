import { FileSymbolMap } from './symbolMapper';
import { ImportBinding } from './imports';
import { SymbolInfo } from './treeSitter';
import { grammarFromPath, isDirectoryPackage } from './languages';

export interface CallGraph {
  nodes: Map<string, SymbolInfo>;
  edges: Array<{
    from: string;
    to: string;
    type: 'call' | 'reference' | 'inheritance';
  }>;
}

export interface DependencyMap {
  symbols: Map<string, SymbolInfo>;
  callers: Map<string, Set<string>>;
  callees: Map<string, Set<string>>;
  entryPoints: string[];
  leafNodes: string[];
}

export function buildCallGraph(
  fileMaps: FileSymbolMap[],
  bindingsByFile: Map<string, ImportBinding[]> = new Map()
): CallGraph {
  const nodes = new Map<string, SymbolInfo>();
  const symbolsByFile = new Map<string, SymbolInfo[]>();
  const edgeKeys = new Set<string>();
  const edges: CallGraph['edges'] = [];

  for (const fileMap of fileMaps) {
    symbolsByFile.set(fileMap.filePath, fileMap.postSymbols);
    for (const symbol of fileMap.postSymbols) {
      nodes.set(symbol.id, symbol);
    }
  }

  for (const fileMap of fileMaps) {
    if (!fileMap.inPr) {
      continue;
    }

    const bindings = bindingsByFile.get(fileMap.filePath) || [];
    for (const symbol of fileMap.postSymbols) {
      for (const callee of findFunctionCalls(symbol, fileMap, symbolsByFile, bindings)) {
        const key = `${symbol.id}->${callee}`;
        if (edgeKeys.has(key)) {
          continue;
        }
        edgeKeys.add(key);
        edges.push({
          from: symbol.id,
          to: callee,
          type: 'call',
        });
      }
    }
  }

  return { nodes, edges };
}

function findFunctionCalls(
  symbol: SymbolInfo,
  fileMap: FileSymbolMap,
  symbolsByFile: Map<string, SymbolInfo[]>,
  bindings: ImportBinding[]
): string[] {
  const calls: string[] = [];
  const bindingByLocal = new Map(bindings.map((binding) => [binding.localName, binding]));

  const resolveName = (name: string): string | undefined => {
    const local = fileMap.postSymbols.find((candidate) => candidate.name === name && candidate.id !== symbol.id);
    if (local) {
      return local.id;
    }

    if (isDirectoryPackage(fileMap.filePath)) {
      const peer = findDirectoryPeer(name, fileMap.filePath, symbolsByFile);
      if (peer && peer.id !== symbol.id) {
        return peer.id;
      }
    }

    const binding = bindingByLocal.get(name);
    if (binding && binding.importedName !== '*') {
      const imported = findImportedSymbol(symbolsByFile.get(binding.path) || [], binding);
      if (imported) {
        return imported.id;
      }
    }

    for (const importedBinding of bindings) {
      const match = (symbolsByFile.get(importedBinding.path) || []).find((candidate) => candidate.name === name);
      if (match && match.id !== symbol.id) {
        return match.id;
      }
    }

    return undefined;
  };

  if (symbol.callNames) {
    for (const name of symbol.callNames) {
      const symbolId = resolveName(name);
      if (symbolId) {
        calls.push(symbolId);
      }
    }
    return calls;
  }

  const node = symbol.definitionNode;
  if (!node) {
    return calls;
  }

  function traverseForCalls(n: { type?: string; children?: unknown[]; childForFieldName?: (name: string) => unknown } | null | undefined) {
    if (!n) {
      return;
    }

    if (n.type === 'call_expression') {
      const functionNode = n.childForFieldName?.('function') as { type?: string; text?: string; childForFieldName?: (name: string) => unknown } | undefined;
      const name = calleeName(functionNode);
      if (name) {
        const symbolId = resolveName(name);
        if (symbolId) {
          calls.push(symbolId);
        }
      }
    }

    if (n.type === 'member_expression') {
      const property = n.childForFieldName?.('property') as { text?: string } | undefined;
      if (property?.text) {
        const symbolId = resolveName(property.text);
        if (symbolId) {
          calls.push(symbolId);
        }
      }
    }

    const children = childrenOf(n);
    for (const child of children) {
      traverseForCalls(child as typeof n);
    }
  }

  traverseForCalls(node);
  return calls;
}

function childrenOf(node: { children?: unknown } | null | undefined): unknown[] {
  const children = node?.children;
  if (Array.isArray(children)) {
    return children;
  }
  if (children && typeof children === 'object' && Symbol.iterator in Object(children)) {
    return [...(children as Iterable<unknown>)];
  }
  return [];
}

function calleeName(
  functionNode: { type?: string; text?: string; childForFieldName?: (name: string) => unknown } | undefined
): string | undefined {
  if (!functionNode) {
    return undefined;
  }
  if (functionNode.type === 'identifier') {
    return functionNode.text;
  }
  if (functionNode.type === 'member_expression') {
    const property = functionNode.childForFieldName?.('property') as { text?: string } | undefined;
    return property?.text;
  }
  return functionNode.text?.includes('.') ? undefined : functionNode.text;
}

function findDirectoryPeer(
  name: string,
  filePath: string,
  symbolsByFile: Map<string, SymbolInfo[]>
): SymbolInfo | undefined {
  const dir = posixDirname(filePath);
  const grammar = grammarFromPath(filePath);
  for (const [path, symbols] of symbolsByFile) {
    if (path === filePath || posixDirname(path) !== dir || grammarFromPath(path) !== grammar) {
      continue;
    }
    const match = symbols.find((candidate) => candidate.name === name);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function posixDirname(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

function findImportedSymbol(symbols: SymbolInfo[], binding: ImportBinding): SymbolInfo | undefined {
  if (binding.importedName === 'default') {
    return symbols.find((symbol) => symbol.name === binding.localName) || symbols[0];
  }
  return symbols.find((symbol) => symbol.name === binding.importedName);
}

export function buildDependencyMap(callGraph: CallGraph): DependencyMap {
  const symbols = new Map(callGraph.nodes);
  const callers = new Map<string, Set<string>>();
  const callees = new Map<string, Set<string>>();

  for (const [id] of symbols) {
    callers.set(id, new Set());
    callees.set(id, new Set());
  }

  for (const edge of callGraph.edges) {
    callers.get(edge.to)?.add(edge.from);
    callees.get(edge.from)?.add(edge.to);
  }

  const entryPoints: string[] = [];
  for (const [id, callerSet] of callers) {
    const symbol = symbols.get(id);
    if (callerSet.size === 0 && symbol?.inPr !== false) {
      entryPoints.push(id);
    }
  }

  const leafNodes: string[] = [];
  for (const [id, calleeSet] of callees) {
    if (calleeSet.size === 0) {
      leafNodes.push(id);
    }
  }

  return {
    symbols,
    callers,
    callees,
    entryPoints,
    leafNodes,
  };
}
