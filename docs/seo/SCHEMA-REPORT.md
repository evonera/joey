# Schema Markup Analysis Report — Joey.ai

**Date:** 2026-07-28
**Page analyzed:** `/src/app/page.tsx` + `/src/app/layout.tsx`
**Tool:** claude-seo v2.2.4 / seo-schema skill

---

## Detection Results

| Schema Format | Detected | Status |
|---------------|----------|--------|
| JSON-LD (`application/ld+json`) | No | ❌ Missing |
| Microdata (`itemscope`/`itemprop`) | No | ❌ Missing |
| RDFa (`typeof`/`property`) | No | ❌ Missing |

**No structured data of any kind was found on the Joey.ai landing page.**

---

## Page Content Analysis

| Attribute | Value |
|-----------|-------|
| **Site name** | Joey.ai |
| **Product** | Autonomous social media agent |
| **Company** | Evonera (see footer) |
| **Page type** | SaaS landing page (WebApplication) |
| **Tech stack** | Next.js 16 (server-rendered), Tailwind CSS |
| **Key features** | Eve-Powered AI, Human in the Loop, Smart Scheduling, Cross-Platform Sync (Zernio) |
| **Tagline** | "Autonomous Social Media, Solved." |
| **CTA** | Start Automating (`/signup`) |

---

## Recommended Schema Types

| Priority | Schema Type | Justification |
|----------|-------------|---------------|
| P0 | **Organization** | Required for brand entity (Evonera). Anchors publisher/author for all other types. |
| P0 | **WebSite** | Must for every site. Enables Sitelinks Search Box eligibility. |
| P0 | **WebApplication** | Primary type — Joey is a browser-based SaaS web app. |
| P1 | **SoftwareApplication** | Supplementary — Joey is also downloadable/agent software. |
| P2 | **Product** | Optional — Joey is offered as a SaaS product (subscription). Use only if pricing tiers exist. |

---

## Required & Recommended Properties Checklist

### Organization (Evonera)

| Property | Required | Status |
|----------|----------|--------|
| `@context` | ✅ Required | Will provide |
| `@type` | ✅ Required | `Organization` |
| `name` | ✅ Required | `Evonera` |
| `url` | 🔶 Recommended | `https://joey.ai` |
| `logo` | 🔶 Recommended | Needs logo URL |
| `sameAs` | 🔶 Recommended | Social profiles needed |
| `contactPoint` | Optional | Can add |

### WebSite (joey.ai)

| Property | Required | Status |
|----------|----------|--------|
| `@context` | ✅ Required | Will provide |
| `@type` | ✅ Required | `WebSite` |
| `name` | ✅ Required | `Joey.ai` |
| `url` | ✅ Required | `https://joey.ai` |
| `description` | 🔶 Recommended | From metadata |
| `potentialAction` | 🔶 Recommended | SearchAction for sitelinks search box |

### WebApplication (Joey)

| Property | Required | Status |
|----------|----------|--------|
| `@context` | ✅ Required | Will provide |
| `@type` | ✅ Required | `WebApplication` |
| `name` | ✅ Required | `Joey` |
| `url` | ✅ Required | `https://joey.ai` |
| `description` | ✅ Required | From page meta description |
| `applicationCategory` | ✅ Required for Google | `SocialNetworking`, `BusinessApplication`, `Multimedia` |
| `operatingSystem` | 🔶 Recommended | `Web` (browser-based) |
| `browserRequirements` | 🔶 Recommended | Modern browsers |
| `offers` | 🔶 Recommended | If pricing exists |
| `author` / `publisher` | 🔶 Recommended | Points to Evonera Organization |

---

## Generated JSON-LD Schema Blocks

All blocks should be placed in the Next.js layout file (`layout.tsx`) inside the `<head>` via the `Metadata` API — or injected directly as a `<script>` tag in the `<body>`. For Next.js, the recommended approach is to convert `metadata` to use `generateMetadata` or add a custom `<Script>` component.

