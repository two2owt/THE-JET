# Localized screenshot folders

Naming convention: `<device-folder>.<locale>/` per README. UI screenshots
are locale-neutral; only on-image caption overlays (see `CAPTIONS.md`)
need re-rendering per locale before upload.

## Apple App Store Connect locales
| Locale  | Apple code | Folders |
|---------|-----------|---------|
| English (US) — default | `en-US` | `ios/6.9-inch_1320x2868/`, `ios/6.5-inch_1242x2688/` |
| Spanish (Mexico) | `es-MX` | `.es-MX` sibling of each iOS folder |
| French (France)  | `fr-FR` | `.fr-FR` sibling of each iOS folder |

## Google Play Console locales
| Locale  | Play code | Folders |
|---------|-----------|---------|
| English (US) — default | `en-US` | `android/phone_1080x1920/`, `phone_1440x2560/`, `tablet-7in_1200x1920/` |
| Spanish (Latin America) | `es-419` | `.es-419` sibling of each Android folder |
| French (France) | `fr-FR` | `.fr-FR` sibling of each Android folder |

## Captions (translate before upload)
| # | en-US                                        | es (MX/419)                                     | fr-FR                                            |
|---|----------------------------------------------|--------------------------------------------------|--------------------------------------------------|
| 1 | Discover Charlotte's live nightlife map      | Descubre el mapa en vivo de la noche en Charlotte | Découvrez la carte live de la vie nocturne à Charlotte |
| 2 | Real-time venue insights on every JetCard    | Datos en tiempo real de cada lugar en tu JetCard  | Infos en temps réel sur chaque JetCard           |
| 3 | Save the venues you love                     | Guarda los lugares que te encantan                | Enregistrez vos lieux préférés                   |
| 4 | Chat and plan with your crew                 | Chatea y organiza planes con tu grupo             | Discutez et organisez avec votre équipe          |
| 5 | Customize the map to your vibe               | Personaliza el mapa a tu estilo                   | Personnalisez la carte à votre style             |

Filenames stay identical across every locale so uploads map 1:1.
