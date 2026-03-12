import { LogIn, UserPlus } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useNavigate } from "react-router";

interface AuthPromptProps {
  featureName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AuthPrompt = ({
  featureName,
  isOpen,
  onClose,
}: AuthPromptProps) => {
  const navigate = useNavigate();

  const handleSignIn = () => {
    onClose();
    navigate("/auth?mode=signin");
  };

  const handleSignUp = () => {
    onClose();
    navigate("/auth?mode=signup");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Sign in to continue
          </DialogTitle>
          <DialogDescription className="text-center">
            {featureName} requires an account. Sign in or create one to unlock this feature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              With an account you can:
            </p>
            <ul className="space-y-2">
              {[
                "Save your favorite venues and deals",
                "Get personalized notifications",
                "Connect with other JET users",
                "Sync across all your devices",
              ].map((benefit, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleSignUp}
              className="w-full bg-gradient-to-r from-primary to-primary-glow"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account
            </Button>
            <Button
              variant="outline"
              onClick={handleSignIn}
              className="w-full"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Free to join. No credit card required.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
