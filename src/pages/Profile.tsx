import { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/PageLayout";
import { ProfilePageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { useFavorites } from "@/hooks/useFavorites";
import { useConnections } from "@/hooks/useConnections";
import { useProfile } from "@/hooks/useProfile";
import { Camera, Edit2, X, Save, Heart, Users, Shield, LogOut, Loader2, Instagram, Twitter, Facebook, Linkedin, Video, Mail, Bell, ChevronRight, Link2 } from "lucide-react";

import { toast } from "sonner";
import { z } from "zod";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Settings as SettingsIcon } from "lucide-react";

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(100, "Display name must be less than 100 characters"),
  bio: z.string().trim().max(500, "Bio must be less than 500 characters").optional()
});
const socialMediaSchema = z.object({
  instagram_url: z.string().trim().url("Invalid Instagram URL").optional().or(z.literal('')),
  twitter_url: z.string().trim().url("Invalid Twitter/X URL").optional().or(z.literal('')),
  facebook_url: z.string().trim().url("Invalid Facebook URL").optional().or(z.literal('')),
  linkedin_url: z.string().trim().url("Invalid LinkedIn URL").optional().or(z.literal('')),
  tiktok_url: z.string().trim().url("Invalid TikTok URL").optional().or(z.literal(''))
});
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const avatarFileSchema = z.object({
  type: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({
      message: 'Only JPG, PNG, WEBP, and GIF images are allowed'
    })
  }),
  size: z.number().max(MAX_FILE_SIZE, 'Image size must be less than 5MB'),
  name: z.string().regex(/\.(jpg|jpeg|png|webp|gif)$/i, 'Invalid file extension')
});
const GENDER_OPTIONS = [{
  value: "woman",
  label: "Woman"
}, {
  value: "man",
  label: "Man"
}, {
  value: "non-binary",
  label: "Non-binary"
}, {
  value: "prefer-not-to-say",
  label: "Prefer not to say"
}, {
  value: "other",
  label: "Other"
}];
const PRONOUN_OPTIONS = [{
  value: "she/her",
  label: "She/Her"
}, {
  value: "he/him",
  label: "He/Him"
}, {
  value: "they/them",
  label: "They/Them"
}, {
  value: "she/they",
  label: "She/They"
}, {
  value: "he/they",
  label: "He/They"
}, {
  value: "prefer-not-to-say",
  label: "Prefer not to say"
}, {
  value: "other",
  label: "Other"
}];
export default function Profile() {
  const navigate = useNavigate();
  const {
    isAdmin
  } = useIsAdmin();
  const { user, isLoading: isAuthLoading } = useAuth();
  // Stable header config so PageLayout effect doesn't churn.
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);
  const {
    profile,
    isLoading: isProfileLoading,
    updateProfile,
    isSaving,
    uploadAvatar,
    isUploading,
    checkDisplayNameUnique,
  } = useProfile(user?.id);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  // Inline field-level validation errors for the profile form.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const {
    favorites
  } = useFavorites(user?.id);
  const {
    connections
  } = useConnections(user?.id);
  // Sync hydrated profile into the editable form state. Only fires when
  // a fresh profile object arrives from the cache/network.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || "");
    setBio(profile.bio || "");
    setGender(profile.gender || "");
    setPronouns(profile.pronouns || "");
    setInstagramUrl(profile.instagram_url || "");
    setTwitterUrl(profile.twitter_url || "");
    setFacebookUrl(profile.facebook_url || "");
    setLinkedinUrl(profile.linkedin_url || "");
    setTiktokUrl(profile.tiktok_url || "");
  }, [profile]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file twice still triggers change
    e.target.value = "";
    if (!file || !profile || !user) return;
    try {
      avatarFileSchema.parse({
        type: file.type,
        size: file.size,
        name: file.name
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.onerror = () => toast.error('Failed to read image');
    reader.readAsDataURL(file);
  };

  const handleCroppedAvatarSave = async (blob: Blob) => {
    if (!profile || !user) return;
    try {
      await uploadAvatar(blob);
      toast.success('Avatar updated');
      setIsCropOpen(false);
      setCropSrc(null);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    }
  };
  const handleSaveProfile = async () => {
    if (!user) return;
    setFieldErrors({});
    try {
      const validatedData = profileSchema.parse({
        display_name: displayName,
        bio: bio || undefined
      });

      // Validate gender is required
      if (!gender) {
        setFieldErrors((p) => ({ ...p, gender: "Please select your gender" }));
        toast.error("Gender required", {
          description: "Please select your gender"
        });
        return;
      }
      const validatedSocial = socialMediaSchema.parse({
        instagram_url: instagramUrl || '',
        twitter_url: twitterUrl || '',
        facebook_url: facebookUrl || '',
        linkedin_url: linkedinUrl || '',
        tiktok_url: tiktokUrl || ''
      });

      // Check unique display name
      const isUnique = await checkDisplayNameUnique(validatedData.display_name);
      if (!isUnique) {
        setFieldErrors({ display_name: "This display name is already in use" });
        toast.error("Display name taken", {
          description: "This display name is already in use. Please choose another."
        });
        return;
      }
      try {
        await updateProfile({
          display_name: validatedData.display_name,
          bio: validatedData.bio || null,
          gender: gender,
          pronouns: pronouns || null,
          instagram_url: validatedSocial.instagram_url || null,
          twitter_url: validatedSocial.twitter_url || null,
          facebook_url: validatedSocial.facebook_url || null,
          linkedin_url: validatedSocial.linkedin_url || null,
          tiktok_url: validatedSocial.tiktok_url || null,
        });
      } catch (err: any) {
        if (err?.code === '23505') {
          setFieldErrors({ display_name: "This display name is already in use" });
          toast.error("Display name taken", {
            description: "This display name is already in use. Please choose another.",
          });
          return;
        }
        throw err;
      }
      toast.success('Profile updated');
      setIsEditing(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Map every zod issue to its field for inline display.
        const errs: Record<string, string> = {};
        for (const issue of error.errors) {
          const key = (issue.path[0] as string) || "_form";
          if (!errs[key]) errs[key] = issue.message;
        }
        setFieldErrors(errs);
        toast.error(error.errors[0].message);
      } else {
        toast.error('Failed to update profile');
      }
    }
  };
  const handleSignOut = async () => {
    try {
      // Local scope clears the persisted browser session immediately. A global
      // logout can fail on an expired token before local auth state is removed.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.warn('Local sign out returned an error:', error.message);
      }
      toast.success('Signed out');
      // Hard redirect to ensure all auth-dependent state is reset
      window.location.replace('/auth');
    } catch (error) {
      console.error('Sign out failed:', error);
      toast.error('Failed to sign out');
    }
  };
  if (isAuthLoading || (user && isProfileLoading)) {
    return (
      <PageLayout defaultTab="map" headerConfig={headerConfig}>
        <PageShell>
          <ProfilePageSkeleton />
        </PageShell>
      </PageLayout>
    );
  }
  if (!user) {
    rememberPostAuthRedirect();
    return <Navigate to="/auth" replace />;
  }

  return (
    <PageLayout defaultTab="map" headerConfig={headerConfig} mainClassName="profile-scroll-root">
      <AvatarCropDialog
        open={isCropOpen}
        imageSrc={cropSrc}
        onClose={() => { setIsCropOpen(false); setCropSrc(null); }}
        onCropComplete={handleCroppedAvatarSave}
        isProcessing={isUploading}
      />
      <PageShell>
        <TabPageHeader title="Profile" subtitle="Your identity, connections, and social links" />

        {/* Identity hero — centered, gradient glow */}
        <section className="relative rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg glow-ambient overflow-hidden">
          {/* Ambient radial accent behind avatar */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-40 profile-hero-accent"
          />

          <div className="profile-hero-stack">
            {/* Avatar — explicit pixel sizing so the image can never escape its container.
                overflow:visible keeps the ring/shadow halo + the edit-mode camera
                upload pill from being clipped by any ancestor. */}
            <div
              className="relative"
              style={{ width: 104, height: 104, flexShrink: 0, overflow: 'visible' }}
            >
              <Avatar
                className="ring-2 ring-primary/40 profile-avatar-shadow"
                style={{ width: 104, height: 104 }}
              >
                <AvatarImage src={profile?.avatar_url || undefined} alt={displayName || "User avatar"} />
                <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  {displayName.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {isEditing && (
                <>
                  <label
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground flex items-center justify-center cursor-pointer shadow-md shadow-primary/30 ring-2 ring-background hover:scale-105 active:scale-95 transition-transform focus-within:ring-2 focus-within:ring-primary/50"
                    aria-label="Upload new avatar"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </label>
                  <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} className="sr-only" />
                </>
              )}
            </div>

            <h2 className="mt-fluid-md heading-luxe-card truncate max-w-full">
              {displayName || 'User'}
            </h2>
            {pronouns && (
              <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full border-hairline bg-card/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {pronouns}
              </span>
            )}
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-fluid-sm text-muted-foreground max-w-full">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{user.email}</span>
            </p>

            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="Edit profile"
                /* mt-fluid-md gives the focus ring (4px gold outline) clear
                   breathing room from the email row above on small phones. */
                className="mt-fluid-md inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-primary/40 bg-card/60 backdrop-blur-md text-xs font-semibold text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit profile
              </button>
            )}
          </div>

          <div className="divider-luxe my-fluid-md" />

          {/* Stat chips double as navigation. */}
          <div className="profile-stats-grid">
            {[
              { icon: Heart, label: 'Favorites', value: favorites.length, to: '/favorites' },
              { icon: Users, label: 'Connections', value: connections.length, to: '/social' },
              { icon: Bell, label: 'Alerts', value: 0, to: null as string | null },
            ].map(({ icon: Icon, label, value, to }) => {
              const className =
                "min-w-0 flex flex-col items-center justify-center rounded-xl border-hairline bg-card/30 backdrop-blur-sm py-3 px-2 hover:border-primary/40 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
              const content = (
                <>
                  <Icon className="w-4 h-4 text-primary mb-1" />
                  <div className="text-luxe-stat text-xl sm:text-2xl text-foreground leading-none">
                    {value}
                  </div>
                  <div className="heading-luxe-eyebrow mt-1 text-center truncate">{label}</div>
                </>
              );
              return to ? (
                <button key={label} type="button" onClick={() => navigate(to)} className={className}>
                  {content}
                </button>
              ) : (
                <div key={label} className={className}>{content}</div>
              );
            })}
          </div>
        </section>

        {/* Profile form card */}
        <section className="rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg">
          <div
            className="mb-fluid-md"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="dot-gold" style={{ flexShrink: 0 }} />
            <span className="heading-luxe-eyebrow">Account Details</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <Label htmlFor="display_name" className="heading-luxe-eyebrow text-left">
                  Display Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={e => {
                    setDisplayName(e.target.value);
                    if (fieldErrors.display_name) setFieldErrors(p => ({ ...p, display_name: undefined }));
                  }}
                  placeholder="Your display name"
                  maxLength={100}
                  disabled={!isEditing}
                  aria-invalid={!!fieldErrors.display_name}
                  aria-describedby={fieldErrors.display_name ? "display_name-error" : undefined}
                  className="profile-input"
                  style={{ width: '100%' }}
                />
                {fieldErrors.display_name && (
                  <p id="display_name-error" role="alert" className="text-xs font-medium text-destructive">
                    {fieldErrors.display_name}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <Label htmlFor="bio" className="heading-luxe-eyebrow text-left">
                  Bio <span className="text-muted-foreground/70 normal-case">(optional)</span>
                </Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={e => {
                    setBio(e.target.value);
                    if (fieldErrors.bio) setFieldErrors(p => ({ ...p, bio: undefined }));
                  }}
                  placeholder="Tell us about yourself..."
                  maxLength={500}
                  rows={4}
                  disabled={!isEditing}
                  className="resize-none profile-textarea"
                  style={{ width: '100%' }}
                  aria-invalid={!!fieldErrors.bio}
                  aria-describedby={fieldErrors.bio ? "bio-error" : undefined}
                />
                {fieldErrors.bio && (
                  <p id="bio-error" role="alert" className="text-xs font-medium text-destructive">
                    {fieldErrors.bio}
                  </p>
                )}
                {isEditing && <p className="text-xs text-muted-foreground text-right">
                    {bio.length}/500
                  </p>}
              </div>

              <div
                className="profile-2col-grid"
                style={{ display: 'grid', gap: 'var(--space-sm)' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', minWidth: 0 }}>
                  <Label className="heading-luxe-eyebrow text-left">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={gender}
                    onValueChange={(v) => {
                      setGender(v);
                      if (fieldErrors.gender) setFieldErrors(p => ({ ...p, gender: undefined }));
                    }}
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="bg-card/60 profile-select-trigger" style={{ width: '100%' }}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                  {fieldErrors.gender && (
                    <p role="alert" className="text-xs font-medium text-destructive">
                      {fieldErrors.gender}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', minWidth: 0 }}>
                  <Label className="heading-luxe-eyebrow text-left">
                    Pronouns <span className="text-muted-foreground/70 normal-case">(optional)</span>
                  </Label>
                  <Select value={pronouns} onValueChange={setPronouns} disabled={!isEditing}>
                    <SelectTrigger className="bg-card/60 profile-select-trigger" style={{ width: '100%' }}>
                      <SelectValue placeholder="Select pronouns" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRONOUN_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isEditing && <>
                  <div className="divider-luxe my-fluid-md" />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="dot-gold" style={{ flexShrink: 0 }} />
                      <span className="heading-luxe-eyebrow">Social Media Links</span>
                    </div>
                    {[
                      { icon: Instagram, value: instagramUrl, setter: setInstagramUrl, placeholder: "Instagram profile URL" },
                      { icon: Twitter, value: twitterUrl, setter: setTwitterUrl, placeholder: "Twitter/X profile URL" },
                      { icon: Facebook, value: facebookUrl, setter: setFacebookUrl, placeholder: "Facebook profile URL" },
                      { icon: Linkedin, value: linkedinUrl, setter: setLinkedinUrl, placeholder: "LinkedIn profile URL" },
                      { icon: Video, value: tiktokUrl, setter: setTiktokUrl, placeholder: "TikTok profile URL" },
                    ].map(({ icon: Icon, value, setter, placeholder }) => (
                      <div key={placeholder} className="profile-social-row">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <Input
                          value={value}
                          onChange={e => setter(e.target.value)}
                          placeholder={placeholder}
                          className="profile-input"
                        />
                      </div>
                    ))}
                  </div>
                </>}

              {/* Social Links Display */}
              {!isEditing && (instagramUrl || twitterUrl || facebookUrl || linkedinUrl || tiktokUrl) && (
                <>
                  <div className="divider-luxe my-fluid-md" />
                  <div>
                    <div className="flex items-center gap-2 mb-fluid-sm">
                      <span className="dot-gold" />
                      <h3 className="heading-luxe-eyebrow inline-flex items-center gap-1.5">
                        <Link2 className="w-3 h-3" />
                        Social Media
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { url: instagramUrl, icon: Instagram, label: 'Instagram' },
                        { url: twitterUrl, icon: Twitter, label: 'Twitter / X' },
                        { url: facebookUrl, icon: Facebook, label: 'Facebook' },
                        { url: linkedinUrl, icon: Linkedin, label: 'LinkedIn' },
                        { url: tiktokUrl, icon: Video, label: 'TikTok' },
                      ]
                        .filter((s) => !!s.url)
                        .map(({ url, icon: Icon, label }) => (
                          <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border-hairline bg-card/40 backdrop-blur-sm text-foreground text-sm font-semibold hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                          >
                            <Icon className="w-4 h-4 text-primary" />
                            {label}
                          </a>
                        ))}
                    </div>
                  </div>
                </>
              )}

              {isEditing && <div style={{ display: 'flex', gap: 'var(--space-sm)', paddingTop: 'var(--space-md)' }}>
                  <Button
                    onClick={handleSaveProfile}
                    disabled={isSaving || !displayName.trim()}
                    variant="jet"
                    size="lg"
                    className="flex-1 rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
                  >
                    {isSaving ? <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </> : <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>}
                  </Button>
                  <Button
                    onClick={() => {
                setIsEditing(false);
                setDisplayName(profile?.display_name || "");
                setBio(profile?.bio || "");
                setInstagramUrl(profile?.instagram_url || "");
                setTwitterUrl(profile?.twitter_url || "");
                setFacebookUrl(profile?.facebook_url || "");
                setLinkedinUrl(profile?.linkedin_url || "");
                setTiktokUrl(profile?.tiktok_url || "");
              }}
                    variant="outline"
                    size="lg"
                    disabled={isSaving}
                    className="rounded-full border-primary/40 bg-transparent text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>}
          </div>
        </section>

          {/* Admin entry */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="group flex items-center gap-fluid-sm w-full text-left p-fluid-sm rounded-full border-hairline bg-card/40 backdrop-blur-xl hover:border-primary/50 hover:bg-card/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all"
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary/20 to-primary-glow/10 text-primary border-hairline">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="heading-luxe-card text-fluid-sm">Admin</div>
                <div className="text-xs text-muted-foreground truncate">Dashboard &amp; analytics</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          )}

          {/* Settings entry — preferences, privacy, subscription, and account
              all live on the dedicated /settings page. Profile stays focused
              on identity to avoid duplicating the same forms in two places. */}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="group flex items-center gap-fluid-sm w-full text-left p-fluid-sm rounded-full border-hairline bg-card/40 backdrop-blur-xl hover:border-primary/50 hover:bg-card/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all"
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary/20 to-primary-glow/10 text-primary border-hairline">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="heading-luxe-card text-fluid-sm">Settings</div>
              <div className="text-xs text-muted-foreground truncate">Preferences, privacy, notifications &amp; subscription</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </button>

          {/* Sign Out */}
          <section className="rounded-2xl border-hairline border-destructive/20 bg-card/40 backdrop-blur-xl p-fluid-sm sm:p-fluid-md">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 focus-visible:ring-2 focus-visible:ring-destructive/40"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
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
                    onClick={handleSignOut}
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20 font-semibold tracking-wide"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
      </PageShell>
    </PageLayout>
  );
}