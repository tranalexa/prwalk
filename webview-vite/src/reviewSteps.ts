export function reviewSteps(text: string): string[] {
  const parts = text
    .split(/(?:^|\s)\d+[.)]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text.trim()];
}

export function fileLabel(path: string): string {
  return path.split('/').pop() || path;
}
