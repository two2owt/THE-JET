# Screenshot Release Checklist

Verified: all required slots filled. Each folder contains 5/5 PNGs in canonical order:
`01-map-heatmap → 02-jetcard → 03-favorites → 04-messages → 05-layers-sheet`

Legend: [x] present & size-verified · [ ] missing · (req) required by store · (opt) optional

## Apple App Store Connect

Apple requires at least one screenshot for the largest supported iPhone display; other sizes inherit if not supplied. We ship both 6.9" and 6.5" for maximum device coverage.

| Locale | 6.9" (1320×2868) req | 6.5" (1242×2688) opt* | Count |
|---|---|---|---|
| en-US (default) | [x] | [x] | 5/5 + 5/5 |
| es-MX | [x] | [x] | 5/5 + 5/5 |
| fr-FR | [x] | [x] | 5/5 + 5/5 |

*6.5" is technically optional when 6.9" is supplied, but recommended so older iPhone customers see native-resolution assets.

iPad, 5.5", and Apple Watch slots: **not required** (app is iPhone-only per current Capacitor target). Leave empty in App Store Connect.

App Preview video (opt): `/mnt/documents/jet-promo.mp4` (25s, 1080×1920 H.264) — upload to 6.9" and 6.5" slots, en-US only for launch.

## Google Play Console

Play requires 2–8 phone screenshots; tablet screenshots are optional but unlock the "Designed for tablets" badge.

| Locale | Phone 1080×1920 (req) | Phone 1440×2560 (opt) | 7" Tablet 1200×1920 (opt) | Count |
|---|---|---|---|---|
| en-US (default) | [x] | [x] | [x] | 5/5 × 3 |
| es-419 | [x] | [x] | [x] | 5/5 × 3 |
| fr-FR | [x] | [x] | [x] | 5/5 × 3 |

10" tablet, TV, Wear, Auto slots: **not required** — leave empty.

Feature graphic (req, 1024×500): **TODO** — not yet generated. Block release until added to `store-assets/store-listing/android/feature-graphic/`.
Promo video (opt): upload `jet-promo.mp4` to YouTube and paste URL in Play Console.

## Cross-store required assets

| Asset | Status | Path |
|---|---|---|
| App icon 1024×1024 (iOS + Play) | [x] | `store-assets/app-icon-1024.png` |
| Play feature graphic 1024×500 | [ ] | pending |
| App Store promo text (170 char) | [x] | `COPY.md` |
| Play short description (80 char) | [x] | `COPY.md` |
| Full description (both stores) | [x] | `COPY.md` |
| Keywords (App Store, 100 char) | [x] | `COPY.md` |
| What's New / Release notes | [x] | `COPY.md` |
| Localized captions (en/es/fr) | [x] | `CAPTIONS_LOCALIZED.md` |

## Pre-upload sign-off

- [x] Every folder contains exactly 5 PNGs
- [x] Filenames sort `01…05` for correct display order
- [x] Dimensions match store requirements (verified in prior pass)
- [x] No macOS chrome / desktop frames on iOS shots (re-rendered)
- [x] Android bottom nav visible after 9:16 crop
- [ ] Play feature graphic 1024×500 generated
- [ ] Final visual review by product owner

Release is **blocked** on the two unchecked items above. Everything else is upload-ready.