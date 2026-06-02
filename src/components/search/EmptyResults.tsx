import { Search as SearchIcon } from "lucide-react";

export function EmptyResults() {
  return (
    <div className="text-center py-10">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
        <SearchIcon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No results found</p>
      <p className="text-xs text-muted-foreground mt-1">
        Try a venue name, category, or deal type
      </p>
    </div>
  );
}