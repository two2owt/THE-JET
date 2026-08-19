/**
 * Accounts that exist in the 2026-08-19 preview backup but have no auth account
 * in Live — 27 accounts.
 *
 * `id` is the original preview user id. The bulk-provisioning function recreates
 * each account with that exact id, so every already-restored row (locations,
 * messages, favorites, preferences…) attaches to the right person automatically
 * instead of orphaning behind a freshly minted uuid.
 */
export type PreviewOnlyUser = {
  /** Original preview auth user id — reused when recreating the account. */
  id: string;
  email: string;
  display_name: string | null;
  onboarding_completed: boolean;
};

export const PREVIEW_ONLY_USERS: PreviewOnlyUser[] = [
  { id: "7ab8e126-641c-4edb-8665-edc84516c2c0", email: "parksneeditall@gmail.com", display_name: "Eskimogl0", onboarding_completed: true },
  { id: "54004bc6-16ba-4f90-9ff9-7661ac5b6f5b", email: "brandon.hodges@branchvilleinc.com", display_name: "B RAD", onboarding_completed: true },
  { id: "7f05e65d-05f7-4f96-98e5-35b940d2fe99", email: "nvg0909@yahoo.com", display_name: "Sarai", onboarding_completed: true },
  { id: "57dd67f5-856f-47ea-b10b-def5ef145e25", email: "cbxtiste@gmail.com", display_name: null, onboarding_completed: true },
  { id: "9be9ffc7-7b5d-4719-99ef-3abf17cb35c1", email: "rc.harris215@gmail.com", display_name: null, onboarding_completed: true },
  { id: "94acd2bb-bf58-48e6-b2c3-4f684609ab77", email: "yaganmaya@gmail.com", display_name: "MayaY", onboarding_completed: true },
  { id: "c0076ccb-294f-418f-8ecd-beb455130f2c", email: "samanthamiller620@gmail.com", display_name: null, onboarding_completed: true },
  { id: "e748a8bf-0148-4847-90db-67fb799bfa38", email: "miamonk7@gmail.com", display_name: null, onboarding_completed: false },
  { id: "ac87405f-6513-4039-ba35-a952ce5e40e7", email: "simplisticsincerity@gmail.com", display_name: null, onboarding_completed: true },
  { id: "5da56b4c-b682-4800-aa2d-daf6ef7ffa4d", email: "ellacutionist@gmail.com", display_name: null, onboarding_completed: true },
  { id: "6b8eecc3-7d8f-49e4-a1e6-3bdc663f93d3", email: "demarcussoublet@gmail.com", display_name: null, onboarding_completed: true },
  { id: "05fcc6f6-0ffa-48f1-9401-25486a0ec4a3", email: "morrowa38@yahoo.com", display_name: null, onboarding_completed: true },
  { id: "63ee4bde-6f11-437f-8747-5fd67ffd897e", email: "hookahdiva23@gmail.com", display_name: null, onboarding_completed: true },
  { id: "c41ec4f0-8932-4a47-b7e7-57b8a3f25d39", email: "digitalerainc@gmail.com", display_name: null, onboarding_completed: true },
  { id: "f8cd0dbb-0c86-47e3-9dfb-69c538777936", email: "jonathank76@yahoo.com", display_name: null, onboarding_completed: false },
  { id: "ff08f66f-3bf1-4ea1-a36a-8350b8e10330", email: "jefferychheang@gmail.com", display_name: null, onboarding_completed: true },
  { id: "a60b0c1a-04dd-4f82-9a10-f083f3ed88f7", email: "talenthidden8@gmail.com", display_name: null, onboarding_completed: false },
  { id: "0aa494f4-9e51-4a29-981e-0ca85659e226", email: "itwasjohnny@gmail.com", display_name: null, onboarding_completed: false },
  { id: "2ca801f2-2b89-48b9-ba88-3448bedf795f", email: "thatguydk22@gmail.com", display_name: null, onboarding_completed: true },
  { id: "ef6908ab-faac-42ca-bc93-adf2260cb3ed", email: "lennard.hunt@gmail.com", display_name: null, onboarding_completed: true },
  { id: "f2984584-a26a-416e-8a4c-0e4dcb957da5", email: "keshonmcfadden17@gmail.com", display_name: null, onboarding_completed: true },
  { id: "47aba3d4-e7b2-405f-97d3-6072af28e954", email: "daylenburden444@gmail.com", display_name: null, onboarding_completed: true },
  { id: "5da3ff9e-d2d9-4c2f-8f78-a81d89851080", email: "todo80swamp@icloud.com", display_name: null, onboarding_completed: true },
  { id: "29e67396-24fa-493b-8443-578146560e32", email: "jordan.leach.shs@gmail.com", display_name: null, onboarding_completed: true },
  { id: "677734a2-b20b-475b-b791-32c07c55e5e9", email: "laura.cordellassociates@gmail.com", display_name: "KOCOPOLA ✨", onboarding_completed: true },
  { id: "d1f7d295-4c3d-4344-b274-16f38016ed55", email: "daniellaandrea@ymail.com", display_name: null, onboarding_completed: false },
  { id: "f8a4dac3-49d6-40f7-a198-44adecb8e37e", email: "mariahferguson22@gmail.com", display_name: "Riah", onboarding_completed: true },
];

/** Lines for the manual paste box: `email | Display Name`. */
export const previewOnlyUsersAsText = () =>
  PREVIEW_ONLY_USERS.map((u) =>
    u.display_name ? `${u.email} | ${u.display_name}` : u.email,
  ).join("\n");
