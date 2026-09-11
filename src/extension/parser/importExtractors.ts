import { hopFamily } from './languages';

export interface RawImport {
  localName: string;
  importedName: string | '*' | 'default';
  specifier: string;
}

type SyntaxNode = {
  type: string;
  text?: string;
  children?: unknown[];
  childForFieldName?: (name: string) => unknown;
};

export function extractImports(filePath: string, root: SyntaxNode): RawImport[] {
  switch (hopFamily(filePath)) {
    case 'javascript':
      return extractJavascript(root);
    case 'python':
      return extractPython(root);
    case 'go':
      return extractGo(root);
    case 'rust':
      return extractRust(root);
    case 'jvm':
      return extractJvm(root);
    case 'c':
      return extractCInclude(root);
    case 'ruby':
      return extractRuby(root);
    case 'php':
      return extractPhp(root);
    case 'lua':
      return extractLua(root);
    case 'elixir':
      return extractElixir(root);
    case 'gleam':
      return extractGleam(root);
    case 'ocaml':
      return extractOcaml(root);
    default:
      return [];
  }
}

function extractJavascript(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'import_statement' || isTypeOnly(node)) {
      return;
    }
    const specifier = sourceSpecifier(node);
    if (specifier) {
      imports.push(...clauseBindings(node, specifier));
    }
  });
  return imports;
}

function extractPython(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type === 'import_from_statement') {
      const module = pythonModulePath(node);
      const names = pythonAliasedNames(node);
      if (names.length === 0) {
        if (module) {
          imports.push({ localName: basename(module), importedName: '*', specifier: module });
        }
        return;
      }
      const onlyDots = !module || module === '.' || /^\.\.+$/.test(module);
      for (const name of names) {
        const specifier = onlyDots ? joinRelative(module || '.', name.imported) : module;
        imports.push({
          localName: name.local,
          importedName: name.imported,
          specifier,
        });
      }
      return;
    }
    if (node.type === 'import_statement') {
      for (const name of pythonAliasedNames(node)) {
        imports.push({
          localName: name.local,
          importedName: name.imported,
          specifier: dottedToPath(name.imported),
        });
      }
    }
  });
  return imports;
}

function extractGo(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'import_spec') {
      return;
    }
    const pathNode = node.childForFieldName?.('path') as SyntaxNode | undefined;
    const specifier = pathNode?.text ? stripQuotes(pathNode.text) : quotedString(node);
    if (!specifier) {
      return;
    }
    const alias = (node.childForFieldName?.('name') as SyntaxNode | undefined)?.text
      || identifierText(findChild(node, 'package_identifier') || findChild(node, 'identifier'));
    const localName = alias && alias !== '.' && alias !== '_'
      ? alias
      : goPackageName(specifier);
    imports.push({ localName, importedName: '*', specifier });
  });
  return imports;
}

function extractRust(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type === 'mod_item' && !findChild(node, 'declaration_list')) {
      const name = (node.childForFieldName?.('name') as SyntaxNode | undefined)?.text
        || identifierText(findChild(node, 'identifier'));
      if (name) {
        imports.push({ localName: name, importedName: '*', specifier: `./${name}` });
      }
      return;
    }
    if (node.type === 'use_declaration') {
      imports.push(...rustUseImports(node));
    }
  });
  return imports;
}

function extractJvm(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type === 'import_declaration' || node.type === 'using_directive' || node.type === 'import_or_export') {
      const spec = jvmImportSpecifier(node);
      if (!spec) {
        return;
      }
      imports.push({
        localName: spec.localName,
        importedName: spec.importedName,
        specifier: spec.specifier,
      });
    }
  });
  return imports;
}

function extractCInclude(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'preproc_include') {
      return;
    }
    const pathNode = (node.childForFieldName?.('path') as SyntaxNode | undefined)
      || findChild(node, 'string_literal')
      || findChild(node, 'string');
    if (!pathNode?.text || pathNode.type === 'system_lib_string') {
      return;
    }
    const specifier = stripQuotes(pathNode.text);
    if (!specifier || specifier.startsWith('<')) {
      return;
    }
    imports.push({
      localName: basename(specifier),
      importedName: '*',
      specifier: isRelative(specifier) ? specifier : `./${specifier}`,
    });
  });
  return imports;
}

