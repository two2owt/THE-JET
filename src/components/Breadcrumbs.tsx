import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const navigate = useNavigate();

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-primary/30 bg-card/50 backdrop-blur-md">
        {items.map((item, index) => (
          <li key={item.label} className="inline-flex items-center gap-1">
            {index > 0 && (
              <ChevronRight
                className="w-3.5 h-3.5 text-muted-foreground/50"
                aria-hidden="true"
              />
            )}
            {item.href && !item.current ? (
              <button
                type="button"
                onClick={() => navigate(item.href!)}
                className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
              >
                {item.label}
              </button>
            ) : (
              <span
                className="text-xs font-semibold text-foreground"
                aria-current="page"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
