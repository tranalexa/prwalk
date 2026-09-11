import * as vscode from 'vscode';
import { setGitHubPAT, signInWithGitHub } from '../github/api';

export async function setGitHubPATCommand(context: vscode.ExtensionContext) {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Sign in with GitHub',
        description: 'Use your editor account',
        value: 'oauth' as const,
      },
      {
        label: 'Paste a personal access token',
        description: 'Optional fallback',
        value: 'pat' as const,
      },
    ],
    { placeHolder: 'Connect GitHub for private repos and higher rate limits' }
  );

  if (!choice) {
    return;
  }

  if (choice.value === 'oauth') {
    const signedIn = await signInWithGitHub();
    vscode.window.showInformationMessage(
      signedIn
        ? 'GitHub account connected for PR Walkthrough.'
        : 'GitHub sign-in was cancelled.'
    );
    return;
  }

  const pat = await vscode.window.showInputBox({
    prompt: 'Paste a GitHub token only if editor sign-in is unavailable',
    placeHolder: 'ghp_...',
    password: true,
    validateInput: (value) => {
      if (!value || value.trim().length < 8) {
        return 'Please enter a valid GitHub token';
      }
      return null;
    },
  });

  if (!pat) {
    return;
  }

  await setGitHubPAT(context, pat.trim());
  vscode.window.showInformationMessage('GitHub PAT saved for PR Walkthrough.');
}
