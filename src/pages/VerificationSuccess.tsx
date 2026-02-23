import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerificationSuccess() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/auth");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Email Verified!
          </h1>
          <p className="text-muted-foreground">
            Welcome to JET! Your email has been successfully verified.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-sm text-muted-foreground">
            Redirecting to sign in page in <span className="font-semibold text-foreground">{countdown}</span> seconds...
          </p>
        </div>

        <Button 
          onClick={() => navigate("/auth")} 
          className="w-full"
          size="lg"
        >
          Sign In Now
        </Button>
      </div>
    </div>
  );
}
