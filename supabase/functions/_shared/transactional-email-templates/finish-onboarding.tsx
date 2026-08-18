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
import type { TemplateEntry } from "./registry.ts";

const SITE_NAME = "JET";
const SITE_URL = "https://www.jet-around.com";

interface FinishOnboardingProps {
  name?: string;
  /** 1 = first nudge, 2 = final nudge — changes the tone only. */
  attempt?: number;
}

const FinishOnboardingEmail = ({
  name,
  attempt = 1,
}: FinishOnboardingProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're one step away from your live {SITE_NAME} map</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name}, your map is waiting` : "Your map is waiting"}
        </Heading>
        <Text style={text}>
          {attempt > 1
            ? `Still haven't finished setting up? It takes about 30 seconds, and it's what turns ${SITE_NAME} from a map into your map.`
            : `Your ${SITE_NAME} account is verified — you just haven't finished setting up your profile yet.`}
        </Text>
        <Section style={{ margin: "8px 0 28px" }}>
          <Text style={listItem}>
            🍸 Pick the food, drinks, nightlife and events you actually care
            about
          </Text>
          <Text style={listItem}>
            📍 Get alerts when deals go live near you
          </Text>
          <Text style={listItem}>
            👯 Show up on your crew's map and meet them out
          </Text>
        </Section>
        <Button style={button} href={`${SITE_URL}/onboarding`}>
          Finish my profile
        </Button>
        <Text style={footer}>
          Already done? Ignore this — you're all set. Questions? Just reply and
          a real human will get back to you.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: FinishOnboardingEmail,
  subject: `Finish setting up your ${SITE_NAME} profile`,
  displayName: "Finish onboarding nudge",
  previewData: { name: "Alex", attempt: 1 },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};
const container = { padding: "32px 28px", maxWidth: "560px" };
const h1 = {
  fontSize: "26px",
  fontWeight: 700 as const,
  color: "#0A0A0A",
  letterSpacing: "-0.01em",
  margin: "0 0 16px",
};
const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
  margin: "0 0 16px",
};
const listItem = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#333333",
  margin: "0 0 8px",
};
const button = {
  backgroundColor: "#C9A961",
  color: "#0A0A0A",
  fontSize: "15px",
  fontWeight: 700 as const,
  borderRadius: "10px",
  padding: "13px 24px",
  textDecoration: "none",
  display: "inline-block",
};
const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#777777",
  margin: "28px 0 0",
};
