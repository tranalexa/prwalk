import { FormEvent, useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface HeaderProps {
  prMetadata: {
    title: string;
    url: string;
    owner: string;
    repo: string;
    prNumber: number;
  } | null;
  modelLabel?: string;
  onRegenerate?: () => void;
  onCustomize?: (userPrompt: string) => void;
  onChangeModel?: () => void;
}

function Header({ prMetadata, modelLabel, onRegenerate, onCustomize, onChangeModel }: HeaderProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

  const submitCustomize = (event: FormEvent) => {
    event.preventDefault();
    const userPrompt = customText.trim();
    if (userPrompt && onCustomize) {
      onCustomize(userPrompt);
    }
    setCustomOpen(false);
    setCustomText('');
  };

  return (
    <header className="border-b border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-balance">
          <GitPullRequest className="size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
          PR Walk
        </h1>
        <div className="flex shrink-0 items-center gap-1.5">
          {onChangeModel && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onChangeModel} title="Change model">
              {modelLabel || 'Set model'}
            </Button>
          )}
          {prMetadata && onRegenerate && onCustomize && (
            <>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCustomOpen(true)}>
                Customize
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={onRegenerate}>
                Regenerate
              </Button>
            </>
          )}
        </div>
      </div>
      {prMetadata && (
        <p className="mt-1 truncate text-[11px] leading-snug text-muted-foreground" title={prMetadata.title}>
          <span className="text-foreground/90">
            {prMetadata.owner}/{prMetadata.repo}#
            <span className="tabular-nums">{prMetadata.prNumber}</span>
          </span>
          <span className="mx-1.5 opacity-40">·</span>
          <span>{prMetadata.title}</span>
        </p>
      )}

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <form onSubmit={submitCustomize} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Customize walkthrough</DialogTitle>
              <DialogDescription>What should this pass focus on?</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="customize-prompt">Focus</Label>
              <Textarea
                id="customize-prompt"
                value={customText}
                rows={4}
                placeholder="Focus on error handling"
                onChange={(event) => setCustomText(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Regenerate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}

export default Header;
