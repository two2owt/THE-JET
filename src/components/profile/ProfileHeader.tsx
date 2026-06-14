import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Mail } from "lucide-react";

interface ProfileHeaderProps {
  email: string | null | undefined;
  displayName: string;
  avatarUrl: string | null | undefined;
  pronouns: string;
  bio: string;
  isEditing: boolean;
  isUploading: boolean;
  onAvatarSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Profile identity header: avatar + name/pronouns/bio/email + action row.
 * Stateless — parent owns edit state, avatar upload, share, and sign-out.
 */
export function ProfileHeader({
  email,
  displayName,
  avatarUrl,
  pronouns,
  bio,
  isEditing,
  isUploading,
  onAvatarSelected,
}: ProfileHeaderProps) {
  return (
    <header className="profile-header">
      <div className="profile-identity">
        <div className="profile-avatar-wrap">
          <Avatar className="ring-4 ring-background profile-avatar-shadow profile-avatar-img">
            <AvatarImage src={avatarUrl || undefined} alt={displayName || "User avatar"} />
            <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
              {displayName.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {isEditing && (
            <>
              <label
                htmlFor="avatar-upload"
                className="profile-avatar-camera"
                aria-label="Upload new avatar"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={onAvatarSelected}
                disabled={isUploading}
                className="sr-only"
              />
            </>
          )}
        </div>

        <div className="profile-identity-text">
          <h1 className="profile-name">{displayName || "User"}</h1>
          {pronouns && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border-hairline bg-card/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pronouns}
            </span>
          )}
          {bio && !isEditing && <p className="profile-bio">{bio}</p>}
          {email && (
            <p className="inline-flex items-center gap-1.5 text-fluid-sm text-muted-foreground max-w-full">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

export default ProfileHeader;