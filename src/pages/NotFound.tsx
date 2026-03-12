import { useLocation } from "react-router";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center ring-1 ring-primary/20">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
          404
        </h1>
        <p className="text-xl text-muted-foreground font-medium">Oops! Page not found</p>
        <Button variant="jet" size="lg" asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
