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
import { Edit2, LogOut, Share2, X } from "lucide-react";

interface ProfileActionsProps {
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onShare: () => void;
  onSignOut: () => void;
}

/**
 * Bottom-of-page action bar for the profile screen.
 * Owns Edit/Cancel, Share and Sign Out — parent owns the handlers.
 */
export function ProfileActions({
  isEditing,
  onStartEdit,
  onCancelEdit,
  onShare,
  onSignOut,
}: ProfileActionsProps) {
  return (
    <div className="profile-actions profile-actions-bottom" role="group" aria-label="Profile actions">
      {!isEditing ? (
        <button
          type="button"
          onClick={onStartEdit}
          className="profile-action-btn profile-action-primary"
        >
          <Edit2 className="w-4 h-4" />
          Edit Profile
        </button>
      ) : (
        <button
          type="button"
          onClick={onCancelEdit}
          className="profile-action-btn profile-action-secondary"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      )}
      <button
        type="button"
        onClick={onShare}
        className="profile-action-btn profile-action-secondary"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button type="button" className="profile-action-btn profile-action-danger">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to access your profile and favorites.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-primary/40 bg-transparent text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onSignOut}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20 font-semibold tracking-wide"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ProfileActions;