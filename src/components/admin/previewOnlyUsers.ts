/**
 * Accounts that exist in the preview (test) backend but not in Live.
 * Snapshot taken 2026-08-18 — 25 accounts.
 *
 * Paste-ready for the "Re-create users" panel. Display names are only carried
 * over when the user actually claimed one; auto-generated `jet_xxxxxx` handles
 * are omitted so Live mints a fresh handle.
 */
export type PreviewOnlyUser = {
  email: string;
  display_name: string | null;
  onboarding_completed: boolean;
};

export const PREVIEW_ONLY_USERS: PreviewOnlyUser[] = [
  { email: "parksneeditall@gmail.com", display_name: "Eskimogl0", onboarding_completed: true },
  { email: "brandon.hodges@branchvilleinc.com", display_name: "B RAD", onboarding_completed: true },
  { email: "nvg0909@yahoo.com", display_name: "Sarai", onboarding_completed: true },
  { email: "cbxtiste@gmail.com", display_name: null, onboarding_completed: true },
  { email: "rc.harris215@gmail.com", display_name: null, onboarding_completed: true },
  { email: "yaganmaya@gmail.com", display_name: "MayaY", onboarding_completed: true },
  { email: "samanthamiller620@gmail.com", display_name: null, onboarding_completed: true },
  { email: "miamonk7@gmail.com", display_name: null, onboarding_completed: false },
  { email: "ellacutionist@gmail.com", display_name: null, onboarding_completed: true },
  { email: "demarcussoublet@gmail.com", display_name: null, onboarding_completed: true },
  { email: "morrowa38@yahoo.com", display_name: null, onboarding_completed: true },
  { email: "hookahdiva23@gmail.com", display_name: null, onboarding_completed: true },
  { email: "digitalerainc@gmail.com", display_name: null, onboarding_completed: true },
  { email: "jonathank76@yahoo.com", display_name: null, onboarding_completed: false },
  { email: "jefferychheang@gmail.com", display_name: null, onboarding_completed: true },
  { email: "talenthidden8@gmail.com", display_name: null, onboarding_completed: false },
  { email: "itwasjohnny@gmail.com", display_name: null, onboarding_completed: false },
  { email: "thatguydk22@gmail.com", display_name: null, onboarding_completed: true },
  { email: "lennard.hunt@gmail.com", display_name: null, onboarding_completed: true },
  { email: "keshonmcfadden17@gmail.com", display_name: null, onboarding_completed: true },
  { email: "daylenburden444@gmail.com", display_name: null, onboarding_completed: true },
  { email: "todo80swamp@icloud.com", display_name: null, onboarding_completed: true },
  { email: "jordan.leach.shs@gmail.com", display_name: null, onboarding_completed: true },
  { email: "laura.cordellassociates@gmail.com", display_name: "KOCOPOLA ✨", onboarding_completed: true },
  { email: "daniellaandrea@ymail.com", display_name: null, onboarding_completed: false },
];

/** Lines for the manual paste box: `email | Display Name`. */
export const previewOnlyUsersAsText = () =>
  PREVIEW_ONLY_USERS.map((u) =>
    u.display_name ? `${u.email} | ${u.display_name}` : u.email,
  ).join("\n");
