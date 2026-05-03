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

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your Charlotte nightlife passport</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Welcome aboard, ${name}` : 'Welcome aboard'}
        </Heading>
        <Text style={text}>
          You're in. {SITE_NAME} is your live map of Charlotte's best food,
          drinks, nightlife and events — with exclusive deals from venues we love.
        </Text>
        <Section style={{ margin: '8px 0 28px' }}>
          <Text style={listItem}>🗺️ Tap the map to see what's hot near you right now</Text>
          <Text style={listItem}>🔥 Save deals you love — they're claimable in one tap</Text>
          <Text style={listItem}>👯 Add your crew and meet up where the night's already moving</Text>
        </Section>
        <Button style={button} href={SITE_URL}>
          Open {SITE_NAME}
        </Button>
        <Text style={footer}>
          Questions? Just reply to this email — a real human will get back to you.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: `Welcome to ${SITE_NAME}`,
  displayName: 'Welcome email',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '26px',
  fontWeight: 700 as const,
  color: '#0A0A0A',
  letterSpacing: '-0.01em',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#3F3F46',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const listItem = {
  fontSize: '15px',
  color: '#3F3F46',
  lineHeight: '1.6',
  margin: '0 0 8px',
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
  margin: '32px 0 0',
  lineHeight: '1.5',
}