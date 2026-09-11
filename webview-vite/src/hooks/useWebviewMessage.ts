import { useState, useEffect, useCallback } from 'react';
import { getVsCodeApi } from '../vscodeApi';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types';

let didNotifyReady = false;

export function useWebviewMessage() {
  const [message, setMessage] = useState<ExtensionToWebviewMessage | null>(null);

  useEffect(() => {
    const vscode = getVsCodeApi();
    if (!vscode) {
      console.warn('Not in VS Code webview context');
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      setMessage(event.data as ExtensionToWebviewMessage);
    };

    window.addEventListener('message', handleMessage);

    if (!didNotifyReady) {
      didNotifyReady = true;
      vscode.postMessage({ type: 'ready' } as WebviewToExtensionMessage);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const sendMessage = useCallback((message: WebviewToExtensionMessage) => {
    const vscode = getVsCodeApi();
    if (!vscode) {
      console.warn('Not in VS Code webview context');
      return;
    }

    vscode.postMessage(message);
  }, []);

  return { message, sendMessage };
}

export function sendMessage(message: WebviewToExtensionMessage) {
  const vscode = getVsCodeApi();
  if (!vscode) {
    console.warn('Not in VS Code webview context');
    return;
  }

  vscode.postMessage(message);
}
