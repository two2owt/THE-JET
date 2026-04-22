import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Camera, Loader2, User, Settings, Edit2, X, Instagram, Twitter, Facebook, Linkedin, Video, Shield, LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { useIsAdmin } from "@/hooks/useIsAdmin";
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

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(100, "Display name must be less than 100 characters"),
  bio: z.string().trim().max(500, "Bio must be less than 500 characters").optional(),
});

const socialMediaSchema = z.object({
  instagram_url: z.string().trim().url("Invalid Instagram URL").optional().or(z.literal('')),
  twitter_url: z.string().trim().url("Invalid Twitter/X URL").optional().or(z.literal('')),
  facebook_url: z.string().trim().url("Invalid Facebook URL").optional().or(z.literal('')),
  linkedin_url: z.string().trim().url("Invalid LinkedIn URL").optional().or(z.literal('')),
  tiktok_url: z.string().trim().url("Invalid TikTok URL").optional().or(z.literal('')),
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const avatarFileSchema = z.object({
  type: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({ message: 'Only JPG, PNG, WEBP, and GIF images are allowed' })
  }),
  size: z.number().max(MAX_FILE_SIZE, 'Image size must be less than 5MB'),
  name: z.string().regex(/\.(jpg|jpeg|png|webp|gif)$/i, 'Invalid file extension')
});

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
}

