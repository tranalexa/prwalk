
VS Code extension that turns a PR into a guided walkthrough! intended to make review of agent code easier :)

A Node.js extension host pulls the PR with Octokit, splits the diff into hunks, and maps those onto functions using GitHub’s parser generator, [tree-sitter](https://tree-sitter.github.io/tree-sitter/). It then builds a call graph so we can topologically sort the code changes and query an LLM to write steps for a walkthrough of the PR, which is then displayed on a Chromium webview!
