import { getPublicBaseUrl } from "./seo";

export interface PublicMetaOptions {
  path?: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  image?: string;
}

/**
 * Generates comprehensive, production-ready SEO head metadata for public and auth pages.
 * Compatible with TanStack Router route head definitions.
 * 
 * Includes canonical URLs, Open Graph tags, Twitter Cards, robots directives,
 * and site branding.
 */
export function publicMeta(
  title: string,
  description: string,
  optionsOrPath?: string | PublicMetaOptions
) {
  const options: PublicMetaOptions =
    typeof optionsOrPath === "string" ? { path: optionsOrPath } : optionsOrPath ?? {};

  const siteName = "CAREFLOW AI";
  const fullTitle = title.includes(siteName) ? title : `${title} — ${siteName}`;
  const baseUrl = getPublicBaseUrl();
  const canonicalPath = options.path ? (options.path.startsWith("/") ? options.path : `/${options.path}`) : "";
  const canonicalUrl = canonicalPath === "/" ? `${baseUrl}/` : `${baseUrl}${canonicalPath}`;
  const ogType = options.ogType ?? "website";
  const ogImage = options.image ?? `${baseUrl}/favicon.ico`;
  const robotsDirective = options.noindex ? "noindex, nofollow" : "index, follow";

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { name: "robots", content: robotsDirective },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: ogType },
    { property: "og:site_name", content: siteName },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
  ];

  if (canonicalPath) {
    meta.push({ property: "og:url", content: canonicalUrl });
  }

  if (ogImage) {
    meta.push({ property: "og:image", content: ogImage });
    meta.push({ name: "twitter:image", content: ogImage });
  }

  const links: Array<Record<string, string>> = [];
  if (canonicalPath) {
    links.push({ rel: "canonical", href: canonicalUrl });
  }

  return { meta, links };
}
