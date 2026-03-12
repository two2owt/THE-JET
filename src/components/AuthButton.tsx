import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { LogIn, LogOut, User } from "lucide-react";
import { toast } from "sonner";

export const AuthButton = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={() => navigate("/profile")}
          variant="ghost"
          size="sm"
          className="h-8 px-3 gap-2"
        >
          <User className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-foreground max-w-[100px] truncate">
            {user.email}
          </span>
        </Button>
        <Button
          onClick={handleSignOut}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => navigate("/auth")}
      variant="ghost"
      size="sm"
      className="gap-2"
    >
      <LogIn className="w-4 h-4" />
      <span className="text-sm">Sign In</span>
    </Button>
  );
};
