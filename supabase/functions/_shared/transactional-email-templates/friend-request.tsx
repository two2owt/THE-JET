/// <reference types="npm:@types/react@18.3.1" />

import * as React from "npm:react@18.3.1";
import type { TemplateEntry } from "./registry.ts";
import { SocialEmail, type SocialEmailProps } from "./social-notification.tsx";

interface FriendRequestProps extends SocialEmailProps {
  senderName?: string;
}

const FriendRequestEmail = ({
  name,
  senderName = "Someone",
}: FriendRequestProps) => (
  <SocialEmail
    eyebrowText="JET · Crew"
    headline={`${senderName} wants to connect on JET`}
    name={name}
    introText="You have a new connection request waiting in your crew."
    actorName={senderName}
    detailText="Accept to start sharing venues, deals and plans with each other."
    ctaLabel="View request"
    ctaUrl="/social"
  />
);

export const template = {
  component: FriendRequestEmail,
  subject: (data: Record<string, any>) =>
    `${data?.senderName ?? "Someone"} wants to connect on JET`,
  displayName: "Friend request",
  previewData: { name: "Alex", senderName: "Jordan" },
} satisfies TemplateEntry;
