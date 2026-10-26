/**
 * SEO, Canonical URL, Robots.txt, and Sitemap.xml Configuration for CAREFLOW AI.
 * 
 * Ensures valid metadata, search engine crawler directives, and compliance with
 * Google OAuth verification requirements.
 */

export interface CanonicalRouteConfig {
  path: string;
  title: string;
  description: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

/**
 * All canonical, publicly indexable pages on the CAREFLOW AI platform.
 * Excludes authenticated workspaces, role-based modules, invitation links,
 * and transient authentication flows.
 */
export const CANONICAL_PUBLIC_ROUTES: CanonicalRouteConfig[] = [
  {
    path: "/",
    title: "Clinic Management for Modern Practices",
    description: "CAREFLOW AI brings patients, appointments, queues, consultations, and billing together in one calm clinic operations workspace.",
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    path: "/about",
    title: "About CAREFLOW AI",
    description: "About CAREFLOW AI — a secure, role-based clinic operations and patient management platform for clinic owners, doctors, staff, and patients.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/pricing",
    title: "Pricing Plans",
    description: "Transparent subscription plans for CAREFLOW AI clinic operations, practice management, and patient coordination.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/contact",
    title: "Contact Us",
    description: "Get in touch with the CAREFLOW AI team for clinic onboarding, support inquiries, or practice management questions.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "CAREFLOW AI Privacy Policy — detailing clinic data handling, patient management security, role-based privacy, and Google Gmail OAuth integration.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "CAREFLOW AI Terms of Service — service terms, clinic responsibilities, acceptable use, and account rules for our clinic operations platform.",
    changefreq: "monthly",
    priority: 0.7,
  },
];

/**
 * Returns the production-ready public base URL.
 * Configurable via APP_URL, VITE_APP_URL, SITE_URL, or VERCEL_URL.
 * NEVER defaults to localhost in canonical URLs or sitemaps.
 */
export function getPublicBaseUrl(): string {
  // 1. Explicit app/site URL configuration
  if (typeof process !== "undefined" && process.env) {
    const candidate = process.env["APP_URL"] || process.env["VITE_APP_URL"] || process.env["SITE_URL"];
    if (candidate && candidate.trim()) {
      return candidate.trim().replace(/\/+$/, "");
    }
  }

  // 2. Vite client-side environment variable if available
  if (typeof import.meta !== "undefined" && (import.meta as any).env) {
    const metaEnv = (import.meta as any).env;
    const candidate = metaEnv.VITE_APP_URL || metaEnv.VITE_SITE_URL || metaEnv.APP_URL;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/\/+$/, "");
    }
  }

  // 3. Vercel deployment URL
  if (typeof process !== "undefined" && process.env && process.env["VERCEL_URL"]) {
    const vUrl = process.env["VERCEL_URL"].trim();
    if (vUrl) {
      return vUrl.startsWith("http://") || vUrl.startsWith("https://")
        ? vUrl.replace(/\/+$/, "")
        : `https://${vUrl.replace(/\/+$/, "")}`;
    }
  }

  // 4. Production default base URL
  return "https://careflow-ai-ten.vercel.app";
}

/**
 * Reads Google Search Console verification token from environment.
 * Never hardcodes or fabricates a token.
 */
export function getGoogleSiteVerification(): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const token = process.env["GOOGLE_SITE_VERIFICATION"] || process.env["VITE_GOOGLE_SITE_VERIFICATION"];
    if (token && token.trim()) {
      return token.trim();
    }
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env) {
    const token = (import.meta as any).env.VITE_GOOGLE_SITE_VERIFICATION;
    if (typeof token === "string" && token.trim()) {
      return token.trim();
    }
  }
  return undefined;
}

/**
 * Generates the robots.txt content with explicit allow rules for canonical public pages,
 * disallow rules for private workspaces and auth routes, and the sitemap location.
 */
export function generateRobotsTxt(baseUrl = getPublicBaseUrl()): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `# CAREFLOW AI Robots Directive
# https://careflow-ai-ten.vercel.app

User-agent: *

# Public canonical pages
Allow: /
Allow: /about
Allow: /contact
Allow: /pricing
Allow: /privacy
Allow: /terms

# Private, authenticated workspaces and transient flows
Disallow: /clinic/
Disallow: /doctor/
Disallow: /staff/
Disallow: /admin/
Disallow: /patient/
Disallow: /workspace
Disallow: /accept-invitation
Disallow: /auth/
Disallow: /api/
Disallow: /login
Disallow: /signup
Disallow: /reset-password
Disallow: /forgot-password

# Sitemap
Sitemap: ${cleanBase}/sitemap.xml
`;
}

/**
 * Generates standard XML sitemap for search engine crawlers.
 * Only includes canonical, publicly accessible pages.
 */
export function generateSitemapXml(baseUrl = getPublicBaseUrl()): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  // Use a stable ISO date for public documentation or today's date
  const lastmod = "2026-10-26";

  const urlElements = CANONICAL_PUBLIC_ROUTES.map((route) => {
    const loc = route.path === "/" ? `${cleanBase}/` : `${cleanBase}${route.path}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>
`;
}
