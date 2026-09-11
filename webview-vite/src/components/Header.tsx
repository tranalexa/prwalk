import { FormEvent, useState } from 'react';
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
    <header className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 text-sm font-semibold">PR Walk</h1>
        {prMetadata && (
          <span className="truncate text-xs text-muted-foreground" title={prMetadata.title}>
            {prMetadata.owner}/{prMetadata.repo}#{prMetadata.prNumber}
            <span className="ml-2 text-foreground">{prMetadata.title}</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onChangeModel && (
          <Button variant="outline" size="sm" onClick={onChangeModel} title="Change model">
            {modelLabel || 'Set model'}
          </Button>
        )}
        {prMetadata && onRegenerate && onCustomize && (
          <>
            <Button variant="outline" size="sm" onClick={() => setCustomOpen(true)}>
              Customize
            </Button>
            <Button size="sm" onClick={onRegenerate}>
              Regenerate
            </Button>
          </>
        )}
      </div>

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
