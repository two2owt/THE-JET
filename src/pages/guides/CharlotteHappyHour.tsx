import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Bell } from "lucide-react";
import { useNavigate, Link } from "react-router";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";

const NEIGHBORHOODS = [
  {
    name: "Uptown / First Ward",
    window: "Weekdays 4–7pm",
    what: "After-work crowds, half-price craft cocktails and $6 draft lists around Tryon and College Street.",
  },
  {
    name: "South End",
    window: "Weekdays 3–6:30pm, Sunday all day",
    what: "Rail Trail patios with discounted local IPAs, $1 oysters, and late reverse happy hours after 9pm.",
  },
  {
    name: "Plaza Midwood",
    window: "Weekdays 4–7pm",
    what: "Dive-bar pricing, cheap tallboys, and rotating drink-and-snack combos on Central Avenue.",
  },
  {
    name: "NoDa",
    window: "Weekdays 4–6pm",
    what: "Brewery taprooms with flight discounts, plus food-truck pairings on North Davidson.",
  },
  {
    name: "Dilworth / Southside",
    window: "Weekdays 4–6:30pm",
    what: "Wine-by-the-glass deals and shareable apps along East Boulevard.",
  },
  {
    name: "Ballantyne / Blakeney",
    window: "Weekdays 4–7pm",
    what: "Suburban patio bars with $5 house pours and family-friendly early specials.",
  },
];

const FAQ = [
  {
    q: "What time is happy hour in Charlotte?",
    a: "Most Charlotte bars and restaurants run happy hour on weekdays from 4pm to 7pm. South End and NoDa spots often start at 3pm, and a growing number add a reverse happy hour after 9pm.",
  },
  {
    q: "Which Charlotte neighborhood has the best happy hour deals?",
    a: "South End has the highest density of happy hour specials, followed by Uptown for after-work crowds and Plaza Midwood for the cheapest drinks per dollar.",
  },
  {
    q: "Can I see Charlotte happy hours in real time?",
    a: "Yes. JET shows live, merchant-posted happy hour deals on a real-time map so you only see specials that are actually running right now.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Best Charlotte Happy Hour Deals (2026 Guide)",
    description:
      "A neighborhood-by-neighborhood guide to the best happy hour deals in Charlotte, NC — times, price ranges, and how to find live specials near you.",
    author: { "@type": "Organization", name: "JET" },
    publisher: { "@type": "Organization", name: "JET" },
    mainEntityOfPage: "https://www.jet-around.com/guides/charlotte-happy-hour",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
];

const CharlotteHappyHour = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-background flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <SEO
        title="Best Charlotte Happy Hour Deals — 2026 Guide | JET"
        description="Where to find the best happy hour deals in Charlotte, NC — by neighborhood, with typical times, prices, and live specials happening right now."
        path="/guides/charlotte-happy-hour"
        jsonLd={jsonLd}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-8 pb-16">
        <Button onClick={() => navigate(-1)} variant="ghost" className="mb-fluid-lg gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <article className="max-w-none">
          <h1
            className="text-4xl font-extrabold mb-3"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)), hsl(var(--accent)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Best Charlotte Happy Hour Deals
          </h1>
          <p className="text-muted-foreground mb-8">
            A neighborhood guide to Charlotte happy hour — and how to see what&apos;s actually running right now.
          </p>

          <section className="mb-10">
            <p className="text-foreground/90 mb-4">
              Charlotte happy hour is one of the best value windows in the city: most bars and restaurants
              discount drinks and shareable plates on weekdays between <strong>4pm and 7pm</strong>, and a
              growing number of South End and NoDa spots add a late-night reverse happy hour after 9pm.
            </p>
            <p className="text-foreground/90">
              Printed lists go stale fast — venues change specials weekly. JET solves that by showing
              merchant-posted deals on a live map, so every special you see is one a venue confirmed is
              active today.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Charlotte happy hour by neighborhood</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {NEIGHBORHOODS.map((n) => (
                <div key={n.name} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-lg font-bold mb-1">{n.name}</h3>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    {n.window}
                  </p>
                  <p className="text-sm text-foreground/90">{n.what}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">How to find live happy hour deals near you</h2>
            <ol className="list-decimal pl-6 space-y-3 text-foreground/90">
              <li>
                <strong>Open the live map.</strong> The JET heatmap shows where Charlotte is busy right now,
                so you can pick a block that&apos;s already buzzing.
              </li>
              <li>
                <strong>Tap a venue.</strong> Each card shows whether the venue is open, what deal is active,
                and when it expires.
              </li>
              <li>
                <strong>Save your favorites.</strong> Favorited venues push you an alert the moment they post
                a new happy hour special.
              </li>
            </ol>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Happy hour tips that actually save money</h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>Mondays and Tuesdays carry the deepest discounts — weekend specials are usually thinner.</li>
              <li>Bar seating is often required for happy hour pricing; patios sometimes aren&apos;t included.</li>
              <li>Reverse happy hours (9pm onward) beat early windows in South End and NoDa.</li>
              <li>Check the expiration on a deal before you drive — Charlotte specials frequently end at 6:30pm.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Frequently asked questions</h2>
            <div className="space-y-5">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <h3 className="text-lg font-semibold mb-1">{f.q}</h3>
                  <p className="text-foreground/90">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 mb-10">
            <h2 className="text-2xl font-bold mb-2">See tonight&apos;s Charlotte deals live</h2>
            <p className="text-foreground/90 mb-4">
              Skip the outdated lists. Open the real-time map and see which Charlotte venues have a happy hour
              running right now.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="jet" asChild>
                <Link to="/">
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  Open the live map
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/favorites">
                  <Bell className="w-4 h-4" aria-hidden="true" />
                  Get deal alerts
                </Link>
              </Button>
            </div>
          </section>
        </article>
      </div>
      <Footer />
    </div>
  );
};

export default CharlotteHappyHour;
