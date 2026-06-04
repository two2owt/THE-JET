import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { Mail, Lock, Loader2, ShieldAlert, Save, AtSign } from "lucide-react";

/**
 * Account management section: email change, password change, delete account.
 *
 * Validation is per-field with inline error messages. Success/failure
 * surface as toasts. Email changes go through Supabase confirmation flow —
 * the user must click the link sent to their NEW email before it takes
 * effect.
 */

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .max(255, "Email must be less than 255 characters"),
});

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be less than 72 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[a-z]/, "Include at least one lowercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type FieldErrors = Record<string, string | undefined>;

interface AccountSectionProps {
  userId: string;
  currentEmail: string | undefined;
}

export function AccountSection({ userId, currentEmail }: AccountSectionProps) {
  // Email state
  const [newEmail, setNewEmail] = useState("");
  const [emailErrors, setEmailErrors] = useState<FieldErrors>({});
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Password state
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwErrors, setPwErrors] = useState<FieldErrors>({});
  const [isSavingPw, setIsSavingPw] = useState(false);

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailErrors({});

    const parsed = emailSchema.safeParse({ email: newEmail });
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setEmailErrors(errs);
      return;
    }

    if (parsed.data.email.toLowerCase() === (currentEmail || "").toLowerCase()) {
      setEmailErrors({ email: "This is already your current email" });
      return;
    }

    setIsSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: parsed.data.email },
        { emailRedirectTo: `${window.location.origin}/verification-success` }
      );
      if (error) throw error;

      toast.success("Confirmation email sent", {
        description: `Click the link sent to ${parsed.data.email} to complete the change.`,
      });
      setNewEmail("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update email";
      setEmailErrors({ email: message });
      toast.error("Couldn't update email", { description: message });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErrors({});

    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setPwErrors(errs);
      return;
    }

    setIsSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) throw error;

      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update password";
      setPwErrors({ password: message });
      toast.error("Couldn't update password", { description: message });
    } finally {
      setIsSavingPw(false);
    }
  };

  return (
    <Card className="p-5 sm:p-7 bg-card/90 backdrop-blur-xl shadow-card border-primary/10 rounded-2xl space-y-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
          <ShieldAlert className="w-4 h-4 text-primary" />
          Account
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage your sign-in email, password, and account.
        </p>
      </header>

      {/* Change email */}
      <form onSubmit={handleChangeEmail} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="account-email" className="flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
            Email address
          </Label>
          <p className="text-xs text-muted-foreground">
            Current: <span className="font-medium text-foreground">{currentEmail ?? "—"}</span>
          </p>
          <Input
            id="account-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              if (emailErrors.email) setEmailErrors({});
            }}
            aria-invalid={!!emailErrors.email}
            aria-describedby={emailErrors.email ? "account-email-error" : undefined}
            disabled={isSavingEmail}
          />
          {emailErrors.email && (
            <p id="account-email-error" role="alert" className="text-xs font-medium text-destructive">
              {emailErrors.email}
            </p>
          )}
        </div>
        <Button type="submit" variant="jet" disabled={isSavingEmail || !newEmail.trim()} className="rounded-full shadow-lg shadow-primary/20 font-semibold tracking-wide">
          {isSavingEmail ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending confirmation…
            </>
          ) : (
            <>
              <Mail className="w-4 h-4 mr-2" />
              Change email
            </>
          )}
        </Button>
      </form>

      <Separator />

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="account-password" className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            New password
          </Label>
          <Input
            id="account-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (pwErrors.password) setPwErrors((prev) => ({ ...prev, password: undefined }));
            }}
            aria-invalid={!!pwErrors.password}
            aria-describedby={pwErrors.password ? "account-password-error" : "account-password-hint"}
            disabled={isSavingPw}
          />
          {pwErrors.password ? (
            <p id="account-password-error" role="alert" className="text-xs font-medium text-destructive">
              {pwErrors.password}
            </p>
          ) : (
            <p id="account-password-hint" className="text-xs text-muted-foreground">
              Use 8+ characters with uppercase, lowercase, and a number.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="account-password-confirm">Confirm new password</Label>
          <Input
            id="account-password-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (pwErrors.confirm) setPwErrors((prev) => ({ ...prev, confirm: undefined }));
            }}
            aria-invalid={!!pwErrors.confirm}
            aria-describedby={pwErrors.confirm ? "account-password-confirm-error" : undefined}
            disabled={isSavingPw}
          />
          {pwErrors.confirm && (
            <p id="account-password-confirm-error" role="alert" className="text-xs font-medium text-destructive">
              {pwErrors.confirm}
            </p>
          )}
        </div>

        <Button type="submit" variant="jet" disabled={isSavingPw || !password || !confirm}>
          {isSavingPw ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Updating…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Update password
            </>
          )}
        </Button>
      </form>

      <Separator />

      {/* Delete account */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-destructive">Danger zone</h3>
        <p className="text-xs text-muted-foreground">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <DeleteAccountDialog userId={userId} />
      </div>
    </Card>
  );
}