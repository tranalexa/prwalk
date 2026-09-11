# prwalk

vs code / cursor extension that turns a pr into a guided walkthrough! intended to make review of agent code easier :)

paste a github pr url, get back a story-ordered briefing: what changed, in what order, and why it probably matters — with diffs you can click through to github.

## what it does

a node.js extension host pulls the pr with [octokit](https://github.com/octokit/octokit.js), splits the diff into hunks, and maps those onto functions using github’s parser generator, [tree-sitter](https://tree-sitter.github.io/tree-sitter/). it then builds a call graph so we can topologically sort the code changes and query an llm to write chapters for a walkthrough of the pr, which is then displayed in a chromium webview.

## try it locally

```bash
npm install
npm run build
```

then in vs code / cursor: run extension (f5), open the extension development host, and run **pr walkthrough: open pr** — paste something like `https://github.com/owner/repo/pull/123`

### first-time setup

**language model** — the extension needs something to write the chapters. on first open it’ll prompt you. options:

- your editor’s built-in models (copilot / cursor lm) if available
- or bring your own key: openai, anthropic, gemini, openrouter

command: **pr walkthrough: set model**

**github** — public prs work out of the box. for private repos, sign in or set a pat:

**pr walkthrough: sign in to github**

(scope needs `repo` for private stuff)

## commands

- `pr walkthrough: open pr` — paste a url, open the walkthrough panel
- `pr walkthrough: set model` — change llm provider / key
- `pr walkthrough: sign in to github` — auth for private prs


## languages

tree-sitter coverage is pretty wide (js/ts, python, go, rust, java, ruby, php, c/c++, and a bunch more). import/call-graph hops work best on languages where we can actually parse imports — think js/ts, python, go, rust, java, c-family. other files still get diff + llm chapters, just with less “follow the call chain” magic.
