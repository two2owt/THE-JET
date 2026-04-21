import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/PageLayout";
import { ProfilePageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/hooks/useFavorites";
import { useConnections } from "@/hooks/useConnections";
import { User, Camera, Edit2, X, Save, Settings, Heart, Users, Shield, LogOut, Loader2, Instagram, Twitter, Facebook, Linkedin, Video, Mail, Sparkles, Bell, ChevronRight, Link2 } from "lucide-react";

import { toast } from "sonner";
import { z } from "zod";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  pronouns: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
}
export default function Profile() {
  const navigate = useNavigate();
  const {
    isAdmin
  } = useIsAdmin();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const {
    favorites
  } = useFavorites(user?.id);
  const {
    connections
  } = useConnections(user?.id);
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) {
      loadProfile();
    } else {
      setIsLoading(false);
    }
  }, [user]);
  const loadProfile = async () => {
    if (!user) return;
    try {
      const {
        data,
        error
      } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        if (error.code === 'PGRST116') {
          await createDefaultProfile();
          return;
        }
        throw error;
      }
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || "");
        setBio(data.bio || "");
        setGender(data.gender || "");
        setPronouns(data.pronouns || "");
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
  const createDefaultProfile = async () => {
    if (!user) return;
    try {
      const {
        data,
        error
      } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: user.email?.split('@')[0] || 'User'
      }).select().single();
      if (error) throw error;
      setProfile(data);
      setDisplayName(data.display_name || "");
      toast.success('Profile created');
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile');
    }
  };
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }
      const {
        error: uploadError
      } = await supabase.storage.from('avatars').upload(fileName, file, {
        upsert: true
      });
      if (uploadError) throw uploadError;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const {
        error: updateError
      } = await supabase.from('profiles').update({
        avatar_url: publicUrl
      }).eq('id', user.id);
      if (updateError) throw updateError;
      setProfile(prev => prev ? {
        ...prev,
        avatar_url: publicUrl
      } : null);
      toast.success('Avatar updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };
  const checkDisplayNameUnique = async (name: string): Promise<boolean> => {
    const {
      data,
      error
    } = await supabase.from("profiles").select("id").eq("display_name", name).neq("id", user?.id || "").limit(1);
    if (error) return true;
    return !data || data.length === 0;
  };
  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      const validatedData = profileSchema.parse({
        display_name: displayName,
        bio: bio || undefined
      });

      // Validate gender is required
      if (!gender) {
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
      setIsSaving(true);

      // Check unique display name
      const isUnique = await checkDisplayNameUnique(validatedData.display_name);
      if (!isUnique) {
        toast.error("Display name taken", {
          description: "This display name is already in use. Please choose another."
        });
        setIsSaving(false);
        return;
      }
      const {
        error
      } = await supabase.from('profiles').update({
        display_name: validatedData.display_name,
        bio: validatedData.bio || null,
        gender: gender,
        pronouns: pronouns || null,
        instagram_url: validatedSocial.instagram_url || null,
        twitter_url: validatedSocial.twitter_url || null,
        facebook_url: validatedSocial.facebook_url || null,
        linkedin_url: validatedSocial.linkedin_url || null,
        tiktok_url: validatedSocial.tiktok_url || null
      }).eq('id', user.id);
      if (error) {
        if (error.code === '23505') {
          toast.error("Display name taken", {
            description: "This display name is already in use. Please choose another."
          });
          return;
        }
        throw error;
      }
      toast.success('Profile updated');
      setIsEditing(false);
      await loadProfile();
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setIsSaving(false);
    }
  };
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Signed out');
      navigate('/auth');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };
  if (!user) {
    return (
      <PageLayout defaultTab="map" notificationCount={0} headerConfig={{ hideSearch: true }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg" style={{ maxWidth: '1280px', marginLeft: 'auto', marginRight: 'auto', padding: 'clamp(16px, 3vw, 24px)' }}>
          <EmptyState icon={User} title="Sign in to view profile" description="Create an account to access your profile, manage settings, and track your activity" actionLabel="Sign In" onAction={() => navigate("/auth")} />
        </div>
      </PageLayout>
    );
  }
  if (isLoading) {
    return (
      <PageLayout defaultTab="map" headerConfig={{ hideSearch: true }}>
        <ProfilePageSkeleton />
      </PageLayout>
    );
  }

  return (
    <PageLayout defaultTab="map" headerConfig={{ hideSearch: true }}>
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg space-y-6">
          {/* Profile Hero */}
          <Card className="overflow-hidden bg-card/90 backdrop-blur-xl shadow-card border-primary/10 rounded-2xl">
            {/* Gradient banner */}
            <div className="relative h-28 sm:h-32 bg-gradient-to-br from-primary via-primary/70 to-accent">
              <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,hsl(var(--primary-glow)/0.4),transparent_50%),radial-gradient(circle_at_80%_60%,hsl(var(--accent)/0.4),transparent_50%)]" />
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="absolute top-3 right-3 bg-background/80 backdrop-blur-md hover:bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
              )}
            </div>

            <div className="px-5 sm:px-7 pb-6">
              {/* Avatar — overlaps banner */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 -mt-12 sm:-mt-14">
                <div className="relative mx-auto sm:mx-0 group">
                  <Avatar className="w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-card shadow-glow">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={displayName || "User avatar"} />
                    <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                      {displayName.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <>
                      <label
                        htmlFor="avatar-upload"
                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-lg ring-2 ring-card hover:bg-primary/90 hover:scale-105 active:scale-95 transition-transform focus-within:ring-2 focus-within:ring-primary/50"
                        aria-label="Upload new avatar"
                      >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      </label>
                      <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} className="sr-only" />
                    </>
                  )}
                </div>

                <div className="flex-1 min-w-0 text-center sm:text-left sm:pb-1">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground truncate" style={{ letterSpacing: '-0.02em' }}>
                    {displayName || 'User'}
                  </h1>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground truncate max-w-full">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                </div>
              </div>

              {/* Stat chips */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
                {[
                  { icon: Heart, label: 'Favorites', value: favorites.length },
                  { icon: Users, label: 'Connections', value: connections.length },
                  { icon: Bell, label: 'Alerts', value: 0 },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm py-3 px-2 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-primary mb-1" />
                    <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums" style={{ letterSpacing: '-0.02em' }}>
                      {value}
                    </div>
                    <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-6" />

            {/* Profile Form */}
              <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display Name *</Label>
                <Input id="display_name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your display name" maxLength={100} disabled={!isEditing} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself..." maxLength={500} rows={4} disabled={!isEditing} className="resize-none" />
                {isEditing && <p className="text-xs text-muted-foreground text-right">
                    {bio.length}/500
                  </p>}
              </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="space-y-2">
                  <Label>Gender <span className="text-destructive">*</span></Label>
                  <Select value={gender} onValueChange={setGender} disabled={!isEditing}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pronouns <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Select value={pronouns} onValueChange={setPronouns} disabled={!isEditing}>
                    <SelectTrigger className="bg-card">
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
                  <Separator className="my-6" />
                  
                  <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Label>Social Media Links</Label>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Instagram className="w-4 h-4 text-muted-foreground" />
                        <Input value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} placeholder="Instagram profile URL" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Twitter className="w-4 h-4 text-muted-foreground" />
                        <Input value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)} placeholder="Twitter/X profile URL" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Facebook className="w-4 h-4 text-muted-foreground" />
                        <Input value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)} placeholder="Facebook profile URL" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Linkedin className="w-4 h-4 text-muted-foreground" />
                        <Input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="LinkedIn profile URL" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-muted-foreground" />
                        <Input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="TikTok profile URL" />
                      </div>
                    </div>
                  </div>
                </>}

              {/* Social Links Display */}
              {!isEditing && (instagramUrl || twitterUrl || facebookUrl || linkedinUrl || tiktokUrl) && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-3">
                      <Link2 className="w-3 h-3" />
                      Social Media
                    </h3>
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
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border/50 bg-card/60 text-foreground text-sm font-semibold hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                          >
                            <Icon className="w-4 h-4 text-primary" />
                            {label}
                          </a>
                        ))}
                    </div>
                  </div>
                </>
              )}

              {isEditing && <div className="flex gap-2 pt-4" style={{ display: 'flex', gap: '8px', paddingTop: '16px' }}>
                  <Button onClick={handleSaveProfile} disabled={isSaving || !displayName.trim()} className="flex-1" variant="jet">
                    {isSaving ? <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </> : <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>}
                  </Button>
                  <Button onClick={() => {
                setIsEditing(false);
                setDisplayName(profile?.display_name || "");
                setBio(profile?.bio || "");
                setInstagramUrl(profile?.instagram_url || "");
                setTwitterUrl(profile?.twitter_url || "");
                setFacebookUrl(profile?.facebook_url || "");
                setLinkedinUrl(profile?.linkedin_url || "");
                setTiktokUrl(profile?.tiktok_url || "");
              }} variant="outline" disabled={isSaving}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>}
            </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Button variant="outline" className="h-20 justify-start" onClick={() => navigate("/settings")}
              style={{ height: '80px', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '16px', background: 'hsl(var(--card) / 0.9)', border: '1px solid hsl(var(--border) / 0.4)', borderRadius: '12px', cursor: 'pointer' }}>
              <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center"
                  style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.15))' }}>
                  <Settings className="w-5 h-5 text-primary" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>Settings</div>
                  <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>Notifications & preferences</div>
                </div>
              </div>
            </Button>

            <Button variant="outline" className="h-20 justify-start" onClick={() => navigate("/favorites")}
              style={{ height: '80px', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '16px', background: 'hsl(var(--card) / 0.9)', border: '1px solid hsl(var(--border) / 0.4)', borderRadius: '12px', cursor: 'pointer' }}>
              <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/15 to-primary/15 flex items-center justify-center"
                  style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, hsl(var(--accent) / 0.15), hsl(var(--primary) / 0.15))' }}>
                  <Heart className="w-5 h-5 text-accent" style={{ color: 'hsl(var(--accent))' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>Favorites</div>
                  <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>{favorites.length} saved deals</div>
                </div>
              </div>
            </Button>

            <Button variant="outline" className="h-20 justify-start" onClick={() => navigate("/social")}
              style={{ height: '80px', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '16px', background: 'hsl(var(--card) / 0.9)', border: '1px solid hsl(var(--border) / 0.4)', borderRadius: '12px', cursor: 'pointer' }}>
              <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center"
                  style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.1))' }}>
                  <Users className="w-5 h-5 text-accent" style={{ color: 'hsl(var(--accent))' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>Social</div>
                  <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>{connections.length} connections</div>
                </div>
              </div>
            </Button>

            {isAdmin && <Button variant="outline" className="h-20 justify-start" onClick={() => navigate("/admin")}
              style={{ height: '80px', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '16px', background: 'hsl(var(--card) / 0.9)', border: '1px solid hsl(var(--border) / 0.4)', borderRadius: '12px', cursor: 'pointer' }}>
                <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"
                    style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--destructive) / 0.1)' }}>
                    <Shield className="w-5 h-5 text-destructive" style={{ color: 'hsl(var(--destructive))' }} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>Admin</div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>Dashboard & analytics</div>
                  </div>
                </div>
              </Button>}
          </div>

          {/* Sign Out */}
          <Card className="p-4 bg-card/90 backdrop-blur-xl shadow-card border-primary/10" style={{ padding: '16px' }}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
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
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSignOut}>
                    Sign Out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </div>
    </PageLayout>
  );
}