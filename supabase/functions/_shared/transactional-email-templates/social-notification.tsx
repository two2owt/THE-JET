/// <reference types="npm:@types/react@18.3.1" />

import * as React from "npm:react@18.3.1";
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
} from "npm:@react-email/components@0.0.22";

const SITE_NAME = "JET";
export const SITE_URL = "https://www.jet-around.com";

export interface SocialEmailProps {
  eyebrowText?: string;
  headline?: string;
  name?: string;
  introText?: string;
  actorName?: string;
  detailText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerText?: string;
}

export const SocialEmail = ({
  eyebrowText = `${SITE_NAME} · Crew`,
  headline = "You have an update",
  name,
  introText,
  actorName,
  detailText,
  ctaLabel = `Open ${SITE_NAME}`,
  ctaUrl = "/social",
  footerText,
}: SocialEmailProps) => {
  const url = ctaUrl.startsWith("http") ? ctaUrl : `${SITE_URL}${ctaUrl}`;
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{eyebrowText}</Text>
          <Heading style={h1}>{headline}</Heading>
          {introText ? (
            <Text style={text}>
              {name ? `Hi ${name}, ` : ""}
              {introText}
            </Text>
          ) : null}
          {actorName || detailText ? (
            <Section style={card}>
              {actorName ? <Text style={actorLabel}>{actorName}</Text> : null}
              {detailText ? <Text style={detail}>{detailText}</Text> : null}
            </Section>
          ) : null}
          <Section style={{ margin: "8px 0 24px" }}>
            <Button style={button} href={url}>
              {ctaLabel}
            </Button>
          </Section>
          <Text style={footer}>
            {footerText ??
              `You're receiving this because of activity on your ${SITE_NAME} account. Manage email preferences in Settings → Notifications.`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};
const container = { padding: "32px 28px", maxWidth: "560px" };
const eyebrow = {
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#C9A961",
  fontWeight: 600 as const,
  margin: "0 0 8px",
};
const h1 = {
  fontSize: "24px",
  fontWeight: 700 as const,
  color: "#0A0A0A",
  letterSpacing: "-0.01em",
  margin: "0 0 12px",
};
const text = {
  fontSize: "15px",
  color: "#3F3F46",
  lineHeight: "1.6",
  margin: "0 0 20px",
};
const card = {
  background: "#F8F7F4",
  borderRadius: "14px",
  padding: "20px 22px",
  border: "1px solid #EAE7E0",
  margin: "0 0 24px",
};
const actorLabel = {
  fontSize: "18px",
  color: "#0A0A0A",
  fontWeight: 700 as const,
  margin: "0 0 6px",
  lineHeight: "1.3",
};
const detail = {
  fontSize: "14px",
  color: "#52525B",
  lineHeight: "1.55",
  margin: 0,
};
const button = {
  background: "linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)",
  backgroundColor: "#E11D48",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600 as const,
  borderRadius: "12px",
  padding: "14px 24px",
  textDecoration: "none",
};
const footer = {
  fontSize: "12px",
  color: "#9CA3AF",
  margin: "24px 0 0",
  lineHeight: "1.5",
};
