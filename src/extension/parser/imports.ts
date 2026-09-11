export interface RawImport {
  localName: string;
  importedName: string | '*' | 'default';
  specifier: string;
}

export interface ImportBinding {
  localName: string;
  importedName: string | '*' | 'default';
  path: string;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

export function isProjectSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

export function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

export function extractRawImports(root: { type: string; children?: unknown[]; text?: string; childForFieldName?: (name: string) => unknown }): RawImport[] {
  const imports: RawImport[] = [];

  function walk(node: { type: string; children?: unknown[]; text?: string; childForFieldName?: (name: string) => unknown } | null | undefined) {
    if (!node) {
      return;
    }

    if (node.type === 'import_statement' && !isTypeOnly(node)) {
      const specifier = sourceSpecifier(node);
      if (specifier) {
        imports.push(...clauseBindings(node, specifier));
      }
    }

    const children = childrenOf(node);
    for (const child of children) {
      walk(child as typeof node);
    }
  }

  walk(root);
  return imports;
}

export function resolveModulePath(
  fromFile: string,
  specifier: string,
  knownPaths: Iterable<string>
): string | null {
  if (!isProjectSpecifier(specifier)) {
    return null;
  }

  const known = new Set(knownPaths);
  for (const candidate of moduleCandidates(fromFile, specifier)) {
    if (known.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function moduleCandidates(fromFile: string, specifier: string): string[] {
  const fromDir = posixDirname(fromFile);
  let joined = posixNormalize(`${fromDir}/${specifier}`);
  if (joined.startsWith('./')) {
    joined = joined.slice(2);
  }

  const candidates = new Set<string>();
  const stems = [joined];

  for (const ext of EXTENSIONS) {
    if (joined.endsWith(ext)) {
      stems.push(joined.slice(0, -ext.length));
      if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        stems.push(`${joined.slice(0, -ext.length)}.ts`);
        stems.push(`${joined.slice(0, -ext.length)}.tsx`);
      }
    }
  }

  for (const stem of stems) {
    candidates.add(stem);
    for (const ext of EXTENSIONS) {
      if (!hasExtension(stem)) {
        candidates.add(`${stem}${ext}`);
      }
    }
    if (!hasExtension(stem)) {
      for (const ext of EXTENSIONS) {
        candidates.add(`${stem}/index${ext}`);
      }
    }
  }

  return [...candidates];
}

export function hopCandidatePaths(
  fromFile: string,
  specifier: string,
  prPaths: Iterable<string>
): string[] {
  if (!isProjectSpecifier(specifier)) {
    return [];
  }
  if (resolveModulePath(fromFile, specifier, prPaths)) {
    return [];
  }
  return moduleCandidates(fromFile, specifier);
}

export function resolveBindings(
  files: Array<{ filePath: string; imports: RawImport[] }>,
  knownPaths: Iterable<string>
): Map<string, ImportBinding[]> {
  const bindings = new Map<string, ImportBinding[]>();

  for (const file of files) {
    const resolved: ImportBinding[] = [];
    for (const raw of file.imports) {
      const path = resolveModulePath(file.filePath, raw.specifier, knownPaths);
      if (!path) {
        continue;
      }
      resolved.push({
        localName: raw.localName,
        importedName: raw.importedName,
        path,
      });
    }
    bindings.set(file.filePath, resolved);
  }

  return bindings;
}

function clauseBindings(node: { children?: unknown[] }, specifier: string): RawImport[] {
  const imports: RawImport[] = [];
  const clause = findChild(node, 'import_clause') || node;

  const defaultId = namedIdentifier(clause);
  if (defaultId && !findChild(clause, 'named_imports') && !findChild(clause, 'namespace_import')) {
    imports.push({ localName: defaultId, importedName: 'default', specifier });
  }

  const namespace = findChild(clause, 'namespace_import');
  if (namespace) {
    const localName = namedIdentifier(namespace);
    if (localName) {
      imports.push({ localName, importedName: '*', specifier });
    }
  }

  const named = findChild(clause, 'named_imports');
  if (named) {
    for (const specifierNode of childrenOf(named)) {
      if ((specifierNode as { type?: string }).type !== 'import_specifier') {
        continue;
      }
      const name = fieldText(specifierNode, 'name') || namedIdentifier(specifierNode as { children?: unknown[]; childForFieldName?: (name: string) => unknown });
      const alias = fieldText(specifierNode, 'alias');
      if (!name) {
        continue;
      }
      imports.push({
        localName: alias || name,
        importedName: name,
        specifier,
      });
    }
  }

  const defaultWithNamed = childrenOf(clause).find((child) => {
    return (child as { type?: string }).type === 'identifier';
  });
  if (defaultWithNamed && (named || namespace)) {
    const localName = (defaultWithNamed as { text?: string }).text;
    if (localName) {
      imports.push({ localName, importedName: 'default', specifier });
    }
  }

  return imports;
}

function sourceSpecifier(node: { childForFieldName?: (name: string) => unknown; children?: unknown[] }): string | null {
  const source = node.childForFieldName?.('source') || findChild(node, 'string');
  if (!source || typeof source !== 'object') {
    return null;
  }
  const text = (source as { text?: string }).text;
  return text ? stripQuotes(text) : null;
}

function isTypeOnly(node: { children?: unknown[] }): boolean {
  return childrenOf(node).some((child) => {
    const typed = child as { type?: string; text?: string };
    return typed.type === 'type' || typed.text === 'type';
  });
}

function namedIdentifier(node: { children?: unknown[]; childForFieldName?: (name: string) => unknown }): string | null {
  const named = node.childForFieldName?.('name') as { text?: string } | undefined;
  if (named?.text) {
    return named.text;
  }
  for (const child of childrenOf(node)) {
    if ((child as { type?: string }).type === 'identifier') {
      return (child as { text?: string }).text || null;
    }
  }
  return null;
}

function fieldText(node: unknown, field: string): string | null {
  const target = node as { childForFieldName?: (name: string) => unknown };
  const child = target.childForFieldName?.(field) as { text?: string } | undefined;
  return child?.text || null;
}

function findChild(node: { children?: unknown[] }, type: string): { type?: string; children?: unknown[]; text?: string; childForFieldName?: (name: string) => unknown } | undefined {
  return childrenOf(node).find((child) => (child as { type?: string }).type === type) as ReturnType<typeof findChild>;
}

function childrenOf(node: { children?: unknown[] } | unknown): unknown[] {
  if (!node || typeof node !== 'object' || !('children' in node)) {
    return [];
  }
  const children = (node as { children?: unknown }).children;
  if (Array.isArray(children)) {
    return children;
  }
  if (children && typeof children === 'object' && Symbol.iterator in Object(children)) {
    return [...(children as Iterable<unknown>)];
  }
  return [];
}

function posixDirname(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

function posixNormalize(filePath: string): string {
  const parts: string[] = [];
  for (const part of filePath.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function hasExtension(filePath: string): boolean {
  const base = filePath.split('/').pop() || '';
  return base.includes('.');
}
