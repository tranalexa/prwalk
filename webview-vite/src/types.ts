export interface FileContents {
  preContent: string;
  postContent: string;
}

export interface WebviewData {
  prMetadata: {
    title: string;
    url: string;
    owner: string;
    repo: string;
    prNumber: number;
  };
  summary: string;
  howToReview: string;
  chapters: WalkthroughChapter[];
  files: Record<string, FileContents>;
  hunks: DiffHunk[];
}

export type ChapterKind = 'logic' | 'test' | 'other';

export interface WalkthroughChapter {
  id: string;
  kind: ChapterKind;
  title: string;
  briefing: string;
  filePaths: string[];
  hunkIndices: number[];
}

export type HunkChangeKind = 'logic' | 'comment' | 'test' | 'docs' | 'config';

export interface DiffHunk {
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  changeKind: HunkChangeKind;
  changes: Array<{
    type: 'add' | 'delete' | 'context';
    line: string;
    oldLineNumber: number | null;
    newLineNumber: number | null;
  }>;
}

export interface ModelSetupInfo {
  host: 'cursor' | 'vscode';
  hasEditorModels: boolean;
  currentLabel?: string;
  preferredProvider?: 'vscode' | 'openai' | 'anthropic' | 'openrouter' | 'gemini';
  defaults: {
    openrouter: { model: string; baseUrl: string };
    openai: { model: string; baseUrl: string };
    anthropic: { model: string };
    gemini: { model: string };
  };
}

export type ModelProvider = 'vscode' | 'openai' | 'anthropic' | 'openrouter' | 'gemini';

export type ExtensionToWebviewMessage =
  | { type: 'init'; data: WebviewData; modelLabel?: string }
  | { type: 'error'; error: string }
  | { type: 'loading'; progress: number; stage?: string }
  | { type: 'regenerated'; data: WebviewData; modelLabel?: string }
  | { type: 'needsModel'; setup: ModelSetupInfo; error?: string };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestPR'; url: string }
  | { type: 'stepSelected'; stepId: string }
  | { type: 'regenerate' }
  | { type: 'customize'; userPrompt: string }
  | { type: 'configureModel' }
  | { type: 'openUrl'; url: string }
  | {
      type: 'saveModel';
      provider: ModelProvider;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };
