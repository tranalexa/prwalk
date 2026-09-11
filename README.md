# PRwalk

vs code / cursor extension that turns a PR into a guided walkthrough! intended to make review of agent code easier :)

## what it does

a node.js extension host pulls the PR with [octokit](https://github.com/octokit/octokit.js), splits the diff into hunks, and maps those onto functions using github’s parser generator, [tree-sitter](https://tree-sitter.github.io/tree-sitter/). it then builds a call graph so we can topologically sort the code changes and query an llm to write chapters for a walkthrough of the PR, which is then displayed in a chromium webview.

## try it locally

```bash
npm install
npm run build
```

then in vs code / cursor: run extension (f5), open the extension development host, and access **PR walkthrough: open PR** in the command palette. paste in your PR link there

### first-time setup

1. **open a PR** — run `PR walkthrough: open PR` and paste a url. if you haven’t picked a model yet, the panel asks you to set one before it generates summaries.

2. **pick a model** — choose one of:
   - editor models (copilot in vscode, or cursor’s built-in lm in cursor)
   - your own api key: openai, anthropic, gemini, or openrouter
   - to change it later: `PR walkthrough: set model`

3. **github auth** — run `PR walkthrough: sign in to github` if:
   - the PR is **private** (required — anonymous access can’t read it)
   - the PR is **public but big** (recommended so github rate limits don't block / slow down PR access!)

   sign in through the editor, or paste a PAT with `repo` scope.

## commands

- `PR walkthrough: open PR` — paste a url, open the walkthrough panel
- `PR walkthrough: set model` — change llm provider / key
- `PR walkthrough: sign in to github` — auth for private PRs / fix rate limit issues


## languages

prwalk can parse a lot of languages with tree-sitter: js/ts, python, go, rust, java, ruby, php, c/c++, and more. for js/ts, python, go, rust, java (plus scala/c#/dart), c/c++, ruby, and php, we can parse imports and resolve cross-file function calls. for other languages, you can still get diffs and llm written summaries for sections, but cross-file import resolution is not supported.
