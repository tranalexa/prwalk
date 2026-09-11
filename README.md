# prwalk

vs code / cursor extension that turns a pr into a guided walkthrough! intended to make review of agent code easier :)

## what it does

a node.js extension host pulls the pr with [octokit](https://github.com/octokit/octokit.js), splits the diff into hunks, and maps those onto functions using github’s parser generator, [tree-sitter](https://tree-sitter.github.io/tree-sitter/). it then builds a call graph so we can topologically sort the code changes and query an llm to write chapters for a walkthrough of the pr, which is then displayed in a chromium webview.

## try it locally

```bash
npm install
npm run build
```

then in vs code / cursor: run extension (f5), open the extension development host, and access **pr walkthrough: open pr** in the command palette — paste something like `https://github.com/owner/repo/pull/123`

### first-time setup

1. **open a pr** — run `pr walkthrough: open pr` and paste a url. if you haven’t picked a model yet, the panel asks you to set one before it generates summaries.

2. **pick a model** — choose one of:
   - editor models (copilot in vscode, or cursor’s built-in lm in cursor)
   - your own api key: openai, anthropic, gemini, or openrouter
   - to change it later: `pr walkthrough: set model`

3. **github auth** — run `pr walkthrough: sign in to github` if:
   - the pr is **private** (required — anonymous access can’t read it)
   - the pr is **public but big** (recommended — github limits anonymous api use to 60 requests/hour; signed-in is 5,000. big prs fetch a lot of files and will hit that cap)

   sign in through the editor, or paste a pat with `repo` scope.

## commands

- `pr walkthrough: open pr` — paste a url, open the walkthrough panel
- `pr walkthrough: set model` — change llm provider / key
- `pr walkthrough: sign in to github` — auth for private prs


## languages

we parse a lot of languages with tree-sitter: js/ts, python, go, rust, java, ruby, php, c/c++, and more.

for js/ts, python, go, rust, java (plus scala/c#/dart), c/c++, ruby, and php, we parse imports and resolve cross-file function calls.

for other languages, you still get diffs and llm chapters. we map symbols within a file, but cross-file import resolution is not supported.
