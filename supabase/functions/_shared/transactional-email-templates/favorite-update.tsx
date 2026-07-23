/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'JET'
const SITE_URL = 'https://www.jet-around.com'

type EventType = 'activated' | 'updated' | 'ending_soon'

interface FavoriteUpdateProps {
  name?: string
  venueName?: string
  dealTitle?: string
  eventType?: EventType
  ctaUrl?: string
  expiresAt?: string | null
  bodyText?: string
}

const headlineFor = (event: EventType, venue: string, deal: string) => {
  switch (event) {
    case 'activated':
      return `${venue} just dropped a deal you saved`
    case 'updated':
      return `${venue} updated a deal you saved`
    case 'ending_soon':
      return `${deal} is ending soon at ${venue}`
  }
}

const FavoriteUpdateEmail = ({
  name,
  venueName = 'A venue you saved',
  dealTitle = 'A deal you saved',
  eventType = 'updated',
  ctaUrl,
  expiresAt,
  bodyText,
}: FavoriteUpdateProps) => {
  const headline = headlineFor(eventType, venueName, dealTitle)
  const url = ctaUrl && ctaUrl.startsWith('http') ? ctaUrl : `${SITE_URL}${ctaUrl ?? '/favorites'}`

  let contextLine = bodyText ?? `${dealTitle} — tap below to see the details.`
  if (!bodyText && eventType === 'ending_soon' && expiresAt) {
    const mins = Math.max(
      0,
      Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000),
    )
    if (mins > 0 && mins < 180) contextLine = `${dealTitle} ends in ${mins} minutes.`
  }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME} · Favorites</Text>
          <Heading style={h1}>{headline}</Heading>
          <Text style={text}>
            {name ? `Hi ${name}, ` : ''}a spot on your favorites list just posted an update.
          </Text>
          <Section style={card}>
            <Text style={venueLabel}>{venueName}</Text>
            <Text style={dealLabel}>{dealTitle}</Text>
            <Text style={contextText}>{contextLine}</Text>
          </Section>
          <Section style={{ margin: '8px 0 24px' }}>
            <Button style={button} href={url}>
              View on {SITE_NAME}
            </Button>
          </Section>
          <Text style={footer}>
            You're receiving this because you favorited this venue or deal in {SITE_NAME}.
            Manage email preferences in Settings → Notifications.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: FavoriteUpdateEmail,
  subject: (data: Record<string, any>) => {
    const venue = data?.venueName ?? 'A venue you saved'
    const deal = data?.dealTitle ?? 'A deal you saved'
    switch (data?.eventType as EventType) {
      case 'activated':
        return `${venue} just dropped a deal you saved`
      case 'ending_soon':
        return `${deal} is ending soon`
      case 'updated':
      default:
        return `${venue} updated a deal you saved`
    }
  },
  displayName: 'Favorite venue/deal update',
  previewData: {
    name: 'Alex',
    venueName: 'Must Be Nice',
    dealTitle: 'Half-off espresso martinis',
    eventType: 'activated',
    ctaUrl: '/favorites',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const eyebrow = {
  fontSize: '12px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#C9A961',
  fontWeight: 600 as const,
  margin: '0 0 8px',
}
const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#0A0A0A',
  letterSpacing: '-0.01em',
  margin: '0 0 12px',
}
const text = {
  fontSize: '15px',
  color: '#3F3F46',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const card = {
  background: '#F8F7F4',
  borderRadius: '14px',
  padding: '20px 22px',
  border: '1px solid #EAE7E0',
  margin: '0 0 24px',
}
const venueLabel = {
  fontSize: '13px',
  color: '#7C3AED',
  fontWeight: 600 as const,
  letterSpacing: '0.02em',
  margin: '0 0 4px',
}
const dealLabel = {
  fontSize: '18px',
  color: '#0A0A0A',
  fontWeight: 700 as const,
  margin: '0 0 8px',
  lineHeight: '1.3',
}
const contextText = {
  fontSize: '14px',
  color: '#52525B',
  lineHeight: '1.5',
  margin: 0,
}
const button = {
  background: 'linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)',
  backgroundColor: '#E11D48',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
}
const footer = {
  fontSize: '12px',
  color: '#9CA3AF',
  margin: '24px 0 0',
  lineHeight: '1.5',
}