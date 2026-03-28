import { Link } from "react-router";
import { Mail, Shield, FileText } from "lucide-react";

/**
 * Inline footer for legal/info pages.
 * Rendered inside the page's own scrollable content — not as a global fixed element.
 */
export const Footer = () => {
  const footerLinks = [
    { icon: Mail, label: "Contact", href: "mailto:creativebreakroominfo@gmail.com", isExternal: true },
    { icon: Shield, label: "Privacy", to: "/privacy-policy", isExternal: false },
    { icon: FileText, label: "Terms", to: "/terms-of-service", isExternal: false },
  ];

  return (
    <footer
      className="relative"
      role="contentinfo"
      style={{
        flexShrink: 0,
        background: 'hsl(var(--background) / 0.85)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      }}
    >
      {/* Top divider */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.3), hsl(var(--primary) / 0.2))',
        }}
      />

      <div
        style={{
          maxWidth: '560px',
          margin: '0 auto',
          padding: '16px 24px',
        }}
      >
        {/* Links row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          {footerLinks.map((link) => {
            const Icon = link.icon;
            const content = (
              <span
                className="group"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'hsl(var(--muted-foreground))',
                  fontSize: '12px',
                  fontWeight: 500,
                  transition: 'color 0.2s',
                }}
              >
                <Icon
                  style={{ width: '14px', height: '14px', opacity: 0.7 }}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span>{link.label}</span>
              </span>
            );

            const className = "hover:text-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md px-2 py-1.5";

            if (link.isExternal) {
              return (
                <a key={link.label} href={link.href} className={className} aria-label={link.label}>
                  {content}
                </a>
              );
            }

            return (
              <Link key={link.label} to={link.to!} className={className} aria-label={link.label}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Copyright */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '10px',
            fontSize: '11px',
            color: 'hsl(var(--muted-foreground) / 0.6)',
            fontWeight: 400,
          }}
        >
          © {new Date().getFullYear()} Jet Mobile App
        </p>
      </div>
    </footer>
  );
};
