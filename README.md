
VS code extension that turns a PR into a guided walkthrough! intended to make review of agent code easier :)

a node.js extension host pulls the PR with octokit, splits the diff into hunks, and maps those onto functions using github’s parser generator, [tree-sitter](https://tree-sitter.github.io/tree-sitter/). it then builds a call graph so we can topologically sort the code changes and query an LLM to write steps for a walkthrough of the PR, which is then displayed on a chromium webview!
