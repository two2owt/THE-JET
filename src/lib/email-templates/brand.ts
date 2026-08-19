// Shared JET brand styling for auth emails.
// Email clients require inline styles; Body background stays white for
// deliverability even though the app itself is dark-only.
const FONT_STACK =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif"

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: FONT_STACK,
  padding: '0',
  margin: '0',
}

export const container = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '32px 28px 36px',
  backgroundColor: '#ffffff',
  border: '1px solid #ece9f1',
  borderRadius: '18px',
}

export const brandBar = {
  height: '4px',
  width: '72px',
  borderRadius: '999px',
  backgroundImage: 'linear-gradient(135deg, #ff5500, #e63aa4)',
  backgroundColor: '#ff5500',
  margin: '0 0 22px',
}

export const brandName = {
  fontFamily: "'Syne', 'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
  fontSize: '15px',
  fontWeight: 700 as const,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: '#0a0a0a',
  margin: '0 0 6px',
}

export const h1 = {
  fontFamily: "'Syne', 'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#0a0a0a',
  lineHeight: '1.25',
  margin: '0 0 18px',
}

export const text = {
  fontSize: '15px',
  color: '#4b4a52',
  lineHeight: '1.6',
  margin: '0 0 20px',
}

export const link = { color: '#d94b00', textDecoration: 'underline' }

export const button = {
  display: 'inline-block',
  backgroundImage: 'linear-gradient(135deg, #ff5500, #e63aa4)',
  backgroundColor: '#ff5500',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '999px',
  padding: '14px 28px',
  textDecoration: 'none',
}

export const codeStyle = {
  fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
  fontSize: '30px',
  fontWeight: 700 as const,
  letterSpacing: '0.28em',
  color: '#0a0a0a',
  backgroundColor: '#faf7f2',
  border: '1px solid #C9A961',
  borderRadius: '12px',
  padding: '16px 20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}

export const footer = {
  fontSize: '12px',
  color: '#9a98a3',
  lineHeight: '1.6',
  margin: '32px 0 0',
  borderTop: '1px solid #f0eef4',
  paddingTop: '16px',
}
