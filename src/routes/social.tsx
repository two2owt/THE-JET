import { createFileRoute } from "@tanstack/react-router";
import Social from "@/pages/Social";

export const Route = createFileRoute("/social")({
  component: Social,
});