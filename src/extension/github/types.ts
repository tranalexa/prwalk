export interface RawPRData {
  metadata: PRMetadata;
  diff: string;
  files: PRFile[];
}

export interface PRMetadata {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  baseSha: string;
  headSha: string;
}

export interface PRFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'removed';
  preContent: string | null;
  postContent: string | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  base: {
    sha: string;
    ref: string;
  };
  head: {
    sha: string;
    ref: string;
  };
  user: {
    login: string;
  };
}

export interface GitHubFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
}
