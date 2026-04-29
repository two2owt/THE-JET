import { LucideIcon } from "lucide-react";

interface ThemeOptionProps {
  active: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  label: string;
  description: string;
}

export const ThemeOption = ({ active, onClick, Icon, label, description }: ThemeOptionProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
    }`}
  >
    <div className="flex items-center gap-2 sm:gap-3">
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
      <div className="text-left">
        <div className="text-sm sm:text-base font-medium text-foreground">{label}</div>
        <div className="text-[10px] sm:text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
    {active && <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary flex-shrink-0" />}
  </button>
);