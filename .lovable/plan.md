# Split MapboxHeatmap into smaller components

Goal: cut `src/components/MapboxHeatmap.tsx` (~4,570 LOC) into a lean container plus focused hooks and presentational components. No behavior change, no restyle — pure refactor.

## Guiding rules
- One file per concern, ≤400 LOC target.
- Keep the container as the single owner of `map.current` and cross-cutting state; children stay presentational.
- Extract Mapbox layer logic into hooks so effects live next to their layer.
- No prop-drilling gymnastics: expose a small `MapLayersController` context to share layer state/refs with the panel.

## Target file layout

```text
src/components/map/
  MapboxHeatmap.tsx                  container + map lifecycle (target ≤700 LOC)
  MapLayersContext.tsx               Provider + hook: layer state, refs, refresh callbacks
  panels/
    LayersPanel.tsx                  responsive shell (Sheet mobile / floating card desktop)
    LayersPanelBody.tsx              chips + toggle rows + slider groups + reset
    HeatLayerSection.tsx             Heatmap toggle + intensity/radius/opacity/time-window/time-lapse
    PathsLayerSection.tsx            Flow Paths toggle + filters + time-window + min-frequency
    ParkingLayerSection.tsx          Parking toggle
    LiveStatsSection.tsx             Live Stats toggle + inline LiveStatsPanel wrapper
    OpenNowSection.tsx               Open Now filter toggle
    TimelapseControls.tsx            Play/pause/step/scrub/speed slider
    LegendPanel.tsx                  Bottom-left legend (extract lines 4244–~4400)
    MapStyleControls.tsx             Top-left location + style controls (lines 3033–3260)
  hooks/
    useDensityLayer.ts               builds/removes location-density-heat source+layer
    useDensityPaint.ts               paint-only setPaintProperty for intensity/radius/opacity
    useMovementPathsLayer.ts         builds paths + particles + rAF flow animation cleanup
    useParkingLayer.ts               toggles parking-icons visibility
    useLayerPersistence.ts           localStorage + URL param sync for toggles + filters
    useLayerResetDefaults.ts         handleResetToDefaults (already fixed to reset all)
```

Existing `LayerToggleRow`, `LayerSliderRow`, `LiveStatsPanel` stay in `src/components/map/`.

## Extraction phases

Each phase compiles + typechecks green before moving on.

1. **Hooks first (no UI change).**
   - Move density build effect (L1669–1842) into `useDensityLayer(map, { showDensityLayer, densityData, timelapseMode, timelapse, isMobile })`.
   - Move density paint effect (L1852–1889) into `useDensityPaint(map, { heatIntensity, heatRadius, heatOpacity, mapLoaded, isMobile, showDensityLayer, densityData, timelapseMode, timelapse })`.
   - Move paths + animation (L1920–2235) into `useMovementPathsLayer`.
   - Move parking toggle side-effects into `useParkingLayer`.
   - Move persistence blocks (LAYER_KEYS / FILTER_KEYS effects L482–518) into `useLayerPersistence`.

2. **Presentational panel extraction.**
   - Create `MapLayersContext` exposing layer state + setters + refresh callbacks.
   - Wrap the container render subtree with `<MapLayersProvider value={…}>` and consume inside panel components.
   - Move JSX for each section (heat, paths, parking, live stats, open now, time-lapse, reset) into its own file. Preserve exact styles/props.
   - `LayersPanel` keeps the responsive `Sheet` vs floating-card shell already introduced.

3. **Peripheral UI extraction.**
   - `MapStyleControls.tsx` — location + style switcher block.
   - `LegendPanel.tsx` — bottom-left legend.

4. **Container slim-down.**
   - After extractions, `MapboxHeatmap.tsx` retains: props, map init, source/data effects that don't fit a single layer, venue-marker rendering, wiring the extracted hooks and panels.

## Verification per phase
- `bunx tsgo --noEmit` clean.
- Manual check via preview: toggle each layer, drag each slider, run time-lapse, hit Reset. No behavioral drift.

## Out of scope
- No visual redesign.
- No changes to edge functions, hooks under `src/hooks/` (`useLocationDensity`, `useMovementPaths`, `useHeatmapTimelapse`), or `LiveStatsPanel`.
- Security scan findings surfaced separately — not touched here.

## Risk & mitigation
- The big risk is silently breaking effect dep arrays when moving them into hooks. Mitigation: copy dep arrays verbatim into each new hook signature; only convert closure vars into hook params. Each hook keeps the same console.log lines so it's easy to spot regressions in the preview.
- Rollback is per-phase — each phase is one commit's worth of changes.

Approve and I'll execute phase 1 first, then check in.