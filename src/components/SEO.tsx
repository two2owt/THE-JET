import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
}

const SITE_URL = "https://www.jet-around.com";
const DEFAULT_OG = "https://www.jet-around.com/pwa-512x512.png";

/**
 * Per-route SEO tags. Sets unique title, description, canonical, and og:* tags
 * for the route. Falls back to sitewide defaults in index.html for crawlers
 * that don't execute JS.
 */
export function SEO({ title, description, path, ogImage = DEFAULT_OG }: SEOProps) {
  const url = `${SITE_URL}${path}`;
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
    </Helmet>
  );
}