export const UserProfile = () => {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        // If no profile exists, create one
        if (error.code === 'PGRST116') {
          await createDefaultProfile(session.user);
          return;
        }
        throw error;
      }

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || "");
        setBio(data.bio || "");
        setInstagramUrl(data.instagram_url || "");
        setTwitterUrl(data.twitter_url || "");
        setFacebookUrl(data.facebook_url || "");
        setLinkedinUrl(data.linkedin_url || "");
        setTiktokUrl(data.tiktok_url || "");
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultProfile = async (user: any) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: user.email?.split('@')[0] || 'User',
        })
        .select()
        .single();

      if (error) throw error;

      setProfile(data);
      setDisplayName(data.display_name || "");
      setBio(data.bio || "");
      toast.success('Profile created! Welcome to JET Social');
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file with Zod schema
    try {
      avatarFileSchema.parse({
        type: file.type,
        size: file.size,
        name: file.name
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error('Invalid file');
      }
      return;
    }

    setIsUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}/avatar.${fileExt}`;

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
      toast.success('Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      // Validate input
      const validatedData = profileSchema.parse({
        display_name: displayName,
        bio: bio || undefined,
      });

      // Validate social media URLs
      const validatedSocial = socialMediaSchema.parse({
        instagram_url: instagramUrl || '',
        twitter_url: twitterUrl || '',
        facebook_url: facebookUrl || '',
        linkedin_url: linkedinUrl || '',
        tiktok_url: tiktokUrl || '',
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error('Please sign in to update your profile');
        return;
      }

      setIsSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: validatedData.display_name,
          bio: validatedData.bio || null,
          instagram_url: validatedSocial.instagram_url || null,
          twitter_url: validatedSocial.twitter_url || null,
          facebook_url: validatedSocial.facebook_url || null,
          linkedin_url: validatedSocial.linkedin_url || null,
          tiktok_url: validatedSocial.tiktok_url || null,
        })
        .eq('id', session.user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      setIsEditing(false);
      await loadProfile();
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error('Error updating profile:', error);
        toast.error('Failed to update profile');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast.success('Signed out successfully');
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-card/90 backdrop-blur-sm shadow-none">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="p-6 bg-card/90 backdrop-blur-sm text-center shadow-none">
        <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground mb-4">Please sign in to view your profile</p>
        <Button onClick={() => navigate("/auth")}>
          Sign In
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6 bg-card/90 backdrop-blur-sm shadow-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Your Profile</h2>
        </div>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {/* Avatar Upload */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <Avatar className="w-24 h-24 sm:w-28 sm:h-28">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold">
              {displayName.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          
          {isEditing && (
            <>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={isUploading}
                className="hidden"
              />
            </>
          )}
        </div>
        {isEditing && (
          <p className="text-xs text-muted-foreground text-center">
            Click the camera icon to upload a new avatar
            <br />
            Max size: 5MB
          </p>
        )}
      </div>

      {/* Profile Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name">Display Name *</Label>
          <Input
            id="display_name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            maxLength={100}
            className="bg-background"
            disabled={!isEditing}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            maxLength={500}
            rows={4}
            className="bg-background resize-none"
            disabled={!isEditing}
          />
          {isEditing && (
            <p className="text-xs text-muted-foreground text-right">
              {bio.length}/500
            </p>
          )}
        </div>

        {isEditing && (
          <div className="flex gap-2">
            <Button
              onClick={handleSaveProfile}
              disabled={isSaving || !displayName.trim()}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            <Button
              onClick={() => {
                setIsEditing(false);
                setDisplayName(profile.display_name || "");
                setBio(profile.bio || "");
                setInstagramUrl(profile.instagram_url || "");
                setTwitterUrl(profile.twitter_url || "");
                setFacebookUrl(profile.facebook_url || "");
                setLinkedinUrl(profile.linkedin_url || "");
                setTiktokUrl(profile.tiktok_url || "");
              }}
              variant="outline"
              disabled={isSaving}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Social Media Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Instagram className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Social Media</h3>
        </div>

        {!isEditing && (instagramUrl || twitterUrl || facebookUrl || linkedinUrl || tiktokUrl) && (
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white hover:opacity-90 transition-opacity text-xs sm:text-sm font-medium"
              >
                <Instagram className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Instagram
              </a>
            )}
            
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white hover:opacity-90 transition-opacity text-xs sm:text-sm font-medium"
              >
                <Twitter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Twitter/X
              </a>
            )}
            
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:opacity-90 transition-opacity text-xs sm:text-sm font-medium"
              >
                <Facebook className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Facebook
              </a>
            )}
            
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 text-white hover:opacity-90 transition-opacity text-xs sm:text-sm font-medium"
              >
                <Linkedin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                LinkedIn
              </a>
            )}
            
            {tiktokUrl && (
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-br from-black to-gray-900 text-white hover:opacity-90 transition-opacity text-xs sm:text-sm font-medium"
              >
                <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                TikTok
              </a>
            )}
          </div>
        )}

        {!isEditing && !(instagramUrl || twitterUrl || facebookUrl || linkedinUrl || tiktokUrl) && (
          <p className="text-xs sm:text-sm text-muted-foreground">
            No social media accounts connected yet. Click Edit to add your profiles.
          </p>
        )}

        {isEditing && (
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2 text-xs sm:text-sm">
                <Instagram className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Instagram
              </Label>
              <Input
                id="instagram"
                type="url"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://instagram.com/yourprofile"
                className="bg-background text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="twitter" className="flex items-center gap-2 text-xs sm:text-sm">
                <Twitter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Twitter/X
              </Label>
              <Input
                id="twitter"
                type="url"
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                placeholder="https://twitter.com/yourprofile"
                className="bg-background text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="facebook" className="flex items-center gap-2 text-xs sm:text-sm">
                <Facebook className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Facebook
              </Label>
              <Input
                id="facebook"
                type="url"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                placeholder="https://facebook.com/yourprofile"
                className="bg-background text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="linkedin" className="flex items-center gap-2 text-xs sm:text-sm">
                <Linkedin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                LinkedIn
              </Label>
              <Input
                id="linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile"
                className="bg-background text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="tiktok" className="flex items-center gap-2 text-xs sm:text-sm">
                <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                TikTok
              </Label>
              <Input
                id="tiktok"
                type="url"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://tiktok.com/@yourprofile"
                className="bg-background text-xs sm:text-sm"
              />
            </div>

            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Enter the full URL to your social media profiles (optional)
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* App Settings Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">App Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                Switch between light and dark mode
              </p>
            </div>
            <ThemeToggle />
          </div>

          <Button
            onClick={() => navigate('/settings')}
            variant="outline"
            className="w-full"
          >
            <Settings className="w-4 h-4 mr-2" />
            Notification & Location Settings
          </Button>

          {isAdmin && (
            <Button
              onClick={() => navigate('/admin')}
              variant="default"
              className="w-full"
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin Dashboard
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You'll need to sign in again to access your account and personalized deals.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSignOut}>
                  Sign Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
};
