import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDealsTool from "./tools/list-deals";
import listFavoritesTool from "./tools/list-favorites";
import saveFavoriteTool from "./tools/save-favorite";
import removeFavoriteTool from "./tools/remove-favorite";
import heatmapDensityTool from "./tools/heatmap-density";
import getJetcardTool from "./tools/get-jetcard";
import configureNotificationsTool from "./tools/configure-notifications";
import listActivityTool from "./tools/list-activity";
import whoamiTool from "./tools/whoami";

// Issuer must be the direct Supabase host, built from the project ref literal.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "jet-around",
  title: "JET-Around",
  version: "0.1.0",
  instructions:
    "Tools for JET-Around, a Charlotte, NC nightlife and deal discovery app. Use `list_deals` to find active deals, `list_favorites` / `save_favorite` / `remove_favorite` to manage the signed-in user's saved venues, `get_heatmap_density` for the latest anonymized crowd-density snapshot by time range and location, `get_jetcard` for the signed-in user's JetCard (membership status, associated merchant, last activity), `configure_notifications` to read or change the user's push/email notification settings, `list_activity` for the user's recent JetCard activity (timestamp, venue, action), and `whoami` to confirm the connected account.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDealsTool,
    listFavoritesTool,
    saveFavoriteTool,
    removeFavoriteTool,
    heatmapDensityTool,
    getJetcardTool,
    configureNotificationsTool,
    listActivityTool,
    whoamiTool,
  ],
});