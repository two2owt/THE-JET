/// <reference types="npm:@types/react@18.3.1" />

import * as React from "npm:react@18.3.1";
import type { TemplateEntry } from "./registry.ts";
import { SocialEmail, type SocialEmailProps } from "./social-notification.tsx";

interface NewMessageProps extends SocialEmailProps {
  senderName?: string;
  preview?: string;
  unreadCount?: number;
  conversationCount?: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const NewMessageEmail = ({
  name,
  senderName = "Someone",
  preview,
  unreadCount = 1,
  conversationCount = 1,
}: NewMessageProps) => {
  const total = Math.max(1, Number(unreadCount) || 1);
  const convos = Math.max(1, Number(conversationCount) || 1);
  const intro =
    total > 1
      ? `You have ${total} unread ${plural(total, "message", "messages")}${
          convos > 1 ? ` across ${convos} conversations` : ""
        } waiting in JET.`
      : "You have an unread message waiting in JET.";

  return (
    <SocialEmail
      eyebrowText="JET · Messages"
      headline={
        total > 1
          ? `${total} unread messages on JET`
          : `New message from ${senderName}`
      }
      name={name}
      introText={intro}
      actorName={senderName}
      detailText={
        preview && preview.length > 0
          ? preview
          : "Open JET to read the message."
      }
      ctaLabel={total > 1 ? `Read ${total} messages` : "Read message"}
      ctaUrl="/messages"
      footerText="You're receiving this because you have unread messages on JET and haven't been active recently. We only send one of these per conversation per hour. Manage email preferences in Settings → Notifications."
    />
  );
};

export const template = {
  component: NewMessageEmail,
  subject: (data: Record<string, any>) =>
    Number(data?.unreadCount) > 1
      ? `${Number(data.unreadCount)} unread messages on JET`
      : `New message from ${data?.senderName ?? "someone"} on JET`,
  displayName: "New direct message",
  previewData: {
    name: "Alex",
    senderName: "Jordan",
    preview: "Are we still on for tonight?",
    unreadCount: 3,
    conversationCount: 2,
  },
} satisfies TemplateEntry;
