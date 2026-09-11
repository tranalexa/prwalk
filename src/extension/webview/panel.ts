import * as vscode from 'vscode';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './messaging';
import { processPR } from '../orchestration';
import { WalkthroughCache } from '../storage/cache';
import { NeedsModelError } from '../llm/resolve';
import { configFromWebview, resolveLLMConfig, setLLMConfig } from '../llm/secretStorage';
import { refreshModelStatusBar } from '../llm/statusBar';
import { log, showLog } from '../log';

let currentPanel: vscode.WebviewPanel | undefined;
let currentPrUrl: string | undefined;
let currentCache: WalkthroughCache | undefined;
let currentContext: vscode.ExtensionContext | undefined;

export async function createWebviewPanel(context: vscode.ExtensionContext, prUrl: string) {
  if (currentPanel) {
    currentPanel.dispose();
  }

  currentContext = context;
  currentPrUrl = prUrl;
  currentCache = new WalkthroughCache(context);

  currentPanel = vscode.window.createWebviewPanel(
    'prwalk.walkthrough',
    'PR Walkthrough',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        vscode.Uri.joinPath(context.extensionUri, 'webview-dist')
      ]
    }
  );

  currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri);

  currentPanel.webview.onDidReceiveMessage(
    async (message) => {
      await handleMessage(message);
    },
    undefined,
    context.subscriptions
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    currentPrUrl = undefined;
    currentCache = undefined;
    currentContext = undefined;
  });
}

export async function showModelSetupInPanel(): Promise<boolean> {
  if (!currentPanel || !currentContext) {
    return false;
  }
  await sendModelSetup();
  currentPanel.reveal(vscode.ViewColumn.One);
  return true;
}

async function handleMessage(message: WebviewToExtensionMessage) {
  if (!currentPanel || !currentContext || !currentCache || !currentPrUrl) {
    return;
  }

  switch (message.type) {
    case 'ready':
      await runWalkthrough(currentPrUrl, false);
      break;

    case 'requestPR':
      currentPrUrl = message.url;
      await runWalkthrough(message.url, false);
      break;

    case 'stepSelected':
      console.log('Step selected:', message.stepId);
      break;

    case 'regenerate':
      await runWalkthrough(currentPrUrl, true);
      break;

    case 'customize':
      await runWalkthrough(currentPrUrl, true, message.userPrompt);
      break;

    case 'configureModel':
      await sendModelSetup();
      break;

    case 'saveModel': {
      const config = configFromWebview(message);
      if (config.provider !== 'vscode' && !config.apiKey) {
        const resolved = await resolveLLMConfig(currentContext);
        sendMessage({
          type: 'needsModel',
          setup: resolved.setup,
          error: 'Paste an API key to continue.',
        });
        return;
      }
      await setLLMConfig(currentContext, config);
      await refreshModelStatusBar(currentContext);
      await runWalkthrough(currentPrUrl, false);
      break;
    }

    case 'openUrl':
      await vscode.env.openExternal(vscode.Uri.parse(message.url));
      break;
  }
}

async function runWalkthrough(prUrl: string, forceRefresh: boolean, userPrompt?: string) {
  if (!currentPanel || !currentContext || !currentCache) {
    return;
  }

  sendLoading(0, 'Starting…');
  showLog();
  log(`Open ${prUrl}${forceRefresh ? ' (refresh)' : ''}`);

  try {
    if (!forceRefresh) {
      const cached = await currentCache.get(prUrl);
      if (cached) {
        log('Cache hit');
        const resolved = await resolveLLMConfig(currentContext);
        sendMessage({
          type: 'init',
          data: cached,
          modelLabel: resolved.ok ? resolved.setup.currentLabel : undefined,
        });
        return;
      }
    } else {
      await currentCache.delete(prUrl);
    }

    const resolved = await resolveLLMConfig(currentContext);
    await refreshModelStatusBar(currentContext);
    if (!resolved.ok) {
      sendMessage({ type: 'needsModel', setup: resolved.setup });
      return;
    }

    const data = await processPR(currentContext, prUrl, userPrompt, (update) => {
      sendLoading(update.progress, update.stage);
    });
    await currentCache.set(prUrl, data);
    sendMessage({
      type: forceRefresh ? 'regenerated' : 'init',
      data,
      modelLabel: resolved.setup.currentLabel,
    });
  } catch (error) {
    if (error instanceof NeedsModelError) {
      sendMessage({ type: 'needsModel', setup: error.setup });
      return;
    }
    log(`Walkthrough failed: ${error}`);
    sendMessage({ type: 'error', error: String(error) });
  }
}

async function sendModelSetup() {
  if (!currentPanel || !currentContext) {
    return;
  }
  const resolved = await resolveLLMConfig(currentContext);
  sendMessage({ type: 'needsModel', setup: resolved.setup });
}

function sendMessage(message: ExtensionToWebviewMessage) {
  currentPanel?.webview.postMessage(message);
}

function sendLoading(progress: number, stage?: string) {
  sendMessage({ type: 'loading', progress, stage });
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview-dist', 'assets', 'index.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview-dist', 'assets', 'index.css')
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${styleUri}">
      <title>PR Walkthrough</title>
    </head>
    <body>
      <div id="root">Loading PR Walkthrough...</div>
      <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
