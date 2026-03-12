import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DeleteAccountDialogProps {
  userId: string;
}

export const DeleteAccountDialog = ({ userId }: DeleteAccountDialogProps) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    setIsDeleting(true);

    try {
      // Delete user data from all related tables
      // The order matters due to foreign key constraints
      
      // Delete search history
      await supabase
        .from('search_history')
        .delete()
        .eq('user_id', userId);

      // Delete user favorites
      await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId);

      // Delete deal shares
      await supabase
        .from('deal_shares')
        .delete()
        .eq('user_id', userId);

      // Delete venue reviews
      await supabase
        .from('venue_reviews')
        .delete()
        .eq('user_id', userId);

      // Delete user connections (both directions)
      await supabase
        .from('user_connections')
        .delete()
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      // Delete notification logs
      await supabase
        .from('notification_logs')
        .delete()
        .eq('user_id', userId);

      // Delete push subscriptions
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);

      // Delete user locations
      await supabase
        .from('user_locations')
        .delete()
        .eq('user_id', userId);

      // Delete user preferences
      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', userId);

      // Delete user roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete profile (this should cascade from auth.users but we do it explicitly)
      await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      // Sign out the user
      await supabase.auth.signOut();

      toast.success("Your account has been deleted");
      navigate("/auth");
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button 
          variant="destructive" 
          className="w-full"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Delete Account
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This action is <strong>permanent and cannot be undone</strong>. All your data will be permanently deleted, including:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>Your profile and preferences</li>
              <li>Saved favorites and search history</li>
              <li>Reviews and ratings</li>
              <li>Friend connections</li>
              <li>Location history and notifications</li>
            </ul>
            <div className="pt-2">
              <label htmlFor="delete-confirm-input" className="text-sm font-medium text-foreground">
                Type <span className="font-bold text-destructive">DELETE</span> to confirm:
              </label>
              <Input
                id="delete-confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mt-2"
                disabled={isDeleting}
                aria-describedby="delete-warning"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmText !== "DELETE"}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
