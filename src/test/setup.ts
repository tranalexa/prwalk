import Module from 'node:module';

const mockVscode = {
  lm: {
    selectChatModels: async () => [],
  },
  env: {
    appName: 'Visual Studio Code',
    openExternal: async () => true,
  },
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content }),
  },
  LanguageModelError: class LanguageModelError extends Error {
    code: string;
    constructor(message: string, code = 'Unknown') {
      super(message);
      this.code = code;
    }
  },
  CancellationTokenSource: class CancellationTokenSource {
    token = { isCancellationRequested: false };
    cancel() {}
    dispose() {}
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    showErrorMessage: async () => undefined,
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      command: '',
      show() {},
      hide() {},
      dispose() {},
    }),
    createOutputChannel: () => ({
      appendLine() {},
      show() {},
      dispose() {},
    }),
    createWebviewPanel: () => ({
      webview: {
        html: '',
        cspSource: 'https://example.invalid',
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: () => ({ dispose() {} }),
        postMessage: () => true,
      },
      onDidDispose: () => ({ dispose() {} }),
      dispose() {},
    }),
  },
  commands: {
    registerCommand: () => ({ dispose() {} }),
  },
  authentication: {
    getSession: async () => undefined,
    onDidChangeSessions: () => ({ dispose() {} }),
  },
  Uri: {
    joinPath: () => ({ fsPath: '', toString: () => '' }),
    file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    parse: (value: string) => ({ fsPath: value, toString: () => value }),
  },
  ViewColumn: { One: 1 },
};

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};
