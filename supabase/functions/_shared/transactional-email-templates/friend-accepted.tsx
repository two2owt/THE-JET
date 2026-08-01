/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { SocialEmail, type SocialEmailProps } from './social-notification.tsx'

interface FriendAcceptedProps extends SocialEmailProps {
  accepterName?: string
}

const FriendAcceptedEmail = ({ name, accepterName = 'Someone' }: FriendAcceptedProps) => (
  <SocialEmail
    eyebrowText="JET · Crew"
    headline={`${accepterName} accepted your request`}
    name={name}
    introText="You're now connected on JET."
    actorName={accepterName}
    detailText="Send a message or share a venue to get the plans started."
    ctaLabel="Say hello"
    ctaUrl="/messages"
  />
)

export const template = {
  component: FriendAcceptedEmail,
  subject: (data: Record<string, any>) =>
    `${data?.accepterName ?? 'Someone'} accepted your JET request`,
  displayName: 'Friend request accepted',
  previewData: { name: 'Alex', accepterName: 'Jordan' },
} satisfies TemplateEntry