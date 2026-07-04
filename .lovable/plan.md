# Map Layers panel: sliders + realtime sync

Bring the map's Layers control up to the same fidelity as the rest of the Dark Luxe UI: give users direct control over heatmap look, the time window that feeds the data, and time-lapse playback speed. Also make sure the density + movement-paths layers stay in sync with realtime location changes and with the sliders themselves.

## What's added to the Layers panel

Under **Heatmap** (visible only when the density layer is on):

- **Intensity** slider — 0.5x to 2.0x multiplier on the heatmap intensity stops.
- **Radius** slider — 0.5x to 2.0x multiplier on the heatmap radius stops.
- **Opacity** slider — 0 to 100% (scales the base opacity stops).
- **Time window** slider — "Last N minutes" with snap points at 15m / 1h / 6h / 24h / 7d. Replaces the existing `time` select when the slider is used; the select stays available as a preset.

Under **Paths** (visible only when the movement paths layer is on):

- **Time window** slider — same control as heatmap, scoped to paths.
- The existing min-frequency range input stays, restyled to match.

Under **Time-lapse** (visible only when Time-lapse mode is on):

- Replace the 0.5x / 1x / 2x buttons with a **Speed** slider (0.25x - 4x, log-scale snap points).
- Keep the transport buttons (back / play / forward) and hour scrubber.

All new sliders use shadcn `Slider`, styled to match the existing glassmorphic pills (primary→primary-glow gradient, hairline border, gold tick marks on snap points). Values persist in localStorage under the existing `jet-map-*` key scheme.

## Realtime sync

The density and paths hooks already subscribe to `user_locations` INSERTs, but paths refetch on every event and both hooks skip UPDATE/DELETE. Tighten this so the map reflects live data without hammering the edge functions:

- Add a shared 500-800ms debounce to `useMovementPaths` (matches `useLocationDensity`).
- Subscribe to `*` (INSERT + UPDATE + DELETE) so obfuscated / deleted rows also invalidate.
- Ensure `user_locations` is in the `supabase_realtime` publication (migration if missing).
- On slider drag end, force a `refresh()` in the corresponding hook so the user always sees the effect of their change — Mapbox paint changes apply instantly, data-window changes trigger a single fresh query.
- Re-run the "grid_cells" / "total_paths" chips off the same data so the Live Stats mini-chips never diverge from the layer.
- Pause the realtime debounce timer while the tab is hidden (already tracked via `isTabVisible`) so a backgrounded map doesn't queue a burst of refetches on return.

## Technical details

**New shared component** `src/components/map/LayerSliderRow.tsx` — labelled slider with min/max/step, snap ticks, live value pill, and optional reset button. Same visual language as `LayerToggleRow`.

**`src/components/MapboxHeatmap.tsx`**
- New state: `heatmapIntensity` (0.5-2), `heatmapRadius` (0.5-2), `heatmapOpacity` (0-1), `densityWindowMinutes` (number | null; null = use `timeFilter`), `pathsWindowMinutes` (number | null), and continuous `timelapseSpeedContinuous`.
- Persist to localStorage keys `jet-map-heat-intensity`, `jet-map-heat-radius`, `jet-map-heat-opacity`, `jet-map-density-window`, `jet-map-paths-window`, extend `getPersistedTimelapseSpeed` to accept any number in [0.25, 4].
- The heatmap paint block currently uses `interpolate` stops for `heatmap-intensity`, `heatmap-radius`, and `heatmap-opacity`. Wrap those stop values with the multipliers so a slider change becomes a `map.setPaintProperty(layerId, 'heatmap-*', newStops)` call inside a new small `useEffect` keyed on the multiplier state — no full layer rebuild.
- Pass `windowMinutes` into the hooks and drop it from the URL sync (keeps URLs stable).

**`src/hooks/useLocationDensity.ts` / `useMovementPaths.ts`**
- Add optional `windowMinutes?: number` filter. When set, it takes precedence over `timeFilter` in the request body / query string.
- Movement paths: add the same 500ms debounce pattern already used in density.
- Both hooks: switch the postgres_changes filter from `INSERT` to `*`.

**Edge functions** `supabase/functions/get-location-density/index.ts` and `.../get-movement-paths/index.ts`
- Accept a new `time_window_minutes` (or `window_minutes` for paths) request parameter.
- When present, filter `user_locations` by `created_at > now() - interval '<n> minutes'` instead of the coarse `time_filter` bucket.
- Reject values outside [1, 10080] (7 days) — protects the 15 req/min public rate limit.

**Migration** — only if `user_locations` is missing from `supabase_realtime`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
```

**`src/hooks/useHeatmapTimelapse.ts`**
- Loosen the `VALID_SPEEDS` guard so any positive number in [0.25, 4] is accepted (persist / restore).
- No API change; the existing `setSpeed(n)` already accepts arbitrary numbers.

## Out of scope

- The Open Venues, Deals, and Live Stats layers (user asked only for Density + Paths).
- Any change to admin-only RLS or the underlying `user_locations` table shape.
- New charts / analytics beyond keeping the existing Live Stats chips synced.

## Files touched

- `src/components/map/LayerSliderRow.tsx` (new)
- `src/components/MapboxHeatmap.tsx`
- `src/hooks/useLocationDensity.ts`
- `src/hooks/useMovementPaths.ts`
- `src/hooks/useHeatmapTimelapse.ts`
- `supabase/functions/get-location-density/index.ts`
- `supabase/functions/get-movement-paths/index.ts`
- `supabase/migrations/*_realtime_user_locations.sql` (conditional)
