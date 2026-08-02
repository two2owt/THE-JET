import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type DensityFeature = {
  properties?: { density?: number; intensity?: number };
  geometry?: { coordinates?: [number, number] };
};

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default defineTool({
  name: "get_heatmap_density",
  title: "Get heatmap density snapshot",
  description:
    "Return the latest aggregated, anonymized crowd-density snapshot (grid cells with activity counts) for a time range, optionally limited to a radius around a location in Charlotte, NC.",
  inputSchema: {
    time_window_minutes: z
      .number()
      .int()
      .min(1)
      .max(10080)
      .optional()
      .describe("How far back to look, in minutes (1 to 10080). Default 60."),
    latitude: z.number().min(-90).max(90).optional().describe("Center latitude to filter around."),
    longitude: z.number().min(-180).max(180).optional().describe("Center longitude to filter around."),
    radius_km: z
      .number()
      .min(0.1)
      .max(100)
      .optional()
      .describe("Radius in kilometers around the center point (default 5, requires latitude/longitude)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum number of density cells to return, busiest first (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { time_window_minutes, latitude, longitude, radius_km, limit },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if ((latitude === undefined) !== (longitude === undefined)) {
      return {
        content: [{ type: "text", text: "Provide both latitude and longitude, or neither." }],
        isError: true,
      };
    }

    const windowMinutes = time_window_minutes ?? 60;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.functions.invoke("get-location-density", {
      body: { time_window_minutes: windowMinutes },
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const features: DensityFeature[] = data?.geojson?.features ?? [];
    const radius = radius_km ?? 5;
    let cells = features
      .map((f) => {
        const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
        return {
          latitude: lat,
          longitude: lng,
          density: f.properties?.density ?? 0,
          intensity: f.properties?.intensity ?? 0,
        };
      })
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

    if (latitude !== undefined && longitude !== undefined) {
      cells = cells
        .map((c) => ({
          ...c,
          distance_km: Number(distanceKm(latitude, longitude, c.latitude, c.longitude).toFixed(3)),
        }))
        .filter((c) => c.distance_km <= radius);
    }

    cells.sort((a, b) => b.density - a.density);
    cells = cells.slice(0, limit ?? 50);

    const snapshot = {
      generated_at: new Date().toISOString(),
      time_window_minutes: windowMinutes,
      center:
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude, radius_km: radius }
          : null,
      total_points: data?.stats?.total_points ?? null,
      cells_returned: cells.length,
      cells,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
      structuredContent: snapshot,
    };
  },
});