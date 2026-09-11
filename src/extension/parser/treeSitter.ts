import * as vscode from 'vscode';
import { Language, Node, Parser, Query, Tree } from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import { TAG_INHERITS, grammarFromPath } from './languages';

let parserInstance: Parser | null = null;
let grammarDir = '';
const languages = new Map<string, Language>();
const tagQueries = new Map<string, Query | null>();

export async function initializeTreeSitter(source?: vscode.ExtensionContext | string): Promise<void> {
  if (parserInstance) {
    return;
  }

  grammarDir = resolveGrammarDir(source);

  await Parser.init({
    locateFile: (filename: string) => path.join(grammarDir, filename),
  });

  parserInstance = new Parser();
}

export async function parseFile(content: string, filePath: string): Promise<Tree | null> {
  if (!parserInstance) {
    throw new Error('Tree-sitter not initialized. Call initializeTreeSitter first.');
  }

  const grammar = grammarFromPath(filePath);
  if (!grammar) {
    return null;
  }

  const language = await loadLanguage(grammar);
  if (!language) {
    return null;
  }

  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  try {
    parserInstance.setLanguage(language);
    return parserInstance.parse(normalizedContent);
  } catch (error) {
    console.error(`Failed to parse file ${filePath}:`, error);
    return null;
  }
}

export function buildLineIndex(content: string): Map<number, number> {
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const index = new Map<number, number>();
  let byteOffset = 0;
  let lineNum = 1;
  index.set(lineNum, byteOffset);

  for (let i = 0; i < normalizedContent.length; i++) {
    if (normalizedContent[i] === '\n') {
      lineNum++;
      byteOffset = i + 1;
      index.set(lineNum, byteOffset);
    }
  }

  return index;
}

export function lineToByte(lineNumber: number, lineIndex: Map<number, number>): number {
  return lineIndex.get(lineNumber) ?? 0;
}

export function extractSymbols(
  tree: Tree,
  filePath: string,
  inPr = true
): SymbolInfo[] {
  const grammar = grammarFromPath(filePath);
  if (!grammar) {
    return [];
  }

  const query = tagQueries.get(grammar);
  if (!query) {
    return [];
  }

    const symbols: SymbolInfo[] = [];
    const callRefs: Array<{ name: string; start: number; end: number }> = [];

  for (const match of query.matches(tree.rootNode)) {
    let definition: { kind: SymbolInfo['kind']; node: Node } | undefined;
    let name: string | undefined;
    let callNode: Node | undefined;

    for (const capture of match.captures) {
      if (capture.name === 'name') {
        name = capture.node.text;
      }
      const kind = definitionKind(capture.name);
      if (kind) {
        definition = { kind, node: capture.node };
      }
      if (capture.name === 'reference.call') {
        callNode = capture.node;
      }
    }

    if (callNode && name) {
      callRefs.push({
        name,
        start: callNode.startIndex,
        end: callNode.endIndex,
      });
    }

    if (!definition || !name) {
      continue;
    }

    const id = `${filePath}:${name}`;
    const byteRange: [number, number] = [definition.node.startIndex, definition.node.endIndex];
    const existing = symbols.find((symbol) => symbol.id === id);
    if (existing) {
      const existingSpan = existing.byteRange[1] - existing.byteRange[0];
      const nextSpan = byteRange[1] - byteRange[0];
      if (nextSpan > existingSpan) {
        existing.kind = definition.kind;
        existing.byteRange = byteRange;
        existing.lineRange = [definition.node.startPosition.row + 1, definition.node.endPosition.row + 1];
        existing.definitionNode = definition.node;
      }
      continue;
    }

    symbols.push({
      id,
      filePath,
      name,
      kind: definition.kind,
      byteRange,
      lineRange: [definition.node.startPosition.row + 1, definition.node.endPosition.row + 1],
      definitionNode: definition.node,
      inPr,
      callNames: [],
    });
  }

  for (const call of callRefs) {
    const owner = innermostSymbol(symbols, call.start, call.end);
    if (owner && !owner.callNames!.includes(call.name)) {
      owner.callNames!.push(call.name);
    }
  }

  return symbols;
}

