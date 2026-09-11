const EXTENSION_TO_GRAMMAR: Record<string, string> = {
  ada: 'ada',
  ino: 'arduino',
  bib: 'bibtex',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'c_sharp',
  clj: 'clojure',
  cljs: 'clojure',
  cmake: 'cmake',
  lisp: 'commonlisp',
  lsp: 'commonlisp',
  cl: 'commonlisp',
  css: 'css',
  cu: 'cuda',
  d: 'd',
  dart: 'dart',
  dockerfile: 'dockerfile',
  el: 'elisp',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  fish: 'fish',
  gd: 'gdscript',
  gdshader: 'gdshader',
  gleam: 'gleam',
  go: 'go',
  groovy: 'groovy',
  hs: 'haskell',
  html: 'html',
  htm: 'html',
  java: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jl: 'julia',
  kt: 'kotlin',
  kts: 'kotlin',
  lua: 'lua',
  md: 'markdown_inline',
  mdx: 'markdown_inline',
  nix: 'nix',
  m: 'objc',
  mm: 'objc',
  ml: 'ocaml',
  mli: 'ocaml_interface',
  pl: 'perl',
  pm: 'perl',
  php: 'php',
  py: 'python',
  pyi: 'python',
  r: 'r',
  rkt: 'racket',
  rktd: 'racket',
  rb: 'ruby',
  rs: 'rust',
  scala: 'scala',
  sc: 'scala',
  scm: 'query',
  sln: 'sln',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sol: 'solidity',
  svelte: 'svelte',
  swift: 'swift',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml',
  zig: 'zig',
};

const JS_GRAMMARS = new Set(['javascript', 'typescript', 'tsx', 'svelte']);
const DIRECTORY_PACKAGE_GRAMMARS = new Set(['go']);

export type HopFamily =
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'jvm'
  | 'c'
  | 'ruby'
  | 'php'
  | 'lua'
  | 'elixir'
  | 'gleam'
  | 'ocaml'
  | 'none';

/** Typescript/TSX tags.scm only add TS-specific nodes; they inherit JS tags. */
export const TAG_INHERITS: Record<string, string[]> = {
  typescript: ['javascript'],
  tsx: ['javascript'],
};

export function grammarFromPath(filePath: string): string | undefined {
  const base = filePath.split('/').pop() || filePath;
  const lower = base.toLowerCase();
  if (lower === 'dockerfile') {
    return 'dockerfile';
  }
  if (lower === 'cmakelists.txt') {
    return 'cmake';
  }

  const dot = lower.lastIndexOf('.');
  if (dot <= 0 || dot === lower.length - 1) {
    return undefined;
  }
  return EXTENSION_TO_GRAMMAR[lower.slice(dot + 1)];
}

export function isJavaScriptFamily(filePath: string): boolean {
  const grammar = grammarFromPath(filePath);
  return grammar !== undefined && JS_GRAMMARS.has(grammar);
}

export function isDirectoryPackage(filePath: string): boolean {
  const grammar = grammarFromPath(filePath);
  return grammar !== undefined && DIRECTORY_PACKAGE_GRAMMARS.has(grammar);
}

export function hopFamily(filePath: string): HopFamily {
  const grammar = grammarFromPath(filePath);
  switch (grammar) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
    case 'svelte':
      return 'javascript';
    case 'python':
      return 'python';
    case 'go':
      return 'go';
    case 'rust':
      return 'rust';
    case 'java':
    case 'scala':
    case 'c_sharp':
    case 'dart':
      return 'jvm';
    case 'c':
    case 'cpp':
    case 'arduino':
      return 'c';
    case 'ruby':
      return 'ruby';
    case 'php':
    case 'php_only':
      return 'php';
    case 'lua':
      return 'lua';
    case 'elixir':
      return 'elixir';
    case 'gleam':
      return 'gleam';
    case 'ocaml':
    case 'ocaml_interface':
      return 'ocaml';
    default:
      return 'none';
  }
}

export function hopExtensions(filePath: string): string[] {
  switch (hopFamily(filePath)) {
    case 'javascript':
      return ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
    case 'python':
      return ['.py', '.pyi'];
    case 'go':
      return ['.go'];
    case 'rust':
      return ['.rs'];
    case 'jvm':
      return ['.java', '.scala', '.sc', '.cs', '.dart'];
    case 'c':
      return ['.h', '.c', '.hh', '.hpp', '.cc', '.cpp', '.cxx', '.ino'];
    case 'ruby':
      return ['.rb'];
    case 'php':
      return ['.php'];
    case 'lua':
      return ['.lua'];
    case 'elixir':
      return ['.ex', '.exs'];
    case 'gleam':
      return ['.gleam'];
    case 'ocaml':
      return ['.ml', '.mli'];
    default: {
      const grammar = grammarFromPath(filePath);
      return grammar ? [`.${filePath.split('.').pop()}`] : [];
    }
  }
}
