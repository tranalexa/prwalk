import { ArrowUpRight } from 'lucide-react';
import { cn } from 'cn';
import { MouseEvent, ReactNode } from 'react';

interface GitHubLinkProps {
  href: string;
  onOpen: (url: string) => void;
  children: ReactNode;
  className?: string;
}

function GitHubLink({ href, onOpen, children, className }: GitHubLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'github-pr-link inline-flex max-w-full items-center gap-0.5 rounded-sm',
        'no-underline hover:underline',
        className
      )}
      title="Open on GitHub"
    >
      <span className="min-w-0 truncate">{children}</span>
      <ArrowUpRight
        className="github-pr-link-icon size-3 shrink-0 opacity-60 transition-opacity duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </a>
  );
}

export default GitHubLink;
