import * as vscode from 'vscode';
import { openPRCommand } from './extension/commands/openPR';
import { setGitHubPATCommand } from './extension/commands/setGitHubPAT';
import { watchGitHubSessions } from './extension/github/api';
import { createModelStatusBar } from './extension/llm/statusBar';
import { initializeTreeSitter } from './extension/parser/treeSitter';
import { showModelSetupInPanel } from './extension/webview/panel';
import { getLogChannel } from './extension/log';

export function activate(context: vscode.ExtensionContext) {
  console.log('PR Walkthrough extension is now active');

  createModelStatusBar(context);

  initializeTreeSitter(context).catch(error => {
    console.error('Failed to initialize tree-sitter:', error);
  });

  context.subscriptions.push(
    getLogChannel(),
    watchGitHubSessions(),
    vscode.commands.registerCommand('prwalk.openPR', () => {
      openPRCommand(context);
    }),
    vscode.commands.registerCommand('prwalk.setGitHubPAT', () => {
      setGitHubPATCommand(context);
    }),
    vscode.commands.registerCommand('prwalk.configureLLM', async () => {
      if (await showModelSetupInPanel()) {
        return;
      }
      vscode.window.showInformationMessage('Open a PR first, then set a model in the walkthrough panel.');
    })
  );
}

export function deactivate() {
  console.log('PR Walkthrough extension is now deactivated');
}
