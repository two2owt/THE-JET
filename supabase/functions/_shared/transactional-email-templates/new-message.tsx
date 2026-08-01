/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { SocialEmail, type SocialEmailProps } from './social-notification.tsx'

interface NewMessageProps extends SocialEmailProps {
  senderName?: string
  preview?: string
}

const NewMessageEmail = ({ name, senderName = 'Someone', preview }: NewMessageProps) => (
  <SocialEmail
    eyebrowText="JET · Messages"
    headline={`New message from ${senderName}`}
    name={name}
    introText="You have an unread message waiting in JET."
    actorName={senderName}
    detailText={preview && preview.length > 0 ? preview : 'Open JET to read the message.'}
    ctaLabel="Read message"
    ctaUrl="/messages"
    footerText="You're receiving this because you have unread messages on JET. We only send one of these per conversation per hour. Manage email preferences in Settings → Notifications."
  />
)

export const template = {
  component: NewMessageEmail,
  subject: (data: Record<string, any>) =>
    `New message from ${data?.senderName ?? 'someone'} on JET`,
  displayName: 'New direct message',
  previewData: { name: 'Alex', senderName: 'Jordan', preview: 'Are we still on for tonight?' },
} satisfies TemplateEntry