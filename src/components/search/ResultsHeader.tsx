import { memo } from "react";
import { Search as SearchIcon, X } from "lucide-react";

interface ResultsHeaderProps {
  query: string;
  totalCount: number;
  onClose: () => void;
}

function ResultsHeaderImpl({ query, totalCount, onClose }: ResultsHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-card/95 backdrop-blur-xl">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <SearchIcon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3
            className="font-bold text-sm text-foreground truncate"
            style={{ letterSpacing: "-0.01em" }}
          >
            “{query}”
          </h3>
          <p className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {totalCount} {totalCount === 1 ? "result" : "results"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search results"
        className="w-9 h-9 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export const ResultsHeader = memo(ResultsHeaderImpl);