export interface SymbolInfo {
  id: string;
  filePath: string;
  name: string;
  kind: 'function' | 'class' | 'method';
  byteRange: [number, number];
  lineRange: [number, number];
  definitionNode: Node;
  inPr?: boolean;
  callNames?: string[];
}

async function loadLanguage(grammar: string): Promise<Language | undefined> {
  const cached = languages.get(grammar);
  if (cached) {
    return cached;
  }

  const wasmPath = grammarAsset(grammar, `tree-sitter-${grammar}.wasm`);
  if (!wasmPath) {
    return undefined;
  }

  try {
    const wasmData = fs.readFileSync(wasmPath);
    const language = await Language.load(wasmData);
    languages.set(grammar, language);
    tagQueries.set(grammar, compileTagsQuery(grammar, language));
    return language;
  } catch (error) {
    console.error(`Failed to load ${grammar} grammar:`, error);
    return undefined;
  }
}

function compileTagsQuery(grammar: string, language: Language): Query | null {
  const source = tagsSource(grammar);
  if (!source) {
    return null;
  }

  try {
    return new Query(language, source);
  } catch (error) {
    console.error(`Failed to compile tags query for ${grammar}:`, error);
    return null;
  }
}

function tagsSource(grammar: string): string | undefined {
  const parts: string[] = [];
  for (const parent of TAG_INHERITS[grammar] || []) {
    const inherited = readTags(parent);
    if (inherited) {
      parts.push(inherited);
    }
  }
  const own = readTags(grammar);
  if (own) {
    parts.push(own);
  }
  const extra = extraTagsQuery(grammar);
  if (extra) {
    parts.push(extra);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.map(sanitizeTagsQuery).join('\n');
}

function extraTagsQuery(grammar: string): string {
  if (grammar === 'rust') {
    return `
(call_expression
  function: (scoped_identifier
    name: (identifier) @name)) @reference.call
`;
  }
  if (grammar === 'c' || grammar === 'cpp' || grammar === 'arduino') {
    return `
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @definition.function

(call_expression
  (identifier) @name
  (argument_list)) @reference.call
`;
  }
  return '';
}

function readTags(grammar: string): string | undefined {
  const tagsPath = grammarAsset(grammar, 'tags.scm');
  if (!tagsPath) {
    return undefined;
  }
  return fs.readFileSync(tagsPath, 'utf8');
}

function sanitizeTagsQuery(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/#(?:strip|select-adjacent|set-adjacent)!/.test(line))
    .join('\n');
}

function grammarAsset(grammar: string, fileName: string): string | undefined {
  const candidates = [
    path.join(grammarDir, 'grammars', grammar, fileName),
    path.join(packOutDir(), grammar, fileName),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function packOutDir(): string {
  return path.join(grammarDir, '..', 'node_modules', 'tree-sitter-wasm', 'out');
}

function resolveGrammarDir(source?: vscode.ExtensionContext | string): string {
  if (typeof source === 'string') {
    return source;
  }
  if (source) {
    return path.join(source.extensionUri.fsPath, 'dist');
  }
  return path.join(__dirname, '../../../dist');
}

function definitionKind(captureName: string): SymbolInfo['kind'] | undefined {
  if (captureName === 'definition.function') {
    return 'function';
  }
  if (captureName === 'definition.method') {
    return 'method';
  }
  if (captureName === 'definition.class') {
    return 'class';
  }
  return undefined;
}

function innermostSymbol(symbols: SymbolInfo[], start: number, end: number): SymbolInfo | undefined {
  let best: SymbolInfo | undefined;
  let bestSpan = Infinity;
  for (const symbol of symbols) {
    const [from, to] = symbol.byteRange;
    if (start >= from && end <= to) {
      const span = to - from;
      if (span < bestSpan) {
        best = symbol;
        bestSpan = span;
      }
    }
  }
  return best;
}
