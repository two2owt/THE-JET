import { Link, useLocation } from "react-router";
import { Mail, Shield, FileText } from "lucide-react";

// Routes where the footer should be hidden (pages with BottomNav or special layouts)
const HIDDEN_ROUTES = ["/auth", "/onboarding", "/social", "/messages", "/favorites", "/settings", "/profile"];

export const Footer = () => {
  const location = useLocation();
  
  // Hide footer on auth/onboarding pages (auth has its own footer)
  // Also hide on the main map view (Index "/" is full-bleed)
  if (HIDDEN_ROUTES.includes(location.pathname) || location.pathname === "/") {
    return null;
  }

  const footerLinks = [
    {
      icon: Mail,
      label: "Contact",
      href: "mailto:creativebreakroominfo@gmail.com",
      isExternal: true,
    },
    {
      icon: Shield,
      label: "Privacy",
      to: "/privacy-policy",
      isExternal: false,
    },
    {
      icon: FileText,
      label: "Terms",
      to: "/terms-of-service",
      isExternal: false,
    },
  ];

  return (
    <footer 
      className="relative text-foreground border-t-0"
      role="contentinfo"
      style={{
        position: 'relative',
        color: 'hsl(var(--foreground))',
      }}
    >
      {/* Glassmorphic background layer */}
      <div 
        className="absolute inset-0 bg-card/80 backdrop-blur-2xl saturate-150"
        style={{ zIndex: -1 }}
      />
      
      {/* Brand gradient overlay for depth */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-primary/8 via-transparent to-accent/8"
        style={{ zIndex: -1 }}
      />
      
      {/* Top border with brand gradient */}
      <div 
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary/30 via-accent/40 to-primary/30"
      />

      <div
        className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-5 sm:py-6"
        style={{
          maxWidth: '56rem',
          marginLeft: 'auto',
          marginRight: 'auto',
          padding: '1.25rem 1rem',
          boxSizing: 'border-box',
        }}
      >
        {/* Top row: equally spaced icon links */}
      <div
          className="flex items-center justify-around gap-4 sm:gap-6"
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            justifyContent: 'space-around',
            gap: '1rem',
            width: '100%',
          }}
        >
          {footerLinks.map((link) => {
            const Icon = link.icon;
            const content = (
              <span
                className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.25rem',
                  minWidth: 'clamp(52px, 14vw, 72px)',
                }}
              >
                <Icon
                  className="w-5 h-5 sm:w-[22px] sm:h-[22px] group-hover:scale-110 transition-transform duration-200"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">
                  {link.label}
                </span>
              </span>
            );

            if (link.isExternal) {
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg px-2 py-1 min-h-[44px] flex items-center"
                  aria-label={link.label}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={link.label}
                to={link.to!}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg px-2 py-1 min-h-[44px] flex items-center"
                aria-label={link.label}
              >
                {content}
              </Link>
            );
          })}
        </div>

        {/* Bottom row: copyright */}
        <p
          className="text-center text-xs text-muted-foreground mt-3 sm:mt-4 font-medium"
          style={{
            textAlign: 'center',
            marginTop: '0.75rem',
            fontSize: '0.75rem',
          }}
        >
          © {new Date().getFullYear()} Jet Mobile App
        </p>
      </div>
    </footer>
  );
};
