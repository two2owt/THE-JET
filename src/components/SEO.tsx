import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  /** Set true on non-public routes (admin, onboarding, verification, 404) so crawlers skip them. */
  noindex?: boolean;
  /** Optional JSON-LD structured data (Article, LocalBusiness, Event, Offer, etc.). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const SITE_URL = "https://www.jet-around.com";
const DEFAULT_OG = "https://www.jet-around.com/pwa-512x512.png";

/**
 * Per-route SEO tags. Sets unique title, description, canonical, and og:* tags
 * for the route. Falls back to sitewide defaults in index.html for crawlers
 * that don't execute JS.
 */
export function SEO({ title, description, path, ogImage = DEFAULT_OG, noindex, jsonLd }: SEOProps) {
  const url = `${SITE_URL}${path}`;
  const jsonLdArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {jsonLdArray.map((data, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(data)}</script>
      ))}
    </Helmet>
  );
}