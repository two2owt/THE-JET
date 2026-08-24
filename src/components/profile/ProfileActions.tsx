import { Edit2, Share2, X } from "lucide-react";

interface ProfileActionsProps {
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onShare: () => void;
}

/**
 * Bottom-of-page action bar for the profile screen.
 * Owns Edit/Cancel and Share. Sign Out deliberately lives at the bottom of
 * the Account tab so it can't be mis-tapped next to Edit Profile.
 */
export function ProfileActions({
  isEditing,
  onStartEdit,
  onCancelEdit,
  onShare,
}: ProfileActionsProps) {
  return (
    <div
      className="profile-actions profile-actions-bottom"
      role="group"
      aria-label="Profile actions"
    >
      {!isEditing ? (
        <button
          type="button"
          onClick={onStartEdit}
          className="profile-action-btn profile-action-primary"
        >
          <Edit2 className="w-4 h-4" aria-hidden="true" />
          Edit
        </button>
      ) : (
        <button
          type="button"
          onClick={onCancelEdit}
          className="profile-action-btn profile-action-secondary"
        >
          <X className="w-4 h-4" aria-hidden="true" />
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
    </div>
  );
}

export default ProfileActions;