### Block 1: Organization + WebSite (combinable)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Evonera",
      "url": "https://joey.ai",
      "logo": "https://joey.ai/logo.png",
      "sameAs": [
        "https://twitter.com/joeyai",
        "https://linkedin.com/company/joeyai"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "support@joey.ai"
      }
    },
    {
      "@type": "WebSite",
      "name": "Joey.ai",
      "url": "https://joey.ai",
      "description": "An open-source, BYOK social media automation platform.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://joey.ai/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

### Block 2: WebApplication

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Joey",
  "url": "https://joey.ai",
  "description": "An open-source, BYOK social media automation platform. Joey analyzes your brand voice, curates content, and drafts high-performing social posts on autopilot.",
  "applicationCategory": [
    "SocialNetworking",
    "BusinessApplication",
    "Multimedia"
  ],
  "operatingSystem": "Web",
  "browserRequirements": "Requires modern browser with JavaScript enabled",
  "applicationSubCategory": "Social Media Management",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "author": {
    "@type": "Organization",
    "name": "Evonera",
    "url": "https://joey.ai"
  },
  "featureList": [
    "AI-powered content generation",
    "Human-in-the-loop approval",
    "Smart scheduling with drag-and-drop calendar",
    "Cross-platform posting via Zernio (Twitter, LinkedIn, Facebook)"
  ],
  "screenshot": "https://joey.ai/og-image.png",
  "datePublished": "2025-01-01",
  "dateModified": "2026-07-28"
}
```

### Combined Single Block (recommended)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Evonera",
      "url": "https://joey.ai",
      "logo": "https://joey.ai/logo.png",
      "sameAs": [
        "https://twitter.com/joeyai",
        "https://linkedin.com/company/joeyai"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "support@joey.ai"
      }
    },
    {
      "@type": "WebSite",
      "name": "Joey.ai",
      "url": "https://joey.ai",
      "description": "An open-source, BYOK social media automation platform.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://joey.ai/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "WebApplication",
      "name": "Joey",
      "url": "https://joey.ai",
      "description": "An open-source, BYOK social media automation platform. Joey analyzes your brand voice, curates content, and drafts high-performing social posts on autopilot.",
      "applicationCategory": [
        "SocialNetworking",
        "BusinessApplication",
        "Multimedia"
      ],
      "operatingSystem": "Web",
      "browserRequirements": "Requires modern browser with JavaScript enabled",
      "applicationSubCategory": "Social Media Management",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      },
      "author": {
        "@type": "Organization",
        "name": "Evonera",
        "url": "https://joey.ai"
      },
      "featureList": [
        "AI-powered content generation",
        "Human-in-the-loop approval",
        "Smart scheduling with drag-and-drop calendar",
        "Cross-platform posting via Zernio (Twitter, LinkedIn, Facebook)"
      ],
      "screenshot": "https://joey.ai/og-image.png",
      "datePublished": "2025-01-01",
      "dateModified": "2026-07-28"
    }
  ]
}
```

---

## Implementation Guidance (Next.js)

Inject the combined JSON-LD block in `layout.tsx` by adding a `<script>` tag alongside the existing metadata:

```tsx
// src/app/layout.tsx — add inside <body> or <head>
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        // ... Organization, WebSite, WebApplication blocks ...
      ]
    })
  }}
/>
```

Alternatively, use `next/script` with `strategy="beforeInteractive"` for earlier hydration:

```tsx
import Script from "next/script";

// inside RootLayout return:
<Script
  id="schema-org"
  type="application/ld+json"
  strategy="beforeInteractive"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(schemaData)
  }}
/>
```

---

## Action Items

| # | Task | Priority |
|---|------|----------|
| 1 | Add combined JSON-LD block to `layout.tsx` | 🔴 Critical |
| 2 | Add Open Graph / Twitter Card metadata to layout (if missing) | 🟡 High |
| 3 | Verify `https://joey.ai/logo.png` exists — update URL if different | 🟡 High |
| 4 | Add `sameAs` social profile URLs (Twitter, LinkedIn, GitHub, etc.) | 🟡 High |
| 5 | Update `datePublished` / `dateModified` to real launch dates | 🟢 Medium |
| 6 | Validate with Google Rich Results Test before deploy | 🟢 Medium |
| 7 | Consider adding BreadcrumbList schema on inner pages | 🔵 Low |
