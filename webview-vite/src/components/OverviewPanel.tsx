interface OverviewPanelProps {
  summary: string;
}

function OverviewPanel({ summary }: OverviewPanelProps) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-3">
      <h3 className="sidebar-section-label mb-2 text-balance">What changed</h3>
      <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 shadow-xs">
        <p className="text-sm leading-relaxed text-pretty">{summary}</p>
      </div>
    </div>
  );
}

export default OverviewPanel;
