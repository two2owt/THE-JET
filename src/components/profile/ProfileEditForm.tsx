import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Save,
  Twitter,
  Video,
} from "lucide-react";

export const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

export const PRONOUN_OPTIONS = [
  { value: "she/her", label: "She/Her" },
  { value: "he/him", label: "He/Him" },
  { value: "they/them", label: "They/Them" },
  { value: "she/they", label: "She/They" },
  { value: "he/they", label: "He/They" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

export interface ProfileEditFormValues {
  displayName: string;
  bio: string;
  gender: string;
  pronouns: string;
  instagramUrl: string;
  twitterUrl: string;
  facebookUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
}

interface ProfileEditFormProps {
  values: ProfileEditFormValues;
  setValue: <K extends keyof ProfileEditFormValues>(key: K, val: ProfileEditFormValues[K]) => void;
  fieldErrors: Record<string, string | undefined>;
  clearFieldError: (key: string) => void;
  isSaving: boolean;
  onSave: () => void;
}

/**
 * Single focused edit form. Renders identity fields + social links
 * + sticky save bar. Parent owns state and validation.
 */
export function ProfileEditForm({
  values,
  setValue,
  fieldErrors,
  clearFieldError,
  isSaving,
  onSave,
}: ProfileEditFormProps) {
  const socialFields = [
    { key: "instagramUrl" as const, icon: Instagram, placeholder: "Instagram profile URL" },
    { key: "twitterUrl" as const, icon: Twitter, placeholder: "Twitter/X profile URL" },
    { key: "facebookUrl" as const, icon: Facebook, placeholder: "Facebook profile URL" },
    { key: "linkedinUrl" as const, icon: Linkedin, placeholder: "LinkedIn profile URL" },
    { key: "tiktokUrl" as const, icon: Video, placeholder: "TikTok profile URL" },
  ];

  return (
    <div className="rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg">
      <div className="mb-fluid-md flex items-center gap-2">
        <span className="dot-gold shrink-0" />
        <span className="heading-luxe-eyebrow">Edit Profile</span>
      </div>

      <div className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
        {/* Display Name */}
        <div className="flex flex-col" style={{ gap: "var(--space-xs)" }}>
          <Label htmlFor="display_name" className="heading-luxe-eyebrow text-left">
            Display Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="display_name"
            value={values.displayName}
            onChange={(e) => {
              setValue("displayName", e.target.value);
              if (fieldErrors.display_name) clearFieldError("display_name");
            }}
            placeholder="Your display name"
            maxLength={100}
            aria-invalid={!!fieldErrors.display_name}
            aria-describedby={fieldErrors.display_name ? "display_name-error" : undefined}
            className="profile-input w-full"
          />
          {fieldErrors.display_name && (
            <p id="display_name-error" role="alert" className="text-xs font-medium text-destructive">
              {fieldErrors.display_name}
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="flex flex-col" style={{ gap: "var(--space-xs)" }}>
          <Label htmlFor="bio" className="heading-luxe-eyebrow text-left">
            Bio <span className="text-muted-foreground/70 normal-case">(optional)</span>
          </Label>
          <Textarea
            id="bio"
            value={values.bio}
            onChange={(e) => {
              setValue("bio", e.target.value);
              if (fieldErrors.bio) clearFieldError("bio");
            }}
            placeholder="Tell us about yourself..."
            maxLength={500}
            rows={4}
            className="resize-none profile-textarea w-full"
            aria-invalid={!!fieldErrors.bio}
            aria-describedby={fieldErrors.bio ? "bio-error" : undefined}
          />
          {fieldErrors.bio && (
            <p id="bio-error" role="alert" className="text-xs font-medium text-destructive">
              {fieldErrors.bio}
            </p>
          )}
          <p className="text-xs text-muted-foreground text-right">{values.bio.length}/500</p>
        </div>

        {/* Gender + Pronouns */}
        <div className="profile-2col-grid grid" style={{ gap: "var(--space-sm)" }}>
          <div className="flex flex-col min-w-0" style={{ gap: "var(--space-xs)" }}>
            <Label className="heading-luxe-eyebrow text-left">
              Gender <span className="text-destructive">*</span>
            </Label>
            <Select
              value={values.gender}
              onValueChange={(v) => {
                setValue("gender", v);
                if (fieldErrors.gender) clearFieldError("gender");
              }}
            >
              <SelectTrigger className="bg-card/60 profile-select-trigger w-full">
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
            {fieldErrors.gender && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {fieldErrors.gender}
              </p>
            )}
          </div>

          <div className="flex flex-col min-w-0" style={{ gap: "var(--space-xs)" }}>
            <Label className="heading-luxe-eyebrow text-left">
              Pronouns <span className="text-muted-foreground/70 normal-case">(optional)</span>
            </Label>
            <Select value={values.pronouns} onValueChange={(v) => setValue("pronouns", v)}>
              <SelectTrigger className="bg-card/60 profile-select-trigger w-full">
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

        {/* Social Links */}
        <div className="divider-luxe my-fluid-md" />
        <div className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
          <div className="flex items-center gap-2">
            <span className="dot-gold shrink-0" />
            <span className="heading-luxe-eyebrow">Social Media Links</span>
          </div>
          {socialFields.map(({ key, icon: Icon, placeholder }) => (
            <div key={key} className="profile-social-row">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={values[key]}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder={placeholder}
                className="profile-input w-full"
              />
            </div>
          ))}
        </div>

        {/* Save */}
        <div className="flex" style={{ gap: "var(--space-sm)", paddingTop: "var(--space-md)" }}>
          <Button
            onClick={onSave}
            disabled={isSaving || !values.displayName.trim()}
            variant="jet"
            size="lg"
            className="flex-1 rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProfileEditForm;