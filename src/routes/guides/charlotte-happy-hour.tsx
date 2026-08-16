import { createFileRoute } from "@tanstack/react-router";
import CharlotteHappyHour from "@/pages/guides/CharlotteHappyHour";

export const Route = createFileRoute("/guides/charlotte-happy-hour")({
  component: CharlotteHappyHour,
});