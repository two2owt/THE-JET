import { auth, defineMcp, setLogLevel } from "@lovable.dev/mcp-js";
import { logServerBoot, withLogging } from "./logging";
import listDealsTool from "./tools/list-deals";
import listFavoritesTool from "./tools/list-favorites";
import saveFavoriteTool from "./tools/save-favorite";
import removeFavoriteTool from "./tools/remove-favorite";
import heatmapDensityTool from "./tools/heatmap-density";
import getJetcardTool from "./tools/get-jetcard";
import configureNotificationsTool from "./tools/configure-notifications";
import listActivityTool from "./tools/list-activity";
import listMyVenuesTool from "./tools/list-my-venues";
import pushPreferencesTool from "./tools/push-preferences";
import getTierBenefitsTool from "./tools/get-tier-benefits";
import listActivePromotionsTool from "./tools/list-active-promotions";
import whoamiTool from "./tools/whoami";

// Issuer must be the direct Supabase host, built from the project ref literal.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

const issuerUrl = `https://${projectRef}.supabase.co/auth/v1`;

// Verbose SDK logging (transport, JWT verification failures, 401 reasons).
setLogLevel("debug");

const tools = [
  listDealsTool,
  listFavoritesTool,
  saveFavoriteTool,
  removeFavoriteTool,
  heatmapDensityTool,
  getJetcardTool,
  configureNotificationsTool,
  listActivityTool,
  listMyVenuesTool,
  pushPreferencesTool,
  getTierBenefitsTool,
  listActivePromotionsTool,
  whoamiTool,
].map((tool) => withLogging(tool as never)) as unknown as Parameters<
  typeof defineMcp
>[0]["tools"];

logServerBoot({
  name: "jet-around",
  version: "0.1.0",
  issuer: issuerUrl,
  toolCount: tools.length,
});

export default defineMcp({
  name: "jet-around",
  title: "JET-Around",
  version: "0.1.0",
  instructions:
    "Tools for JET-Around, a Charlotte, NC nightlife and deal discovery app. Use `list_deals` to find active deals, `list_active_promotions` for the promotions currently available to the signed-in user with expiration dates, time remaining, and eligibility conditions (active days, redemption window, tier, saved status), `list_favorites` / `save_favorite` / `remove_favorite` to manage the signed-in user's saved venues, `list_my_venues` for every venue and deal associated with the account (favorites, reviews, shares) grouped by venue, `get_heatmap_density` for the latest anonymized crowd-density snapshot by time range and location, `get_jetcard` for the signed-in user's JetCard (membership status, associated merchant, last activity), `get_tier_benefits` for the benefits and promotions available to the user's current JetCard tier plus upgrade options, `configure_notifications` to read or change the user's overall push/email notification settings, `push_preferences` to view or update per-topic push preferences (JetCard updates, merchant offers, favorite venue alerts, ending-soon reminders, direct messages), `list_activity` for the user's recent JetCard activity (timestamp, venue, action), and `whoami` to confirm the connected account.",
  auth: auth.oauth.issuer({
    issuer: issuerUrl,
    acceptedAudiences: "authenticated",
  }),
  tools,
});
