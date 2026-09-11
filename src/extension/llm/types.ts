export interface LLMTreeSymbol {
  id: string;
  name: string;
  filePath: string;
}

export interface LLMCatalogFile {
  path: string;
  kind: 'logic' | 'test' | 'other';
  symbolIds: string[];
  sampleDiff: string;
}

export interface LLMContextFile {
  path: string;
  symbolNames: string[];
  snippet: string;
}

export interface LLMRequest {
  prMetadata: {
    title: string;
    owner: string;
    repo: string;
    prNumber: number;
  };
  treeText: string;
  entryPoints: LLMTreeSymbol[];
  leafNodes: LLMTreeSymbol[];
  edges: Array<{ from: string; to: string; fromName: string; toName: string }>;
  files: LLMCatalogFile[];
  contextFiles?: LLMContextFile[];
  userPrompt?: string;
}

export interface LLMChapterRecommendation {
  title: string;
  briefing: string;
  filePaths: string[];
  symbolIds?: string[];
}

export interface LLMResponse {
  summary: string;
  howToReview: string;
  chapters: LLMChapterRecommendation[];
}

export type LLMProvider = 'vscode' | 'openai' | 'anthropic' | 'openrouter' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  vendor?: string;
  family?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