function extractRuby(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'call' && node.type !== 'method_call') {
      return;
    }
    const method = identifierText(node.childForFieldName?.('method') as SyntaxNode | undefined)
      || identifierText(findChild(node, 'identifier'));
    if (method !== 'require' && method !== 'require_relative') {
      return;
    }
    const arg = firstStringArgument(node);
    if (!arg) {
      return;
    }
    const specifier = method === 'require_relative' || isRelative(arg) ? (isRelative(arg) ? arg : `./${arg}`) : arg;
    imports.push({ localName: basename(specifier), importedName: '*', specifier });
  });
  return imports;
}

function extractPhp(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type === 'namespace_use_declaration' || node.type === 'use_declaration') {
      const spec = phpUseSpecifier(node);
      if (spec) {
        imports.push(spec);
      }
      return;
    }
    if (
      node.type === 'include_expression'
      || node.type === 'include_once_expression'
      || node.type === 'require_expression'
      || node.type === 'require_once_expression'
    ) {
      const arg = firstStringArgument(node) || quotedString(node);
      if (arg) {
        imports.push({
          localName: basename(arg),
          importedName: '*',
          specifier: isRelative(arg) ? arg : `./${arg}`,
        });
      }
    }
  });
  return imports;
}

function extractLua(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'function_call' && node.type !== 'call') {
      return;
    }
    const name = identifierText(node.childForFieldName?.('name') as SyntaxNode | undefined)
      || identifierText(findChild(node, 'identifier'));
    if (name !== 'require') {
      return;
    }
    const arg = firstStringArgument(node);
    if (!arg) {
      return;
    }
    const specifier = isRelative(arg) ? arg : arg.replace(/\./g, '/');
    imports.push({ localName: basename(specifier), importedName: '*', specifier });
  });
  return imports;
}

function extractElixir(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'call') {
      return;
    }
    const name = identifierText(findChild(node, 'identifier') || node.childForFieldName?.('function') as SyntaxNode | undefined);
    if (name !== 'alias' && name !== 'import' && name !== 'require' && name !== 'use') {
      return;
    }
    const moduleName = elixirModuleName(node);
    if (!moduleName) {
      return;
    }
    imports.push({
      localName: moduleName.split('.').pop() || moduleName,
      importedName: '*',
      specifier: elixirModuleToPath(moduleName),
    });
  });
  return imports;
}

function extractGleam(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'import' && node.type !== 'import_declaration') {
      return;
    }
    const spec = gleamSpecifier(node);
    if (spec) {
      imports.push(spec);
    }
  });
  return imports;
}

function extractOcaml(root: SyntaxNode): RawImport[] {
  const imports: RawImport[] = [];
  walk(root, (node) => {
    if (node.type !== 'open_module' && node.type !== 'module_open') {
      return;
    }
    const name = identifierText(findChild(node, 'module_name') || findChild(node, 'identifier') || node.childForFieldName?.('module') as SyntaxNode | undefined);
    if (!name) {
      return;
    }
    imports.push({
      localName: name,
      importedName: '*',
      specifier: name,
    });
  });
  return imports;
}

function pythonModulePath(node: SyntaxNode): string {
  const module = node.childForFieldName?.('module_name') as SyntaxNode | undefined
    || findChild(node, 'relative_import')
    || findChild(node, 'dotted_name');
  if (!module?.text) {
    return '';
  }
  return relativeDotsToPath(module.text.replace(/\s+/g, ''));
}

function pythonAliasedNames(node: SyntaxNode): Array<{ local: string; imported: string }> {
  const names: Array<{ local: string; imported: string }> = [];
  const module = node.childForFieldName?.('module_name') as SyntaxNode | undefined;

  if (childrenOf(node).some((child) => (child as SyntaxNode).type === 'wildcard_import' || (child as SyntaxNode).text === '*')) {
    return [{ local: '*', imported: '*' }];
  }

  for (const child of importNameNodes(node, module)) {
    if (child.type === 'aliased_import') {
      const imported = ((child.childForFieldName?.('name') as SyntaxNode | undefined)?.text
        || identifierText(findChild(child, 'dotted_name') || findChild(child, 'identifier')))
        .split('.').pop() || '';
      const local = ((child.childForFieldName?.('alias') as SyntaxNode | undefined)?.text
        || identifierText(lastIdentifier(child)))
        .split('.').pop() || imported;
      if (imported) {
        names.push({ local, imported });
      }
      continue;
    }
    const imported = (child.text || '').split('.').pop();
    if (imported) {
      names.push({ local: imported, imported });
    }
  }
  return uniqueNames(names);
}

function importNameNodes(node: SyntaxNode, skip: SyntaxNode | undefined): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (const child of childrenOf(node)) {
    const current = child as SyntaxNode;
    if (current === skip || current.type === 'relative_import' || current.type === 'import_prefix') {
      continue;
    }
    if (current.type === 'from' || current.type === 'import' || current.text === 'from' || current.text === 'import') {
      continue;
    }
    if (current.type === 'aliased_import' || current.type === 'dotted_name' || current.type === 'identifier') {
      out.push(current);
      continue;
    }
    out.push(...importNameNodes(current, skip));
  }
  return out;
}

function lastIdentifier(node: SyntaxNode): SyntaxNode | undefined {
  const identifiers = childrenOf(node).filter((child) => (child as SyntaxNode).type === 'identifier') as SyntaxNode[];
  return identifiers[identifiers.length - 1];
}

function rustUseImports(node: SyntaxNode): RawImport[] {
  const text = (node.text || '').replace(/^use\s+/, '').replace(/;$/, '').trim();
  if (!text) {
    return [];
  }
  const specifier = rustUseToPath(text);
  const localName = rustUseLocalName(text);
  return [{ localName, importedName: localName === '*' ? '*' : localName, specifier }];
}

function rustUseToPath(text: string): string {
  const trimmed = text.replace(/\{[\s\S]*\}$/, '').replace(/::$/, '').replace(/\*$/, '').replace(/as\s+\w+$/, '').trim();
  if (trimmed.startsWith('super::')) {
    return `../${trimmed.slice('super::'.length).replace(/::/g, '/')}`;
  }
  if (trimmed.startsWith('crate::')) {
    return trimmed.slice('crate::'.length).replace(/::/g, '/');
  }
  if (trimmed.startsWith('self::')) {
    return `./${trimmed.slice('self::'.length).replace(/::/g, '/')}`;
  }
  return trimmed.replace(/::/g, '/');
}

function rustUseLocalName(text: string): string {
  const asMatch = text.match(/\bas\s+(\w+)\s*$/);
  if (asMatch) {
    return asMatch[1];
  }
  if (text.includes('*')) {
    return '*';
  }
  const last = text.replace(/\{[\s\S]*\}$/, '').split('::').filter(Boolean).pop() || text;
  return last.replace(/[^\w]/g, '') || '*';
}

function jvmImportSpecifier(node: SyntaxNode): RawImport | null {
  const text = (node.text || '')
    .replace(/^\s*(import|using)\s+(static\s+)?/, '')
    .replace(/;?\s*$/, '')
    .trim();
  if (!text) {
    return null;
  }
  const wildcard = text.endsWith('.*') || text.endsWith('.*');
  const dotted = text.replace(/\.\*$/, '');
  const specifier = dotted.replace(/\./g, '/');
  const localName = wildcard ? '*' : (dotted.split('.').pop() || dotted);
  return {
    localName,
    importedName: wildcard ? '*' : localName,
    specifier,
  };
}

function phpUseSpecifier(node: SyntaxNode): RawImport | null {
  const text = (node.text || '').replace(/^\s*use\s+/, '').replace(/;?\s*$/, '').trim();
  if (!text) {
    return null;
  }
  const asMatch = text.match(/^(.*?)\s+as\s+(\w+)$/i);
  const raw = asMatch ? asMatch[1] : text;
  const localName = asMatch ? asMatch[2] : (raw.split('\\').pop() || raw);
  return {
    localName,
    importedName: localName,
    specifier: raw.replace(/^\\/, '').replace(/\\/g, '/'),
  };
}

function gleamSpecifier(node: SyntaxNode): RawImport | null {
  const text = (node.text || '').replace(/^\s*import\s+/, '').trim();
  if (!text) {
    return null;
  }
  const path = text.split(/\s+/)[0].replace(/\.{2,}/g, '/');
  return {
    localName: basename(path),
    importedName: '*',
    specifier: path,
  };
}

function elixirModuleName(node: SyntaxNode): string {
  const alias = findChild(node, 'alias') || findChild(node, 'remote_identifier') || findChild(node, 'dot');
  if (alias?.text) {
    return alias.text.replace(/^:/, '');
  }
  const text = node.text || '';
  const match = text.match(/\b([A-Z][\w.]*)$/);
  return match ? match[1] : '';
}

function elixirModuleToPath(moduleName: string): string {
  return moduleName.split('.').map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()).join('/');
}

function clauseBindings(node: SyntaxNode, specifier: string): RawImport[] {
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
      if ((specifierNode as SyntaxNode).type !== 'import_specifier') {
        continue;
      }
      const name = fieldText(specifierNode, 'name') || namedIdentifier(specifierNode as SyntaxNode);
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

  const defaultWithNamed = childrenOf(clause).find((child) => (child as SyntaxNode).type === 'identifier');
  if (defaultWithNamed && (named || namespace)) {
    const localName = (defaultWithNamed as SyntaxNode).text;
    if (localName) {
      imports.push({ localName, importedName: 'default', specifier });
    }
  }

  return imports;
}

