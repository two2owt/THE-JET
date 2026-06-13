import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Loader2, Upload, Check, ArrowLeft, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PreferencesStep, { PreferencesData } from "@/components/onboarding/PreferencesStep";
import { Json } from "@/integrations/supabase/types";
import jetLogo from "@/assets/jet-auth-logo.png";
import authBackground from "@/assets/auth-background.webp";
import { consumePostAuthRedirect } from "@/lib/postAuthRedirect";
import { useAuth } from "@/contexts/AuthContext";
import {
  readCachedOnboardingStatus,
  writeCachedOnboardingStatus,
} from "@/lib/onboardingStatus";

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
  const { session, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  // Gate the first paint until we've checked the session + resumed any
  // in-progress onboarding state. Prevents the Step 1 form from flashing
  // for users who are already onboarded (they will be redirected away).
  // Initial value is derived synchronously from AuthContext + a per-user
  // sessionStorage cache so already-known users never see the spinner.
  const initialChecking = (() => {
    if (authLoading) return true;
    if (!session) return false; // we'll redirect to /auth synchronously
    const cached = readCachedOnboardingStatus(session.user.id);
    // If we know they've already finished, we'll redirect immediately
    // without ever painting the spinner OR the form.
    return cached === null;
  })();
  const [isCheckingAuth, setIsCheckingAuth] = useState(initialChecking);
  
  // Step 1: Profile
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  
  // Step 1 validation errors
  const [step1Errors, setStep1Errors] = useState<{
    displayName?: string;
    birthdate?: string;
    gender?: string;
  }>({});
  
  
  // Step 2: Preferences
  const [savedPreferences, setSavedPreferences] = useState<PreferencesData | null>(null);

  useEffect(() => {
    // Wait for AuthContext to finish bootstrapping its session.
    if (authLoading) return;

    if (!session) {
      navigate("/auth", { replace: true });
      return;
    }

    const uid = session.user.id;
    setUserId(uid);

    // Fast-path: if cache says they're done, redirect synchronously —
    // no spinner, no profile fetch.
    const cached = readCachedOnboardingStatus(uid);
    if (cached === true) {
      navigate(consumePostAuthRedirect("/"), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "onboarding_completed, display_name, bio, avatar_url, birthdate, gender, pronouns, preferences"
          )
          .eq("id", uid)
          .single();

        if (cancelled) return;

        if (profile?.onboarding_completed) {
          writeCachedOnboardingStatus(uid, true);
          navigate(consumePostAuthRedirect("/"), { replace: true });
          return;
        }

        writeCachedOnboardingStatus(uid, false);

        if (profile) {
          if (profile.display_name) setDisplayName(profile.display_name);
          if (profile.bio) setBio(profile.bio);
          if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
          if (profile.birthdate) setBirthdate(profile.birthdate);
          if (profile.gender) setGender(profile.gender);
          if (profile.pronouns) setPronouns(profile.pronouns);

          const hasStep1 = !!(profile.display_name && profile.birthdate && profile.gender);
          const hasStep2 = !!profile.preferences;
          if (hasStep2) setStep(3);
          else if (hasStep1) setStep(2);
        }
      } finally {
        if (!cancelled) setIsCheckingAuth(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, navigate]);

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
    const errors: { displayName?: string; birthdate?: string; gender?: string } = {};

    if (!displayName.trim()) {
      errors.displayName = "Display name is required";
    }

    if (!birthdate) {
      errors.birthdate = "Birthdate is required";
    } else {
      const age = calculateAge(birthdate);
      if (age < 18) {
        errors.birthdate = "You must be 18 or older";
      }
    }

    if (!gender) {
      errors.gender = "Gender is required";
    }

    if (Object.keys(errors).length > 0) {
      setStep1Errors(errors);
      return;
    }

    setStep1Errors({});
    
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
      
      setDirection("forward");
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
      
      setDirection("forward");
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

      if (userId) writeCachedOnboardingStatus(userId, true);
      toast.success("Welcome to JET Charlotte!", { description: "Let's discover what's hot" });
      navigate(consumePostAuthRedirect("/"), { replace: true });
    } catch (error: any) {
      toast.error("Failed to complete onboarding", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };


  const STEPS = [
    { num: 1, label: "Profile", title: "Create your profile", description: "Tell us a little about yourself to get started." },
    { num: 2, label: "Preferences", title: "Tune your taste", description: "Pick the categories you love so we can curate Charlotte for you." },
    { num: 3, label: "Finish", title: "You're all set", description: "Based on your preferences, we'll surface the best of Charlotte." },
  ] as const;
  const current = STEPS[step - 1];
  const progressPct = Math.round((step / STEPS.length) * 100);

  const goBack = () => {
    if (step <= 1) return;
    setDirection("backward");
    setStep((s) => Math.max(1, s - 1));
  };

  // Enter-to-proceed on Step 1
  const handleStep1KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      const target = e.target as HTMLElement;
      // Don't intercept Enter inside textarea
      if (target.tagName === "TEXTAREA") return;
      e.preventDefault();
      handleStep1Next();
    }
  };

  // Hold the first paint while we determine session + onboarding state.
  // Prevents Step 1 from flashing for users who will be redirected away.
  if (isCheckingAuth) {
    return (
      <div
        className="relative flex flex-1 min-h-0 w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading onboarding…</span>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-1 min-h-0 w-full items-center justify-center overflow-y-auto bg-background bg-cover bg-center bg-no-repeat px-fluid-sm sm:px-fluid-md pt-[max(env(safe-area-inset-top,0px),var(--space-lg))] pb-[max(env(safe-area-inset-bottom,0px),var(--space-lg))]"
      style={{ backgroundImage: `url(${authBackground})` }}
    >
      {/* Animated matte black/grey gradient overlay */}
      <div className="absolute inset-0 auth-gradient-overlay" />
      {/* Editorial vignette — keeps focus on the card */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(0_0%_0%/0.55)_100%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[560px]">
        {/* Glassmorphic Card */}
        <div className="flex flex-col gap-6 sm:gap-8 rounded-3xl border-hairline bg-background/30 p-6 sm:p-8 lg:p-10 backdrop-blur-2xl glow-ambient">
          {/* Progress header */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              {step > 1 && step < 3 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <div className="h-7 w-12" aria-hidden />
              )}
              <img
                src={jetLogo}
                alt="JET"
                className="h-8 w-8 object-contain drop-shadow-[0_4px_20px_hsl(var(--primary)/0.35)]"
                width="32"
                height="32"
              />
              <span className="text-xs font-medium text-muted-foreground tabular-nums" aria-live="polite">
                {progressPct}%
              </span>
            </div>

            {/* Stepper: numbered with labels on desktop, dots on mobile */}
            <div
              className="hidden sm:flex items-center justify-between gap-2"
              role="list"
              aria-label={`Step ${step} of ${STEPS.length}`}
            >
              {STEPS.map((s, i) => {
                const completed = step > s.num;
                const active = step === s.num;
                return (
                  <div key={s.num} className="flex items-center gap-2 flex-1" role="listitem">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all ${
                        completed
                          ? "bg-primary border-primary text-primary-foreground"
                          : active
                          ? "bg-gradient-to-r from-primary to-primary-glow border-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                          : "bg-card/40 border-border text-muted-foreground"
                      }`}
                      aria-current={active ? "step" : undefined}
                    >
                      {completed ? <Check className="h-3.5 w-3.5" /> : s.num}
                    </div>
                    <span
                      className={`text-xs font-medium transition-colors ${
                        active ? "text-foreground" : completed ? "text-muted-foreground" : "text-muted-foreground/60"
                      }`}
                    >
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-px transition-colors ${
                          completed ? "bg-primary/70" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mobile dots */}
            <div className="flex sm:hidden items-center justify-center gap-2" aria-hidden>
              {STEPS.map((s) => (
                <div
                  key={s.num}
                  className={`h-1.5 rounded-full transition-all ${
                    s.num === step
                      ? "w-8 bg-gradient-to-r from-primary to-primary-glow shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                      : s.num < step
                      ? "w-2 bg-primary/60"
                      : "w-2 bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Title + description */}
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-foreground font-display">
                {current.title}
              </h1>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>

            {step === 2 && (
              <button
                type="button"
                onClick={() => { setDirection("forward"); setStep(3); }}
                className="self-start text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
              >
                Skip for now
              </button>
            )}
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div
              key="step-1"
              onKeyDown={handleStep1KeyDown}
              className={`flex flex-col gap-5 ${direction === "forward" ? "animate-fade-in" : "animate-fade-in"}`}
            >
            <div className="flex flex-col items-center">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName" className="heading-luxe-eyebrow text-left">
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="displayName"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className={step1Errors.displayName ? "focus-visible:!ring-destructive/30" : ""}
                aria-invalid={!!step1Errors.displayName}
                aria-describedby={step1Errors.displayName ? "displayName-error" : undefined}
                style={step1Errors.displayName ? { borderColor: "hsl(var(--destructive) / 0.7)" } : undefined}
              />
              {step1Errors.displayName && (
                <p id="displayName-error" className="field-error">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {step1Errors.displayName}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthdate" className="heading-luxe-eyebrow text-left">
                Birthdate <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                className={`bg-card/60 ${step1Errors.birthdate ? "focus-visible:!ring-destructive/30" : ""}`}
                aria-invalid={!!step1Errors.birthdate}
                aria-describedby={step1Errors.birthdate ? "birthdate-error" : undefined}
                style={step1Errors.birthdate ? { borderColor: "hsl(var(--destructive) / 0.7)" } : undefined}
              />
              {step1Errors.birthdate && (
                <p id="birthdate-error" className="field-error">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {step1Errors.birthdate}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="heading-luxe-eyebrow text-left">
                  Gender <span className="text-destructive">*</span>
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger
                    className={`bg-card/60 ${step1Errors.gender ? "!border-destructive/70 focus:!ring-destructive/30 focus:!border-destructive/60" : ""}`}
                    aria-invalid={!!step1Errors.gender}
                    aria-describedby={step1Errors.gender ? "gender-error" : undefined}
                  >
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
                {step1Errors.gender && (
                  <p id="gender-error" className="field-error">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {step1Errors.gender}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
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

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleStep1Next}
                disabled={isLoading}
                variant="jet"
                size="lg"
                className="w-full sm:w-auto sm:min-w-[180px] rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
              </Button>
            </div>
            </div>
          )}

          {/* Step 2: Preferences */}
          {step === 2 && (
            <div key="step-2" className="animate-fade-in">
              <PreferencesStep
                onBack={() => { setDirection("backward"); setStep(1); }}
                onNext={handleStep2Next}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* Step 3: Suggestions */}
          {step === 3 && (
            <div key="step-3" className="flex flex-col gap-6 animate-fade-in">
            <div className="flex flex-col gap-5">
              <div className="relative bg-gradient-to-br from-primary/15 to-primary-glow/10 rounded-2xl p-6 sm:p-8 border border-primary/30 backdrop-blur-sm text-center overflow-hidden">
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.25),transparent_70%)]" />
                <div className="relative">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 animate-scale-in">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <h3 className="heading-luxe-card mb-fluid-xs">All Set!</h3>
                <p className="text-fluid-sm text-muted-foreground">
                  Based on your preferences, we'll show you the best deals in Charlotte
                </p>
                </div>
              </div>

              {savedPreferences && (
                <div className="flex flex-col gap-3 rounded-xl border-hairline bg-card/30 p-4 sm:p-5 backdrop-blur-sm">
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
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Go to Dashboard"}
            </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
