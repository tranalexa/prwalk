const EXTENSION_TO_GRAMMAR: Record<string, string> = {
  ada: 'ada',
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
  css: 'css',
  cu: 'cuda',
  d: 'd',
  dart: 'dart',
  dockerfile: 'dockerfile',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  fish: 'fish',
  gd: 'gdscript',
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
  rb: 'ruby',
  rs: 'rust',
  scala: 'scala',
  sc: 'scala',
  scm: 'query',
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

const JS_GRAMMARS = new Set(['javascript', 'typescript', 'tsx']);

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