function sourceSpecifier(node: SyntaxNode): string | null {
  const source = node.childForFieldName?.('source') || findChild(node, 'string');
  if (!source || typeof source !== 'object') {
    return null;
  }
  const text = (source as SyntaxNode).text;
  return text ? stripQuotes(text) : null;
}

function isTypeOnly(node: SyntaxNode): boolean {
  return childrenOf(node).some((child) => {
    const typed = child as SyntaxNode;
    return typed.type === 'type' || typed.text === 'type';
  });
}

function namedIdentifier(node: SyntaxNode): string | null {
  const named = node.childForFieldName?.('name') as SyntaxNode | undefined;
  if (named?.text) {
    return named.text;
  }
  for (const child of childrenOf(node)) {
    if ((child as SyntaxNode).type === 'identifier') {
      return (child as SyntaxNode).text || null;
    }
  }
  return null;
}

function fieldText(node: unknown, field: string): string | null {
  const child = (node as SyntaxNode).childForFieldName?.(field) as SyntaxNode | undefined;
  return child?.text || null;
}

function relativeDotsToPath(module: string): string {
  const match = module.match(/^(\.+)(.*)$/);
  if (!match) {
    return dottedToPath(module);
  }
  const depth = match[1].length;
  const rest = dottedToPath(match[2]);
  if (depth === 1) {
    return rest ? `./${rest}` : '.';
  }
  const prefix = Array.from({ length: depth - 1 }, () => '..').join('/');
  return rest ? `${prefix}/${rest}` : prefix;
}

function dottedToPath(value: string): string {
  return value.replace(/^\.+/, '').replace(/\./g, '/');
}

function joinRelative(base: string, name: string): string {
  if (base === '.' || base === './') {
    return `./${name}`;
  }
  if (base.endsWith('/')) {
    return `${base}${name}`;
  }
  return `${base}/${name}`;
}

function goPackageName(specifier: string): string {
  const parts = specifier.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || specifier;
}

function firstStringArgument(node: SyntaxNode): string | null {
  const found = quotedString(node);
  if (found) {
    return found;
  }
  for (const child of childrenOf(node)) {
    const nested = quotedString(child as SyntaxNode);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function quotedString(node: SyntaxNode): string | null {
  if (node.type === 'string' || node.type === 'string_literal' || node.type === 'interpreted_string_literal' || node.type === 'raw_string_literal') {
    return node.text ? stripQuotes(node.text) : null;
  }
  const child = findChild(node, 'string')
    || findChild(node, 'string_literal')
    || findChild(node, 'interpreted_string_literal');
  return child?.text ? stripQuotes(child.text) : null;
}

function identifierText(node: SyntaxNode | undefined | null): string {
  if (!node) {
    return '';
  }
  if (node.type === 'identifier' || node.type === 'constant' || node.type === 'package_identifier' || node.type === 'module_name') {
    return node.text || '';
  }
  const child = findChild(node, 'identifier');
  return child?.text || node.text || '';
}

function findChild(node: SyntaxNode | undefined | null, type: string): SyntaxNode | undefined {
  if (!node) {
    return undefined;
  }
  return childrenOf(node).find((child) => (child as SyntaxNode).type === type) as SyntaxNode | undefined;
}

function childrenOf(node: SyntaxNode | unknown): unknown[] {
  if (!node || typeof node !== 'object' || !('children' in node)) {
    return [];
  }
  const children = (node as SyntaxNode).children;
  if (Array.isArray(children)) {
    return children;
  }
  if (children && typeof children === 'object' && Symbol.iterator in Object(children)) {
    return [...(children as Iterable<unknown>)];
  }
  return [];
}

function walk(node: SyntaxNode | null | undefined, visit: (node: SyntaxNode) => void): void {
  if (!node) {
    return;
  }
  visit(node);
  for (const child of childrenOf(node)) {
    walk(child as SyntaxNode, visit);
  }
}

function uniqueNames(names: Array<{ local: string; imported: string }>): Array<{ local: string; imported: string }> {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = `${name.local}:${name.imported}`;
    if (seen.has(key) || !name.imported) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function basename(filePath: string): string {
  const base = filePath.split('/').pop() || filePath;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

function stripQuotes(value: string): string {
  return value.replace(/^['"<]+|[>'"]+$/g, '');
}
