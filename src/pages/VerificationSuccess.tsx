import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerificationSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Defensive: strip any query params (e.g. ?mode=signup) so that
    // navigating back to /auth never re-triggers a signup submission.
    if (location.search || location.hash) {
      window.history.replaceState({}, "", "/verification-success");
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/auth?mode=signin", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, location.search, location.hash]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ring-2 ring-primary/30 shadow-glow">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Email Verified!
          </h1>
          <p className="text-muted-foreground">
            Welcome to JET! Your email has been successfully verified.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-card/90 backdrop-blur-sm border border-primary/20 shadow-card">
          <p className="text-sm text-muted-foreground">
            Redirecting to sign in page in <span className="font-bold text-primary">{countdown}</span> seconds...
          </p>
        </div>

        <Button 
          onClick={() => navigate("/auth?mode=signin", { replace: true })} 
          variant="jet"
          className="w-full"
          size="lg"
        >
          Sign In Now
        </Button>
      </div>
    </div>
  );
}
