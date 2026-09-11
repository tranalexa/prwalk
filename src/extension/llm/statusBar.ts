import * as vscode from 'vscode';
import { formatModelLabel } from './resolve';
import { resolveLLMConfig } from './secretStorage';

let statusBarItem: vscode.StatusBarItem | undefined;

export function createModelStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = 'prwalk.configureLLM';
  context.subscriptions.push(statusBarItem);
  void refreshModelStatusBar(context);
  return statusBarItem;
}

export async function refreshModelStatusBar(context: vscode.ExtensionContext): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  const resolved = await resolveLLMConfig(context);
  if (resolved.ok) {
    const label = formatModelLabel(resolved.config);
    statusBarItem.text = `$(comment-discussion) PR Walk: ${label}`;
    statusBarItem.tooltip = 'Change the model PR Walk uses for briefings';
  } else {
    statusBarItem.text = '$(comment-discussion) PR Walk: set model';
    statusBarItem.tooltip = resolved.setup.host === 'cursor'
      ? 'Cursor does not share its chat models with extensions. Click to set an API key.'
      : 'Set a language model for PR Walk';
  }
  statusBarItem.show();
}
