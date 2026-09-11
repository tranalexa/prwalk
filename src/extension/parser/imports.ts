import { hopExtensions, hopFamily } from './languages';
import { RawImport, extractImports } from './importExtractors';

export { RawImport, extractImports };

export interface ImportBinding {
  localName: string;
  importedName: string | '*' | 'default';
  path: string;
}

export function isProjectSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

export function stripQuotes(value: string): string {
  return value.replace(/^['"<]+|[>'"]+$/g, '');
}

export function resolveModulePath(
  fromFile: string,
  specifier: string,
  knownPaths: Iterable<string>
): string | null {
  return resolveModulePaths(fromFile, specifier, knownPaths)[0] || null;
}

export function resolveModulePaths(
  fromFile: string,
  specifier: string,
  knownPaths: Iterable<string>
): string[] {
  const known = [...new Set(knownPaths)];
  const candidates = moduleCandidates(fromFile, specifier);
  const exact = candidates.filter((candidate) => known.includes(candidate));
  if (exact.length > 0) {
    return unique(expandDirectoryPackage(fromFile, exact, known));
  }

  const suffixHits = suffixMatches(fromFile, specifier, known);
  if (suffixHits.length > 0) {
    return unique(expandDirectoryPackage(fromFile, suffixHits, known));
  }

  return [];
}

export function moduleCandidates(fromFile: string, specifier: string): string[] {
  const family = hopFamily(fromFile);
  const extensions = hopExtensions(fromFile);
  const candidates = new Set<string>();

  for (const joined of joinSpecifiers(fromFile, specifier, family)) {
    addPathVariants(candidates, joined, extensions, family);
  }

  return [...candidates];
}

export function hopCandidatePaths(
  fromFile: string,
  specifier: string,
  prPaths: Iterable<string>
): string[] {
  if (resolveModulePath(fromFile, specifier, prPaths)) {
    return [];
  }
  const family = hopFamily(fromFile);
  if (!isProjectSpecifier(specifier) && family === 'javascript') {
    return [];
  }
  return moduleCandidates(fromFile, specifier);
}

export function resolveBindings(
  files: Array<{ filePath: string; imports: RawImport[] }>,
  knownPaths: Iterable<string>
): Map<string, ImportBinding[]> {
  const bindings = new Map<string, ImportBinding[]>();
  const known = [...knownPaths];

  for (const file of files) {
    const resolved: ImportBinding[] = [];
    const seen = new Set<string>();
    for (const raw of file.imports) {
      for (const path of resolveModulePaths(file.filePath, raw.specifier, known)) {
        const key = `${raw.localName}:${raw.importedName}:${path}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        resolved.push({
          localName: raw.localName,
          importedName: raw.importedName,
          path,
        });
      }
    }
    bindings.set(file.filePath, resolved);
  }

  return bindings;
}

export function hopFileStem(filePath: string): string {
  return filePath
    .replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs|pyi?|go|rs|java|scala|sc|cs|dart|h|hh|hpp|c|cc|cpp|cxx|ino|rb|php|lua|exs?|ml|mli|swift|sol|gleam)$/i, '')
    .replace(/\/(index|mod|__init__)$/, '');
}

function joinSpecifiers(fromFile: string, specifier: string, family: string): string[] {
  const fromDir = posixDirname(fromFile);
  const normalized = specifier.replace(/\\/g, '/');

  if (isProjectSpecifier(normalized) || normalized === '.') {
    const joined = posixNormalize(normalized === '.' ? fromDir : `${fromDir}/${normalized}`);
    return [joined];
  }

  if (family === 'python' && /^\./.test(normalized)) {
    return [posixNormalize(`${fromDir}/${normalized}`)];
  }

  if (family === 'c' && !normalized.includes('/')) {
    return [posixNormalize(`${fromDir}/${normalized}`)];
  }

  if (family === 'go' && !normalized.includes('.')) {
    return [posixNormalize(`${fromDir}/${normalized}`)];
  }

  if (normalized.includes('/')) {
    return [posixNormalize(normalized.startsWith('/') ? normalized.slice(1) : normalized)];
  }

  if (family === 'javascript') {
    return [];
  }

  const dotted = normalized.replace(/::/g, '/').replace(/\./g, '/');
  return [
    posixNormalize(`${fromDir}/${dotted}`),
    posixNormalize(dotted),
  ];
}

function addPathVariants(candidates: Set<string>, joined: string, extensions: string[], family: string): void {
  const stems = [joined];
  for (const ext of extensions) {
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
    if (!hasExtension(stem)) {
      for (const ext of extensions) {
        candidates.add(`${stem}${ext}`);
      }
      if (family === 'javascript') {
        for (const ext of extensions) {
          candidates.add(`${stem}/index${ext}`);
        }
      }
      if (family === 'python') {
        candidates.add(`${stem}/__init__.py`);
      }
      if (family === 'rust') {
        candidates.add(`${stem}/mod.rs`);
      }
      if (family === 'go') {
        candidates.add(`${stem}.go`);
      }
    }
  }
}

function suffixMatches(fromFile: string, specifier: string, known: string[]): string[] {
  const family = hopFamily(fromFile);
  if (family === 'javascript' || isProjectSpecifier(specifier)) {
    return [];
  }

  const needle = normalizeNeedle(specifier, family);
  if (!needle) {
    return [];
  }

  const extensions = hopExtensions(fromFile);
  return known.filter((path) => {
    const withoutExt = stripKnownExt(path, extensions);
    if (withoutExt === needle || withoutExt.endsWith(`/${needle}`)) {
      return true;
    }
    if (family === 'go') {
      const dir = posixDirname(path);
      return dir === needle || needle.endsWith(`/${dir}`) || dir.endsWith(`/${needle}`);
    }
    return false;
  });
}

function expandDirectoryPackage(fromFile: string, matched: string[], known: string[]): string[] {
  if (hopFamily(fromFile) !== 'go') {
    return matched;
  }
  const dirs = new Set(matched.map((path) => posixDirname(path)));
  return known.filter((path) => path.endsWith('.go') && dirs.has(posixDirname(path)));
}

function normalizeNeedle(specifier: string, family: string): string {
  let needle = specifier.replace(/\\/g, '/').replace(/::/g, '/');
  if (family === 'python' || family === 'jvm' || family === 'elixir' || family === 'lua') {
    needle = needle.replace(/\./g, '/');
  }
  if (family === 'php') {
    needle = needle.replace(/\\/g, '/');
  }
  return needle.replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function stripKnownExt(filePath: string, extensions: string[]): string {
  for (const ext of extensions) {
    if (filePath.endsWith(ext)) {
      return filePath.slice(0, -ext.length);
    }
  }
  return filePath;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
