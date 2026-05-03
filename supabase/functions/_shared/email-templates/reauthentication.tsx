/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 700 as const, color: '#0A0A0A', letterSpacing: '-0.01em', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3F3F46', lineHeight: '1.6', margin: '0 0 24px' }
const codeStyle = {
  fontFamily: '"JetBrains Mono", Menlo, Courier, monospace',
  fontSize: '28px',
  fontWeight: 700 as const,
  letterSpacing: '0.15em',
  color: '#7C3AED',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '32px 0 0', lineHeight: '1.5' }
