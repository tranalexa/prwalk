import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getLogChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('PR Walk');
  }
  return channel;
}

export function showLog(preserveFocus = true): void {
  getLogChannel().show(preserveFocus);
}

export function log(message: string): void {
  const line = `${timestamp()} ${message}`;
  getLogChannel().appendLine(line);
  console.log(`[prwalk] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message : error ? String(error) : '';
  log(`ERROR ${message}${detail ? `: ${detail}` : ''}`);
}

export async function timed<T>(name: string, work: () => Promise<T>, detail?: string): Promise<T> {
  const started = Date.now();
  log(`→ ${name}${detail ? ` (${detail})` : ''}`);
  try {
    return await work();
  } finally {
    log(`← ${name} ${Date.now() - started}ms`);
  }
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}
