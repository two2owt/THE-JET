import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Loader2, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PreferencesStep, { PreferencesData } from "@/components/onboarding/PreferencesStep";
import { Json } from "@/integrations/supabase/types";
import jetLogo from "@/assets/jet-auth-logo.png";
import authBackground from "@/assets/auth-background.webp";
import { consumePostAuthRedirect } from "@/lib/postAuthRedirect";

const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

const PRONOUN_OPTIONS = [
  { value: "she/her", label: "She/Her" },
  { value: "he/him", label: "He/Him" },
  { value: "they/them", label: "They/Them" },
  { value: "she/they", label: "She/They" },
  { value: "he/they", label: "He/They" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Step 1: Profile
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  
  // Step 2: Preferences
  const [savedPreferences, setSavedPreferences] = useState<PreferencesData | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      setUserId(session.user.id);
      
      // Check if already completed onboarding
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", session.user.id)
        .single();
      
      if (profile?.onboarding_completed) {
        navigate(consumePostAuthRedirect("/"), { replace: true });
      }
    };
    
    checkAuth();
  }, [navigate]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large", { description: "Please select an image under 5MB" });
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateAge = (birthdate: string): number => {
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const checkDisplayNameUnique = async (name: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("display_name", name)
      .neq("id", userId || "")
      .limit(1);
    
    if (error) return true; // Allow on error to not block user
    return !data || data.length === 0;
  };

  const handleStep1Next = async () => {
    // Validate display name
    if (!displayName.trim()) {
      toast.error("Display name required", { description: "Please enter a display name" });
      return;
    }

    // Validate birthdate
    if (!birthdate) {
      toast.error("Birthdate required", { description: "Please enter your birthdate" });
      return;
    }

    // Validate age is 18+
    const age = calculateAge(birthdate);
    if (age < 18) {
      toast.error("Age restriction", { description: "You must be 18 or older to create an account" });
      return;
    }

    // Validate gender
    if (!gender) {
      toast.error("Gender required", { description: "Please select your gender" });
      return;
    }
    
    setIsLoading(true);
    try {
      // Check if display name is unique
      const isUnique = await checkDisplayNameUnique(displayName.trim());
      if (!isUnique) {
        toast.error("Display name taken", { description: "This display name is already in use. Please choose another." });
        setIsLoading(false);
        return;
      }

      let avatarUrl = null;
      
      // Upload avatar if provided
      if (avatarFile && userId) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${userId}/avatar.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        avatarUrl = publicUrl;
      }
      
      // Use upsert to handle cases where profile might not exist yet
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          display_name: displayName.trim(),
          bio: bio || null,
          avatar_url: avatarUrl,
          birthdate: birthdate,
          gender: gender,
          pronouns: pronouns || null,
        }, {
          onConflict: 'id'
        });
      
      if (error) {
        if (error.code === '23505') {
          toast.error("Display name taken", { description: "This display name is already in use. Please choose another." });
          return;
        }
        throw error;
      }
      
      setStep(2);
    } catch (error: any) {
      toast.error("Failed to save profile", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2Next = async (preferences: PreferencesData) => {
    setIsLoading(true);
    setSavedPreferences(preferences);
    try {
      const preferencesJson = {
        categories: preferences.categories,
        food: preferences.food,
        drink: preferences.drink,
        nightlife: preferences.nightlife,
        events: preferences.events,
        trendingVenues: preferences.trendingVenues,
        activityInArea: preferences.activityInArea,
      };
      
      const { error } = await supabase
        .from("profiles")
        .update({
          preferences: preferencesJson as unknown as Json,
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      setStep(3);
    } catch (error: any) {
      toast.error("Failed to save preferences", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          onboarding_completed: true
        }, {
          onConflict: 'id'
        });
      
      if (error) throw error;
      
      toast.success("Welcome to JET Charlotte!", { description: "Let's discover what's hot" });
      navigate(consumePostAuthRedirect("/"), { replace: true });
    } catch (error: any) {
      toast.error("Failed to complete onboarding", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };


  const eyebrow =
    step === 1 ? "Create Profile" : step === 2 ? "Personalize" : "All Set";
  const headline =
    step === 1 ? "Welcome to JET" : step === 2 ? "Tune Your Taste" : "You're In";
  const subtitle =
    step === 1
      ? "Tell us a little about yourself to get started."
      : step === 2
      ? "Pick the categories you love so we can curate Charlotte for you."
      : "Based on your preferences, we'll surface the best of Charlotte.";

  return (
    <div
      className="relative flex flex-1 min-h-0 w-full items-center justify-center overflow-y-auto bg-background bg-cover bg-center bg-no-repeat px-fluid-sm sm:px-fluid-md pt-[max(env(safe-area-inset-top,0px),var(--space-lg))] pb-[max(env(safe-area-inset-bottom,0px),var(--space-lg))]"
      style={{ backgroundImage: `url(${authBackground})` }}
    >
      {/* Animated matte black/grey gradient overlay */}
      <div className="absolute inset-0 auth-gradient-overlay" />
      {/* Editorial vignette — keeps focus on the card */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(0_0%_0%/0.55)_100%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[420px] sm:max-w-md">
        {/* Glassmorphic Card */}
        <div className="flex flex-col gap-fluid-sm sm:gap-fluid-md rounded-3xl border-hairline bg-background/30 p-fluid-sm sm:p-fluid-md lg:p-fluid-lg backdrop-blur-2xl glow-ambient">
          {/* Header */}
          <div className="flex flex-col items-center gap-fluid-xs sm:gap-fluid-sm text-center">
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.25)_0%,transparent_70%)] blur-md" />
              <img
                src={jetLogo}
                alt="JET Logo"
                className="relative h-full w-full object-contain drop-shadow-[0_4px_20px_hsl(var(--primary)/0.35)]"
                width="80"
                height="80"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="dot-gold" />
              <span className="heading-luxe-eyebrow">{eyebrow}</span>
              <span className="dot-gold" />
            </div>
            <h1 className="heading-luxe-gradient">{headline}</h1>
            <div className="divider-luxe mx-auto" style={{ maxWidth: "72px" }} />
            <p className="max-w-xs text-fluid-sm text-muted-foreground">
              {subtitle}
            </p>

            {/* Progress dots */}
            <div className="mt-fluid-xs flex items-center justify-center gap-2" aria-label={`Step ${step} of 3`}>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${
                    s === step
                      ? "w-8 bg-gradient-to-r from-primary to-primary-glow shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                      : s < step
                      ? "w-2 bg-primary/60"
                      : "w-2 bg-muted"
                  }`}
                />
              ))}
            </div>

            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="mt-fluid-xs rounded-full px-3 py-1 text-fluid-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Skip for now
              </button>
            )}
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div className="flex flex-col gap-fluid-sm sm:gap-fluid-md">
            <div className="flex flex-col items-center mb-fluid-lg">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-card/40 border border-border/60 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" width={96} height={96} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-r from-primary to-primary-glow rounded-full flex items-center justify-center cursor-pointer shadow-md shadow-primary/30 transition-transform hover:scale-105">
                  <Upload className="w-4 h-4 text-primary-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Upload profile picture</p>
            </div>

            <div className="flex flex-col gap-fluid-xs">
              <Label htmlFor="displayName" className="heading-luxe-eyebrow text-left">
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="displayName"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="flex flex-col gap-fluid-xs">
              <Label htmlFor="bio" className="heading-luxe-eyebrow text-left">
                Bio <span className="text-muted-foreground/70 normal-case">(optional)</span>
              </Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/200</p>
            </div>

            <div className="flex flex-col gap-fluid-xs">
              <Label htmlFor="birthdate" className="heading-luxe-eyebrow text-left">
                Birthdate <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                className="bg-card/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-fluid-xs">
                <Label className="heading-luxe-eyebrow text-left">
                  Gender <span className="text-destructive">*</span>
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="bg-card/60">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-fluid-xs">
                <Label className="heading-luxe-eyebrow text-left">
                  Pronouns <span className="text-muted-foreground/70 normal-case">(optional)</span>
                </Label>
                <Select value={pronouns} onValueChange={setPronouns}>
                  <SelectTrigger className="bg-card/60">
                    <SelectValue placeholder="Select pronouns" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRONOUN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleStep1Next}
              disabled={isLoading}
              variant="jet"
              size="lg"
              className="mt-fluid-xs w-full rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
            </Button>
            </div>
          )}

          {/* Step 2: Preferences */}
          {step === 2 && (
            <PreferencesStep
              onBack={() => setStep(1)}
              onNext={handleStep2Next}
              isLoading={isLoading}
            />
          )}

          {/* Step 3: Suggestions */}
          {step === 3 && (
            <div className="flex flex-col gap-fluid-md">
            <div className="space-y-fluid-md">
              <div className="bg-gradient-to-br from-primary/15 to-primary-glow/10 rounded-2xl p-fluid-lg border border-primary/30 backdrop-blur-sm text-center">
                <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-primary mb-fluid-md mx-auto" />
                <h3 className="heading-luxe-card mb-fluid-xs">All Set!</h3>
                <p className="text-fluid-sm text-muted-foreground">
                  Based on your preferences, we'll show you the best deals in Charlotte
                </p>
              </div>

              {savedPreferences && (
                <div className="flex flex-col gap-fluid-sm rounded-xl border-hairline bg-card/30 p-fluid-sm sm:p-fluid-md backdrop-blur-sm">
                  <p className="heading-luxe-eyebrow">Your Preferences</p>
                  <div className="flex flex-wrap gap-fluid-xs">
                    {savedPreferences.categories.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 bg-primary/15 border border-primary/30 text-primary text-fluid-xs font-medium rounded-full"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                  {savedPreferences.trendingVenues && (
                    <p className="text-fluid-sm text-muted-foreground flex items-center gap-fluid-xs">
                      <span className="dot-gold" /> Trending venues enabled
                    </p>
                  )}
                  {savedPreferences.activityInArea && (
                    <p className="text-fluid-sm text-muted-foreground flex items-center gap-fluid-xs">
                      <span className="dot-gold" /> Location-based alerts enabled
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleComplete}
              disabled={isLoading}
              variant="jet"
              size="lg"
              className="w-full rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Get Started"}
            </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
