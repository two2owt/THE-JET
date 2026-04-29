import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Dev-only QA harness for avatar containment.
 *
 * Renders the <Avatar> primitive at every size used in the app, with
 * synthetic uploads that exercise extreme portrait, extreme landscape,
 * and square aspect ratios. Used by the cross-browser/device test
 * matrix in src/test/avatar-matrix.test.tsx and by manual browser
 * runs (mobile Chrome / iOS Safari / tablet) via the /dev/avatars route.
 *
 * Each cell is data-testid'd so automation can:
 *   - resolve the wrapper rect
 *   - resolve the inner <img> rect
 *   - assert img rect ⊆ wrapper rect (no overflow) at real CSS rendering
 */

// Use inline SVG data URLs so the harness has zero network dependencies and
// the browser reports exact natural dimensions for object-fit calculations.
function svgDataUrl(w: number, h: number, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ec4899"/>
        <stop offset="1" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <text x="50%" y="50%" fill="#fff" font-size="${Math.min(w, h) / 4}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ASPECTS = [
  { key: "portrait", w: 200, h: 4000, label: "P" },   // 1:20
  { key: "landscape", w: 4000, h: 200, label: "L" },  // 20:1
  { key: "square", w: 1024, h: 1024, label: "S" },
  { key: "tall", w: 600, h: 1600, label: "T" },       // typical phone selfie
  { key: "wide", w: 1600, h: 600, label: "W" },       // typical banner
] as const;

// Every avatar size used across the app (header, social cards, chat,
// messages list, profile hero). Keep in sync with call sites.
const SIZES = [
  { key: "xs", className: "w-6 h-6" },     // 24px
  { key: "sm", className: "w-8 h-8" },     // 32px — chat header
  { key: "md", className: "w-9 h-9" },     // 36px — share-to-friend
  { key: "lg", className: "w-10 h-10" },   // 40px — social cards
  { key: "xl", className: "w-12 h-12" },   // 48px — messages list
  { key: "2xl", className: "w-16 h-16" },  // 64px — connection dialog
  { key: "3xl", className: "w-24 h-24" },  // 96px — profile hero (mobile)
  { key: "4xl", className: "w-28 h-28" },  // 112px — profile hero (desktop)
] as const;

export default function AvatarQA() {
  return (
    <div
      data-testid="avatar-qa-root"
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        background: "hsl(var(--background))",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: "18px", fontWeight: 700, color: "hsl(var(--foreground))" }}>
        Avatar containment matrix
      </h1>
      <p style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>
        Each row = aspect ratio. Each column = avatar size used in the app.
        Inner image must never paint outside the circular wrapper.
      </p>

      {ASPECTS.map((a) => (
        <section key={a.key} data-testid={`row-${a.key}`}>
          <h2
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
              marginBottom: "8px",
            }}
          >
            {a.key} — {a.w}×{a.h}
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "16px",
              flexWrap: "wrap",
              padding: "12px",
              background: "hsl(var(--muted))",
              borderRadius: "12px",
            }}
          >
            {SIZES.map((s) => (
              <div
                key={s.key}
                data-testid={`cell-${a.key}-${s.key}`}
                data-aspect={a.key}
                data-size={s.key}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}
              >
                <Avatar
                  className={s.className}
                  data-testid={`avatar-${a.key}-${s.key}`}
                >
                  <AvatarImage
                    src={svgDataUrl(a.w, a.h, a.label)}
                    alt={`${a.key} ${s.key}`}
                    data-testid={`img-${a.key}-${s.key}`}
                  />
                  <AvatarFallback>{a.label}</AvatarFallback>
                </Avatar>
                <span
                  style={{
                    fontSize: "10px",
                    color: "hsl(var(--muted-foreground))",
                    fontFamily: "monospace",
                  }}
                >
                  {s.key}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}