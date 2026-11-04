import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPublicBaseUrl,
  getGoogleSiteVerification,
  generateRobotsTxt,
  generateSitemapXml,
  CANONICAL_PUBLIC_ROUTES,
} from "@/lib/seo";
import { publicMeta } from "@/lib/public-meta";
import fs from "node:fs";
import path from "node:path";

describe("SEO Foundation & Metadata", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["APP_URL"];
    delete process.env["VITE_APP_URL"];
    delete process.env["SITE_URL"];
    delete process.env["VERCEL_URL"];
    delete process.env["GOOGLE_SITE_VERIFICATION"];
    delete process.env["VITE_GOOGLE_SITE_VERIFICATION"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Base URL Resolution", () => {
    it("falls back to the production base URL and never localhost", () => {
      const url = getPublicBaseUrl();
      expect(url).toBe("https://careflow-ai-ten.vercel.app");
      expect(url).not.toContain("localhost");
      expect(url).not.toContain("127.0.0.1");
    });

    it("respects APP_URL environment variable and strips trailing slashes", () => {
      process.env["APP_URL"] = "https://custom-clinic.careflow.app///";
      expect(getPublicBaseUrl()).toBe("https://custom-clinic.careflow.app");
    });

    it("respects VITE_APP_URL if APP_URL is not set", () => {
      process.env["VITE_APP_URL"] = "https://vite-env.careflow.app/";
      expect(getPublicBaseUrl()).toBe("https://vite-env.careflow.app");
    });

    it("respects SITE_URL if APP_URL is not set", () => {
      process.env["SITE_URL"] = "https://site-url.careflow.app";
      expect(getPublicBaseUrl()).toBe("https://site-url.careflow.app");
    });

    it("handles VERCEL_URL properly with and without protocol", () => {
      process.env["VERCEL_URL"] = "careflow-deploy-xyz.vercel.app";
      expect(getPublicBaseUrl()).toBe("https://careflow-deploy-xyz.vercel.app");

      process.env["VERCEL_URL"] = "https://careflow-deploy-abc.vercel.app/";
      expect(getPublicBaseUrl()).toBe("https://careflow-deploy-abc.vercel.app");
    });
  });

  describe("Google Search Console Verification", () => {
    it("returns undefined when no verification token is set", () => {
      expect(getGoogleSiteVerification()).toBeUndefined();
    });

    it("reads GOOGLE_SITE_VERIFICATION from server environment and trims whitespace", () => {
      process.env["GOOGLE_SITE_VERIFICATION"] = "  google-test-token-12345  ";
      expect(getGoogleSiteVerification()).toBe("google-test-token-12345");
    });

    it("reads VITE_GOOGLE_SITE_VERIFICATION as fallback", () => {
      process.env["VITE_GOOGLE_SITE_VERIFICATION"] = "vite-token-67890";
      expect(getGoogleSiteVerification()).toBe("vite-token-67890");
    });
  });

  describe("publicMeta Generation", () => {
    it("creates full page title, description, and Open Graph tags for homepage", () => {
      const { meta, links } = publicMeta(
        "Clinic management for modern practices",
        "CAREFLOW AI brings patients, appointments, queues, consultations and billing together.",
        "/"
      );

      const titleMeta = meta.find((m) => m["title"]);
      expect(titleMeta?.["title"]).toBe("Clinic management for modern practices — CAREFLOW AI");

      const descMeta = meta.find((m) => m["name"] === "description");
      expect(descMeta?.["content"]).toContain("CAREFLOW AI brings patients");

      const ogTitle = meta.find((m) => m["property"] === "og:title");
      expect(ogTitle?.["content"]).toBe("Clinic management for modern practices — CAREFLOW AI");

      const ogUrl = meta.find((m) => m["property"] === "og:url");
      expect(ogUrl?.["content"]).toBe("https://careflow-ai-ten.vercel.app/");

      const ogSite = meta.find((m) => m["property"] === "og:site_name");
      expect(ogSite?.["content"]).toBe("CAREFLOW AI");

      const twitterCard = meta.find((m) => m["name"] === "twitter:card");
      expect(twitterCard?.["content"]).toBe("summary_large_image");

      const robots = meta.find((m) => m["name"] === "robots");
      expect(robots?.["content"]).toBe("index, follow");

      const canonicalLink = links.find((l) => l["rel"] === "canonical");
      expect(canonicalLink?.["href"]).toBe("https://careflow-ai-ten.vercel.app/");
    });

    it("handles canonical path for secondary public pages", () => {
      const { meta, links } = publicMeta(
        "About CAREFLOW AI",
        "About the clinic operations platform.",
        "/about"
      );

      const ogUrl = meta.find((m) => m["property"] === "og:url");
      expect(ogUrl?.["content"]).toBe("https://careflow-ai-ten.vercel.app/about");

      const canonicalLink = links.find((l) => l["rel"] === "canonical");
      expect(canonicalLink?.["href"]).toBe("https://careflow-ai-ten.vercel.app/about");
    });

    it("applies noindex, nofollow for authentication and transient routes", () => {
      const { meta, links } = publicMeta(
        "Sign in",
        "Sign in to your CAREFLOW AI clinic workspace.",
        { noindex: true }
      );

      const robots = meta.find((m) => m["name"] === "robots");
      expect(robots?.["content"]).toBe("noindex, nofollow");
      expect(links).toHaveLength(0);
    });
  });

  describe("Robots.txt Rules", () => {
    it("generates correct directives allowing public pages and disallowing private routes", () => {
      const robots = generateRobotsTxt("https://careflow-ai-ten.vercel.app");

      // Allows canonical public routes
      expect(robots).toContain("Allow: /");
      expect(robots).toContain("Allow: /about");
      expect(robots).toContain("Allow: /contact");
      expect(robots).toContain("Allow: /pricing");
      expect(robots).toContain("Allow: /privacy");
      expect(robots).toContain("Allow: /terms");

      // Disallows authenticated workspaces
      expect(robots).toContain("Disallow: /clinic/");
      expect(robots).toContain("Disallow: /doctor/");
      expect(robots).toContain("Disallow: /staff/");
      expect(robots).toContain("Disallow: /admin/");
      expect(robots).toContain("Disallow: /patient/");
      expect(robots).toContain("Disallow: /workspace");
      expect(robots).toContain("Disallow: /accept-invitation");
      expect(robots).toContain("Disallow: /auth/");
      expect(robots).toContain("Disallow: /api/");

      // Includes sitemap
      expect(robots).toContain("Sitemap: https://careflow-ai-ten.vercel.app/sitemap.xml");
    });

    it("matches the static public/robots.txt file", () => {
      const filePath = path.resolve(process.cwd(), "public", "robots.txt");
      const diskContent = fs.readFileSync(filePath, "utf-8");
      const generated = generateRobotsTxt("https://careflow-ai-ten.vercel.app");
      expect(diskContent.trim()).toBe(generated.trim());
    });
  });

  describe("Sitemap.xml Rules", () => {
    it("generates valid XML with all canonical public routes and no private routes", () => {
      const sitemap = generateSitemapXml("https://careflow-ai-ten.vercel.app");

      expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      for (const route of CANONICAL_PUBLIC_ROUTES) {
        const expectedLoc =
          route.path === "/"
            ? "https://careflow-ai-ten.vercel.app/"
            : `https://careflow-ai-ten.vercel.app${route.path}`;
        expect(sitemap).toContain(`<loc>${expectedLoc}</loc>`);
        expect(sitemap).toContain(`<changefreq>${route.changefreq}</changefreq>`);
        expect(sitemap).toContain(`<priority>${route.priority.toFixed(1)}</priority>`);
      }

      // Must exclude private/auth routes
      expect(sitemap).not.toContain("/clinic");
      expect(sitemap).not.toContain("/doctor");
      expect(sitemap).not.toContain("/staff");
      expect(sitemap).not.toContain("/admin");
      expect(sitemap).not.toContain("/patient");
      expect(sitemap).not.toContain("/accept-invitation");
      expect(sitemap).not.toContain("/login");
      expect(sitemap).not.toContain("/signup");
    });

    it("matches the static public/sitemap.xml file", () => {
      const filePath = path.resolve(process.cwd(), "public", "sitemap.xml");
      const diskContent = fs.readFileSync(filePath, "utf-8");
      const generated = generateSitemapXml("https://careflow-ai-ten.vercel.app");
      expect(diskContent.trim()).toBe(generated.trim());
    });
  });

  describe("Google OAuth & Privacy Policy Disclosures", () => {
    it("includes required Google OAuth disclosures in Privacy Policy", () => {
      const privacyPath = path.resolve(process.cwd(), "src", "routes", "privacy.tsx");
      const privacyContent = fs.readFileSync(privacyPath, "utf-8");

      // Platform description
      expect(privacyContent).toContain("clinic operations and patient management platform");

      // Scopes requested
      expect(privacyContent).toContain("https://www.googleapis.com/auth/gmail.send");
      expect(privacyContent).toContain("https://www.googleapis.com/auth/userinfo.email");

      // Purpose
      expect(privacyContent).toContain("clinic-initiated invitations");
      expect(privacyContent).toContain("doctors and staff");
      expect(privacyContent).toContain("does not read, index, analyze, search, or retain the contents of your");

      // Storage & encryption
      expect(privacyContent).toContain("AES-256-GCM");

      // Retention & revocation
      expect(privacyContent).toContain("myaccount.google.com/permissions");
      expect(privacyContent).toContain("Google API Services User Data Policy");
      expect(privacyContent).toContain("Limited Use requirements");
    });

    it("includes clinic disclaimer in Terms of Service", () => {
      const termsPath = path.resolve(process.cwd(), "src", "routes", "terms.tsx");
      const termsContent = fs.readFileSync(termsPath, "utf-8");

      expect(termsContent).toContain("clinic operations and patient management");
      expect(termsContent).toContain("Clinical Responsibility & Medical Disclaimer");
      expect(termsContent).toContain("CAREFLOW AI is not a healthcare provider");
    });

    it("links to Privacy Policy and Terms of Service in PublicLayout footer", () => {
      const authUiPath = path.resolve(process.cwd(), "src", "components", "careflow", "auth-ui.tsx");
      const authUiContent = fs.readFileSync(authUiPath, "utf-8");

      expect(authUiContent).toContain('to="/privacy"');
      expect(authUiContent).toContain("Privacy Policy");
      expect(authUiContent).toContain('to="/terms"');
      expect(authUiContent).toContain("Terms of Service");
    });
  });
});
