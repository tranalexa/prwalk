import * as vscode from 'vscode';
import { createWebviewPanel } from '../webview/panel';

export async function openPRCommand(context: vscode.ExtensionContext) {
  const url = await vscode.window.showInputBox({
    prompt: 'Enter GitHub PR URL',
    placeHolder: 'https://github.com/owner/repo/pull/123',
    validateInput: (value) => {
      if (!value.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/)) {
        return 'Please enter a valid GitHub PR URL';
      }
      return null;
    }
  });

  if (!url) {
    return; // User cancelled
  }

  try {
    await createWebviewPanel(context, url);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open PR: ${error}`);
  }
}
