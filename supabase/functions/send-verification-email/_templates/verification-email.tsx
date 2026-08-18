import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "https://esm.sh/@react-email/components@0.0.22";
import * as React from "https://esm.sh/react@18.3.1";

interface VerificationEmailProps {
  supabase_url: string;
  email_action_type: string;
  redirect_to: string;
  token_hash: string;
  token: string;
}

export const VerificationEmail = ({
  token,
  supabase_url,
  email_action_type,
  redirect_to,
  token_hash,
}: VerificationEmailProps) => {
  const verificationUrl = `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;

  return (
    <Html>
      <Head />
      <Preview>Verify your JET account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Img
              src="https://www.jet-around.com/jet-email-logo.png"
              width="80"
              height="80"
              alt="JET Logo"
              style={logo}
            />
          </Section>
          <Heading style={h1}>Welcome to JET</Heading>
          <Text style={text}>
            Thanks for signing up! We're excited to have you discover what's hot
            in your area.
          </Text>
          <Text style={text}>
            To get started, please verify your email address by clicking the
            button below:
          </Text>
          <Section style={buttonContainer}>
            <Link href={verificationUrl} target="_blank" style={button}>
              Verify Email Address
            </Link>
          </Section>
          <Text style={text}>Or copy and paste this verification code:</Text>
          <code style={code}>{token}</code>
          <Text style={subtext}>
            This verification link will expire in 24 hours. If you didn't create
            a JET account, you can safely ignore this email.
          </Text>
          <Text style={footer}>
            <Link
              href="https://www.jet-around.com"
              target="_blank"
              style={footerLink}
            >
              JET
            </Link>
            {" · Discover what's hot in your area"}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default VerificationEmail;

const main = {
  backgroundColor: "#0F172A",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
};

const container = {
  backgroundColor: "#1E293B",
  margin: "0 auto",
  padding: "40px 20px",
  borderRadius: "8px",
  maxWidth: "600px",
};

const logoSection = {
  textAlign: "center" as const,
  marginBottom: "32px",
};

const logo = {
  margin: "0 auto",
};

const h1 = {
  color: "#F1F5F9",
  fontSize: "28px",
  fontWeight: "700",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const text = {
  color: "#CBD5E1",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "16px 0",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#EF4444",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 32px",
  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
};

const code = {
  display: "inline-block",
  padding: "16px 24px",
  width: "100%",
  backgroundColor: "#334155",
  borderRadius: "8px",
  border: "1px solid #475569",
  color: "#F1F5F9",
  fontSize: "18px",
  fontWeight: "600",
  textAlign: "center" as const,
  letterSpacing: "2px",
  fontFamily: "monospace",
  boxSizing: "border-box" as const,
};

const subtext = {
  color: "#94A3B8",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "24px 0 32px",
  textAlign: "center" as const,
};

const footer = {
  color: "#64748B",
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center" as const,
  marginTop: "40px",
  paddingTop: "24px",
  borderTop: "1px solid #334155",
};

const footerLink = {
  color: "#EF4444",
  textDecoration: "none",
  fontWeight: "600",
};
