import { WebviewData } from './types';

export const demoData: WebviewData = {
  prMetadata: {
    title: 'Add walkthrough chapters',
    url: 'https://github.com/example/prwalk/pull/1',
    owner: 'example',
    repo: 'prwalk',
    prNumber: 1,
  },
  summary: 'The PR adds chapter grouping so leftover files no longer dump into one catch-all step.',
  howToReview: '1. Check that logic files land in story chapters. 2. Confirm tests are their own step.',
  chapters: [
    {
      id: '1',
      kind: 'logic',
      title: 'Group leftover files',
      briefing: 'Chapters now claim files from the diff instead of listing leftovers.',
      filePaths: ['src/extension/algorithm/chapters.ts'],
      hunkIndices: [0],
    },
    {
      id: '2',
      kind: 'test',
      title: 'Cover chapter kinds',
      briefing: 'Tests assert Python test files are tagged as tests.',
      filePaths: ['src/test/diffParser.test.ts'],
      hunkIndices: [1],
    },
  ],
  files: {},
  hunks: [
    {
      filePath: 'src/extension/algorithm/chapters.ts',
      oldStart: 10,
      oldLines: 4,
      newStart: 10,
      newLines: 6,
      content: '@@ -10,4 +10,6 @@\n function build() {\n-  return leftovers;\n+  return claimed;\n }',
      changeKind: 'logic',
      changes: [],
    },
    {
      filePath: 'src/test/diffParser.test.ts',
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 3,
      content: '@@ -1,2 +1,3 @@\n+test("python tests", () => {});\n',
      changeKind: 'test',
      changes: [],
    },
  ],
};
