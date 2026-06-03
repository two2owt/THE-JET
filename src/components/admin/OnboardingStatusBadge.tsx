import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Props = {
  startedAt?: string | null;
  completedAt?: string | null;
  merchantId?: string | null;
};

export function OnboardingStatusBadge({ startedAt, completedAt, merchantId }: Props) {
  if (completedAt) {
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600/15 text-emerald-300 border-emerald-600/40 hover:bg-emerald-600/20">
        <CheckCircle2 className="w-3 h-3" />
        Onboarded · {formatDistanceToNow(new Date(completedAt), { addSuffix: true })}
      </Badge>
    );
  }
  if (startedAt) {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-300 border-amber-500/40">
        <Clock className="w-3 h-3" />
        In progress · started {formatDistanceToNow(new Date(startedAt), { addSuffix: true })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground border-border/60">
      <CircleDashed className="w-3 h-3" />
      {merchantId ? "Not started" : "No merchant linked"}
    </Badge>
  );
}

export default OnboardingStatusBadge;