import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Users, Loader2, Calendar, Instagram, Twitter, Facebook, Linkedin } from "lucide-react";

interface ConnectionProfileDialogProps {
  connectionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
);

interface SecureProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  birthdate: string | null;
  gender: string | null;
  pronouns: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
}

export function ConnectionProfileDialog({ connectionId, isOpen, onClose }: ConnectionProfileDialogProps) {
  const [profile, setProfile] = useState<SecureProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connectionId && isOpen) {
      fetchProfile();
    }
  }, [connectionId, isOpen]);

  const fetchProfile = async () => {
    if (!connectionId) return;
    
    setLoading(true);
    try {
      // Use profiles_secure view - privacy settings are already applied at database level
      const { data, error } = await supabase
        .from("profiles_secure")
        .select("id, display_name, avatar_url, bio, birthdate, gender, pronouns, instagram_url, twitter_url, facebook_url, linkedin_url, tiktok_url")
        .eq("id", connectionId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  // profiles_secure view already applies privacy filters, no client-side filtering needed
  const filteredProfile = profile;

  const socialLinks = filteredProfile ? [
    { url: filteredProfile.instagram_url, icon: Instagram, label: "Instagram" },
    { url: filteredProfile.twitter_url, icon: Twitter, label: "Twitter" },
    { url: filteredProfile.facebook_url, icon: Facebook, label: "Facebook" },
    { url: filteredProfile.linkedin_url, icon: Linkedin, label: "LinkedIn" },
    { url: filteredProfile.tiktok_url, icon: TikTokIcon, label: "TikTok" },
  ].filter(link => link.url) : [];

  const formatBirthdate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredProfile ? (
          <div className="space-y-4">
            {/* Avatar and Name */}
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20">
                <AvatarImage src={filteredProfile.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {filteredProfile.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {filteredProfile.display_name || "User"}
                </h3>
                {(filteredProfile.gender || filteredProfile.pronouns) && (
                  <p className="text-sm text-muted-foreground">
                    {[filteredProfile.gender, filteredProfile.pronouns].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* Bio */}
            {filteredProfile.bio && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">About</p>
                  <p className="text-sm text-foreground">{filteredProfile.bio}</p>
                </div>
              </>
            )}

            {/* Birthdate */}
            {filteredProfile.birthdate && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-foreground">
                    Birthday: {formatBirthdate(filteredProfile.birthdate)}
                  </p>
                </div>
              </>
            )}

            {/* Social Links */}
            {socialLinks.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Social Links</p>
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map((link) => (
                      <Button
                        key={link.label}
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a href={link.url!} target="_blank" rel="noopener noreferrer">
                          <link.icon className="w-4 h-4 mr-1" />
                          {link.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* No visible info message */}
            {!filteredProfile.bio && 
             !filteredProfile.birthdate && 
             !filteredProfile.gender && 
             !filteredProfile.pronouns && 
             socialLinks.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                This user has chosen to keep their profile information private.
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Profile not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
