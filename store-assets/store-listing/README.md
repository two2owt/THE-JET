# Store Listing Screenshots

All shots are pre-sized, cover-cropped from the master renders in
`store-assets/screenshots/ready/`, and named in upload order.

## Upload order (identical on both stores)

| # | Filename slug          | Caption                                       |
|---|------------------------|-----------------------------------------------|
| 1 | `01-discover-live-map` | Discover Charlotte's live nightlife map       |
| 2 | `02-venue-jetcard`     | Real-time venue insights on every JetCard     |
| 3 | `03-save-favorites`    | Save the venues you love                      |
| 4 | `04-chat-crew`         | Chat and plan with your crew                  |
| 5 | `05-customize-layers`  | Customize the map to your vibe                |

## Apple App Store Connect

Upload the same 5 files to each required device size. As of iOS 18,
only the 6.9" set is mandatory; the 6.5" set is provided for older
review pipelines and iPad-less accounts.

| Folder                          | Device                        | Pixels     | Required |
|---------------------------------|-------------------------------|------------|----------|
| `ios/6.9-inch_1320x2868/`       | iPhone 16 Pro Max / 15 Pro Max| 1320x2868  | Yes      |
| `ios/6.5-inch_1242x2688/`       | iPhone 11 Pro Max / XS Max    | 1242x2688  | Fallback |

iPad 13" (2064x2752) is not included — add only if you enable iPad
distribution.

## Google Play Console

Play requires 2–8 phone screenshots, 16:9 or 9:16, min side 1080 px,
max side 3840 px. Upload the 1080x1920 set as the primary and the
1440x2560 set for higher-DPI previews.

| Folder                                | Form factor      | Pixels     | Required |
|---------------------------------------|------------------|------------|----------|
| `android/phone_1080x1920/`            | Phone (baseline) | 1080x1920  | Yes      |
| `android/phone_1440x2560/`            | Phone (hi-DPI)   | 1440x2560  | Optional |
| `android/tablet-7in_1200x1920/`       | 7" tablet        | 1200x1920  | Optional |

## Localization-ready structure

English (US) is the source. To add a locale, duplicate any device
folder under a locale suffix and swap in the translated captions —
file names and ordering stay identical so uploads stay 1:1:

```text
ios/6.9-inch_1320x2868/         # en-US (default)
ios/6.9-inch_1320x2868.es-MX/   # Spanish (Mexico)
ios/6.9-inch_1320x2868.fr-FR/   # French (France)
android/phone_1080x1920/        # en-US
android/phone_1080x1920.es-419/ # Spanish (Latin America)
```

Only the on-image caption text needs re-rendering per locale; the
underlying UI screenshots are locale-neutral (map, icons, timestamps
localize at runtime via the app).

## Regenerate

```bash
python /tmp/resize.py
```

Source of truth: `store-assets/screenshots/ready/*.png` (1450x2992).