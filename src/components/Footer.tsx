import { Link, useLocation } from "react-router-dom";

// Routes where the footer should be hidden
const HIDDEN_ROUTES = ["/auth", "/onboarding"];

export const Footer = () => {
  const location = useLocation();
  
  // Hide footer on auth/onboarding pages (auth has its own footer)
  // Also hide on the main map view (Index "/" is full-bleed)
  if (HIDDEN_ROUTES.includes(location.pathname) || location.pathname === "/") {
    return null;
  }

  return (
    <footer 
      className="relative text-foreground border-t-0"
      role="contentinfo"
    >
      {/* Glassmorphic background layer */}
      <div 
        className="absolute inset-0 bg-card/85 backdrop-blur-2xl"
        style={{ zIndex: -1 }}
      />
      
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5"
        style={{ zIndex: -1 }}
      />
      
      {/* Top border with gradient */}
      <div 
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-5 sm:py-6" style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto', padding: '1.25rem 1rem' }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <p className="font-medium">© {new Date().getFullYear()} Jet Mobile App</p>
          <div className="flex gap-5 sm:gap-6">
            <a 
              href="mailto:creativebreakroominfo@gmail.com"
              className="hover:text-foreground transition-colors duration-200"
            >
              Contact
            </a>
            <Link 
              to="/privacy-policy" 
              className="hover:text-foreground transition-colors duration-200"
            >
              Privacy
            </Link>
            <Link 
              to="/terms-of-service" 
              className="hover:text-foreground transition-colors duration-200"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
