import { createFileRoute } from "@tanstack/react-router";
import VerificationSuccess from "@/pages/VerificationSuccess";

export const Route = createFileRoute("/verification-success")({
  component: VerificationSuccess,
});