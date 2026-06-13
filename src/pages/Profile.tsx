import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import { PageLayout } from "@/components/PageLayout";
import { ProfilePageSkeleton } from "@/components/skeletons/PageSkeletons";
import { PageShell } from "@/components/PageShell";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { useFavorites } from "@/hooks/useFavorites";
import { useConnections } from "@/hooks/useConnections";
import { useProfile } from "@/hooks/useProfile";
import { SEO } from "@/components/SEO";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Shield,
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Video,
  ChevronRight,
  Link2,
  Activity as ActivityIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { z } from "zod";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileSettingsPanel } from "@/components/settings/ProfileSettingsPanel";
import { signOutCurrentUser } from "@/lib/authSession";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStatsPills } from "@/components/profile/ProfileStatsPills";
import {
  ProfileEditForm,
  type ProfileEditFormValues,
} from "@/components/profile/ProfileEditForm";

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

const EMPTY_FORM: ProfileEditFormValues = {
  displayName: "",
  bio: "",
  gender: "",
  pronouns: "",
  instagramUrl: "",
  twitterUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
  tiktokUrl: "",
};

export default function Profile() {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
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
  const [form, setForm] = useState<ProfileEditFormValues>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("about");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  // Inline field-level validation errors for the profile form.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const { favorites } = useFavorites(user?.id);
  const { connections } = useConnections(user?.id);
  const { notifications } = useNotifications(!!user);

  const setFormValue = useCallback(
    <K extends keyof ProfileEditFormValues>(key: K, val: ProfileEditFormValues[K]) =>
      setForm((prev) => ({ ...prev, [key]: val })),
    [],
  );
  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((p) => ({ ...p, [key]: undefined }));
  }, []);

  // Sync hydrated profile into the editable form state. Only fires when
  // a fresh profile object arrives from the cache/network.
  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.display_name || "",
      bio: profile.bio || "",
      gender: profile.gender || "",
      pronouns: profile.pronouns || "",
      instagramUrl: profile.instagram_url || "",
      twitterUrl: profile.twitter_url || "",
      facebookUrl: profile.facebook_url || "",
      linkedinUrl: profile.linkedin_url || "",
      tiktokUrl: profile.tiktok_url || "",
    });
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
        display_name: form.displayName,
        bio: form.bio || undefined,
      });

      // Validate gender is required
      if (!form.gender) {
        setFieldErrors((p) => ({ ...p, gender: "Please select your gender" }));
        toast.error("Gender required", {
          description: "Please select your gender"
        });
        return;
      }
      const validatedSocial = socialMediaSchema.parse({
        instagram_url: form.instagramUrl || '',
        twitter_url: form.twitterUrl || '',
        facebook_url: form.facebookUrl || '',
        linkedin_url: form.linkedinUrl || '',
        tiktok_url: form.tiktokUrl || '',
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
          gender: form.gender,
          pronouns: form.pronouns || null,
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
  const handleShareProfile = async () => {
    const url = `${window.location.origin}/profile`;
    const shareData = {
      title: `${form.displayName || 'JET Around'} on JET`,
      text: form.bio || 'Check out my JET profile',
      url,
    };
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      } catch {
        toast.error('Unable to share profile');
      }
    }
  };
  const handleSignOut = () => {
    toast.success('Signed out');
    signOutCurrentUser('/auth');
  };
  const handleCancelEdit = () => {
    setIsEditing(false);
    // Restore form from latest profile.
    if (profile) {
      setForm({
        displayName: profile.display_name || "",
        bio: profile.bio || "",
        gender: profile.gender || "",
        pronouns: profile.pronouns || "",
        instagramUrl: profile.instagram_url || "",
        twitterUrl: profile.twitter_url || "",
        facebookUrl: profile.facebook_url || "",
        linkedinUrl: profile.linkedin_url || "",
        tiktokUrl: profile.tiktok_url || "",
      });
    }
    setFieldErrors({});
  };

  if (isAuthLoading || (user && isProfileLoading)) {
    return (
      <PageLayout defaultTab="map" headerConfig={headerConfig}>
        <ProfilePageSkeleton />
      </PageLayout>
    );
  }
  if (!user) {
    rememberPostAuthRedirect();
    return <Navigate to="/auth" replace />;
  }

  const hasAnySocial =
    !!(form.instagramUrl || form.twitterUrl || form.facebookUrl || form.linkedinUrl || form.tiktokUrl);

  return (
    <PageLayout defaultTab="map" headerConfig={headerConfig} mainClassName="profile-scroll-root">
      <SEO
        title="Your Profile — JET"
        description="Manage your JET profile, preferences, subscription, and account settings."
        path="/profile"
      />
      <AvatarCropDialog
        open={isCropOpen}
        imageSrc={cropSrc}
        onClose={() => { setIsCropOpen(false); setCropSrc(null); }}
        onCropComplete={handleCroppedAvatarSave}
        isProcessing={isUploading}
      />
      <PageShell padding="0px" gap="0px" className="profile-scroll">
        <ProfileHeader
          email={user.email}
          displayName={form.displayName}
          avatarUrl={profile?.avatar_url}
          pronouns={form.pronouns}
          bio={form.bio}
          isEditing={isEditing}
          isUploading={isUploading}
          onStartEdit={() => setIsEditing(true)}
          onCancelEdit={handleCancelEdit}
          onShare={handleShareProfile}
          onSignOut={handleSignOut}
          onAvatarSelected={handleAvatarUpload}
        />

        {/* Stats — hidden in edit mode to keep focus on the form */}
        {!isEditing && (
          <section aria-label="Profile stats" className="profile-section">
            <ProfileStatsPills
              favoritesCount={favorites.length}
              connectionsCount={connections.length}
              unreadAlertsCount={notifications.filter((n) => !n.read).length}
            />
          </section>
        )}

        {/* Edit mode — single focused form, hides the tab navigation entirely */}
        {isEditing ? (
          <section aria-label="Edit profile" className="profile-section">
            <ProfileEditForm
              values={form}
              setValue={setFormValue}
              fieldErrors={fieldErrors}
              clearFieldError={clearFieldError}
              isSaving={isSaving}
              onSave={handleSaveProfile}
            />
          </section>
        ) : (
        <section aria-label="Profile content" className="profile-section">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="profile-tabs-list">
              <TabsTrigger value="about" className="profile-tab-trigger">About</TabsTrigger>
              <TabsTrigger value="activity" className="profile-tab-trigger">Activity</TabsTrigger>
              <TabsTrigger value="account" className="profile-tab-trigger">Account</TabsTrigger>
            </TabsList>

            {/* ABOUT */}
            <TabsContent value="about" className="profile-tab-content">
              <div className="rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg">
                <div className="mb-fluid-sm flex items-center gap-2">
                  <span className="dot-gold shrink-0" />
                  <span className="heading-luxe-eyebrow">About</span>
                </div>
                {form.bio ? (
                  <p className="text-fluid-base text-foreground/90 leading-relaxed whitespace-pre-wrap">{form.bio}</p>
                ) : (
                  <p className="text-fluid-sm text-muted-foreground italic">No bio yet. Add one in the Account tab.</p>
                )}

                {(form.gender || form.pronouns) && (
                  <>
                    <div className="divider-luxe my-fluid-md" />
                    <div className="grid grid-cols-2 gap-fluid-sm">
                      {form.gender && (
                        <div>
                          <div className="heading-luxe-eyebrow mb-1">Gender</div>
                          <div className="text-fluid-sm text-foreground capitalize">{form.gender.replace(/-/g, ' ')}</div>
                        </div>
                      )}
                      {form.pronouns && (
                        <div>
                          <div className="heading-luxe-eyebrow mb-1">Pronouns</div>
                          <div className="text-fluid-sm text-foreground">{form.pronouns}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {hasAnySocial && (
                  <>
                    <div className="divider-luxe my-fluid-md" />
                    <div className="flex items-center gap-2 mb-fluid-sm">
                      <Link2 className="w-3.5 h-3.5 text-primary" />
                      <h3 className="heading-luxe-eyebrow">Social Media</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { url: form.instagramUrl, icon: Instagram, label: 'Instagram' },
                        { url: form.twitterUrl, icon: Twitter, label: 'Twitter / X' },
                        { url: form.facebookUrl, icon: Facebook, label: 'Facebook' },
                        { url: form.linkedinUrl, icon: Linkedin, label: 'LinkedIn' },
                        { url: form.tiktokUrl, icon: Video, label: 'TikTok' },
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
                  </>
                )}
              </div>
            </TabsContent>

            {/* ACTIVITY */}
            <TabsContent value="activity" className="profile-tab-content">
              <div className="rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg">
                <EmptyState
                  icon={ActivityIcon}
                  title="No activity yet"
                  description="When you save deals, connect with people, or get alerts, you'll see them here."
                  actionLabel="Explore the map"
                  onAction={() => navigate('/')}
                />
              </div>
            </TabsContent>

            {/* ACCOUNT — admin shortcut + settings panel (edit lives at top via Edit Profile) */}
            <TabsContent value="account" className="profile-tab-content">
              <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
                {/* Admin shortcut */}
                {isAdmin && (
                  <nav aria-label="Account navigation" className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
                    <button
                      type="button"
                      onClick={() => navigate('/admin')}
                      className="group w-full text-left rounded-2xl border-hairline bg-card/40 backdrop-blur-xl hover:border-primary/50 hover:bg-card/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all"
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', minWidth: 0 }}
                    >
                      <span
                        className="rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/10 text-primary border-hairline"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0 }}
                      >
                        <Shield className="w-5 h-5" />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minWidth: 0 }}>
                        <span className="heading-luxe-card text-fluid-sm">Admin</span>
                        <span className="text-xs text-muted-foreground" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Dashboard & analytics
                        </span>
                      </span>
                      <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" style={{ width: 16, height: 16, flexShrink: 0 }} />
                    </button>
                  </nav>
                )}

                {/* Preferences / privacy / consent / notifications / subscription / support */}
                {user?.id && (
                  <ProfileSettingsPanel userId={user.id} userEmail={user.email} />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
        )}
      </PageShell>
    </PageLayout>
  );
}
