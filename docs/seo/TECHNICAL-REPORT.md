# Technical SEO Report — Joey (joey.evonera.com)

**Generated:** 2026-07-28  
**Stack:** Next.js 16.3.0-preview.6 (App Router) · React 19.2 · Tailwind CSS v4 ·  
Eve Agent Framework · Zernio SDK · Postgres/Neon · Drizzle ORM · Better Auth  
**Deployment target:** Vercel (inferred from `next.config.ts` + `.vercelignore`)  

---

## Scoring Methodology

Per the claude-seo `seo-technical` sub-skill:

| Priority | Definition | Action Window |
|----------|------------|---------------|
| **Critical** | Blocks indexing or causes penalties | Immediate |
| **High** | Significantly impacts rankings | Within 1 week |
| **Medium** | Optimization opportunity | Within 1 month |
| **Low** | Nice to have | Backlog |

---

## 1. Crawlability & Indexability

### 1.1 Robots.txt ✓
**Status: Good** — `src/app/robots.ts` generates a valid `robots.txt`:
- Allows `/`
- Disallows `/dashboard/`, `/settings/`, `/accounts/`, `/api/`
- Points sitemap to `https://joey.evonera.com/sitemap.xml`

### 1.2 Sitemap.xml ⚠️ Medium
`src/app/sitemap.ts` only includes 3 URLs:
- `/` (priority 1.0, weekly)
- `/login` (priority 0.8, monthly)
- `/signup` (priority 0.8, monthly)

**Issue:** The sitemap is extremely thin. Any public marketing pages (features, pricing, about, blog, docs) that may be added in future are missing. No `lastModified` for login/signup is meaningful — those pages rarely change.

**Recommendation:** Extend the sitemap dynamically. If the site grows beyond a landing page, generate entries from a CMS or content registry. For now, it is adequate for a 3-page MVP.

### 1.3 Canonical Tags ❌ High
**No canonical tags exist anywhere in the codebase.**  
Every page should self-reference a canonical URL. The root `layout.tsx` does not set `<link rel="canonical">`. Next.js's `Metadata` API supports `alternates: { canonical: "..." }` but it is not used.

**Impact:** Duplicate content risk if the site is accessed via `http://`, `www.`, or query-parameter variations. Vercel deployments often get preview URLs crawled.

**Fix:** Add to root layout metadata:
```ts
alternates: { canonical: "https://joey.evonera.com" },
```
And set per-page canonicals in each page's `generateMetadata`.

### 1.4 Noindex on Auth Pages ❌ High
`/login` and `/signup` are included in the sitemap with `priority: 0.8` but neither page sets `noindex`. These are thin client-side rendered pages with no unique content value for search. They exist in the sitemap, telling Google to crawl them, yet offer zero organic value.

**Impact:** Wasted crawl budget. Login/signup pages are not indexed typically, but the signal is ambiguous.

**Fix:** Add `robots: { index: false }` to metadata on auth pages. Remove them from the sitemap or set `priority: 0.1`.

### 1.5 No `index`/`follow` Meta Tag ✓
Not explicitly set — by default, pages are indexable. Acceptable, but explicit `robots: { index: true, follow: true }` on the homepage would be more defensive.

---

## 2. Core Web Vitals — Next.js 16 SSR

### 2.1 LCP (Largest Contentful Paint) ⚠️ Medium
**LCP candidate:** The hero heading `h1` text ("Autonomous Social Media, Solved.") is the likeliest LCP element.

**Risk factors:**
- The Inter font from `next/font/google` is loaded with `font-display: swap` (Next.js default) — **good**.
- No hero image is loaded, so the LCP is text-render-bound. That is **fast**.
- **Potential CLS source:** The gradient text span (`bg-gradient-to-r from-indigo-500 to-purple-500`) with `bg-clip-text` renders as a pseudo-element — should not cause CLS.
- Tailwind CSS v4 is loaded as a single CSS bundle via PostCSS. For a landing page this size, it is acceptable, but as the app grows, CSS bundle size will become an LCP factor.

**Next.js 16 SSR note:** Server components render HTML instantly on the wire. The landing page is a server component (no `'use client'`), so minimal JS is shipped for the hero. **Favorable for LCP.**

### 2.2 INP (Interaction to Next Paint) ⚠️ Medium
**Dashboard pages risk high INP:**
- `src/app/(dashboard)/layout.tsx` is an async server component that awaits two DB queries (`getPendingDraftCount`, `getAgentConfig`) before rendering — this is server-side, so not a client INP concern.
- However, the dashboard app uses heavy client interactivity:
  - `@dnd-kit` (drag and drop)
  - `react-big-calendar`
  - `recharts` (charting)
  - `cmdk` (command palette)
  - Radix UI primitives throughout
  - Zustand for state management
- Long task potential on calendar/compose/dashboard pages.

**Recommendation:** Profile dashboard pages with Lighthouse lab data. Consider lazy-loading charts and calendar off the critical interaction path. The app does not yet use `React.lazy` or `next/dynamic` for heavy components (check needed).

### 2.3 CLS (Cumulative Layout Shift) ✓ Low
- All images use `next/font/google` with `font-display: swap` — prevents font-induced CLS.
- No images in the landing page lack width/height.
- The `apple-icon.tsx` and `opengraph-image.tsx` are served via `ImageResponse` — these are static generated images, correctly sized.
- Dashboard sidebar uses CSS custom properties for width — no layout shift from dynamic content.

**Risk:** The dashboard sidebar (`app-sidebar.tsx`) is server-rendered but toggles via Radix. If content is injected above existing content (e.g., the "automation paused" banner), it could cause shift.

---

## 3. Mobile Friendliness ✓ Low

- Tailwind responsive classes in use: `md:text-7xl`, `md:grid-cols-2`, `lg:grid-cols-4`, `max-w-7xl mx-auto` — fluid layout.
- No horizontal overflow detected in landing page.
- `viewport` meta tag is implicitly correct (Next.js sets `<meta name="viewport" content="width=device-width, initial-scale=1">` by default).
- Touch targets: CTA buttons are 44px+ (good).
- The hamburger/sidebar for dashboard is mobile-appropriate.

**No issues found.** This is a Tailwind-first responsive design.

---

## 4. Security

### 4.1 HTTPS ✓
- Vercel enforces HTTPS automatically with TLS termination.
- `NEXT_PUBLIC_APP_URL` references `http://localhost:3000` in `.env.example` — this is development-only, acceptable.

### 4.2 Security Headers ❌ Medium
**No explicit security headers configured in `next.config.ts`.**  
The config is essentially empty:
```ts
const nextConfig: NextConfig = {};
```

**Missing recommended headers:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (or omit; modern browsers ignore)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera=(), microphone=(), geolocation=())
- `Strict-Transport-Security` (Vercel sets this at edge, but explicit is safer)

**Fix:** Add `headers()` async function in `next.config.ts`:
```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
```

### 4.3 Content Security Policy ❌ Medium
No CSP header found. For a SaaS platform that embeds (potentially) LLM-generated content in iframes or messages, a CSP would mitigate XSS risk.

---

## 5. Performance — Next.js SSR/SSG Strategy

### 5.1 Rendering Strategy ⚠️ Medium
| Page | Strategy | Notes |
|------|----------|-------|
| `/` (landing) | **Static RSC** | No `'use client'`, no `getServerSideProps` or `force-dynamic`. This is statically rendered at build time — excellent. |
| `/login`, `/signup` | **Client-only** | `'use client'`, no metadata export. Rendered entirely on the client with a blank static shell — poor for SEO. |
| Dashboard pages | **Dynamic SSR** | Async server components fetching DB data per request. Necessary for authenticated content. |

**Issue with auth pages:** Login and signup are client-only. They have no server-rendered content, no metadata export. While these are not content pages, they should still export `metadata` for social sharing and title tags.

### 5.2 ISR (Incremental Static Regeneration) ❌ Low
Not used. The only static page (`/`) does not need ISR (it has no data dependencies). If blog/pricing pages are added, ISR would be valuable.

### 5.3 Image Optimization ✓
- Uses Next.js `<Image>`? **No images on landing page** — but `opengraph-image.tsx` and `icon.tsx` use `ImageResponse` (Satori), which generates PNGs server-side at request time.
- No raster images found in `public/` — the directory is empty.
- No image optimization concerns for the current MVP.

### 5.4 Bundle Size ❌ Medium
Package.json reveals heavy dependencies:
- `recharts` (large charting library)
- `react-big-calendar` (full calendar UI)
- `@dnd-kit/*` (three packages)
- `radix-ui` (meta-package v1.4.3 — likely pulls many primitives)
- `shiki` + `@shikijs/*` (syntax highlighting, 2MB+)
- `streamdown` (markdown rendering pipeline)
- `motion` (animation library, replaces framer-motion)

**Risk:** The main dashboard JS bundle will be large. No code-splitting patterns detected (no `next/dynamic`, no `React.lazy`). This directly impacts INP on dashboard pages.

### 5.5 Font Loading ✓
- Inter font via `next/font/google` with `subsets: ["latin"]` — automatically inlined and self-hosted.
- `font-display: swap` is the Next.js default.

---

## 6. Accessibility

### 6.1 Semantic HTML ⚠️ Medium

| Structure | Status |
|-----------|--------|
| `<html lang="en">` | ✅ Present in root layout |
| `<h1>` | ✅ One per page on landing |
| `<h2>`–`<h6>` | ❌ Feature cards use `<h3>` — correct. |
| `<main>` | ✅ Used on landing page |
| `<header>`/`<footer>` | ✅ Used on landing page |
| `<nav>` | ❌ Not used — nav links are in a `<header>` without `<nav>` wrapper |
| Form labels | ✅ Login/signup use `<label>` elements |
| ARIA landmarks | ❌ Not used (sidebar/nav missing `role="navigation"` or `aria-label`) |

**Issue:** The landing page header navigation (`Log in`, `Get Started`) is wrapped in a `<header>` but not in a `<nav>` element. Screen readers may not identify it as navigation.

### 6.2 Heading Hierarchy ❌ Medium
The landing page jumps from `<h1>` → `<h3>` feature cards — no `<h2>` is used. This is a WCAG heading gap. Search engines also infer content structure from heading hierarchy.

**Fix:** Wrap the feature grid in an `<h2>` like "Key Features" or similar, then use `<h3>` for individual features.

### 6.3 Alt Text ❌ Medium
- The `opengraph-image.tsx` exports `alt = 'Joey - Autonomous Social Media Agent'` — good.
- The landing page has **zero `<img>` elements** using alt text.
- `icon.tsx` and `apple-icon.tsx` are favicons (decorative), but `role="presentation"` is not set — they are served as standalone routes, not `<img>` elements, so this is acceptable.
- Any future images must include descriptive alt text.

### 6.4 Color Contrast ✓
- Uses Tailwind's zinc/indigo palette with OKLCH color tokens. Dark mode is present.
- Gradient text (`bg-clip-text`) on the hero may fail WCAG 1.4.1 (use of color) — the text is still visible if gradient fails, just not colored. Acceptable.

---

## 7. Internationalization ⚠️ Low

- Root layout sets `<html lang="en">`.
- No `hreflang` tags, no i18n routing, no locale detection.
- This is appropriate for an MVP that targets English-speaking markets only.
- If multi-language support is planned, `next-intl` or `next-i18next` should be added with `hreflang` in sitemap and metadata.

---

## Summary of Findings

| # | Issue | Priority | Category |
|---|-------|----------|----------|
| 1 | **No canonical tags** on any page | **High** | Crawlability |
| 2 | **Auth pages in sitemap, not noindexed** | **High** | Crawlability |
| 3 | **No security headers (CSP, HSTS, XFO)** | **Medium** | Security |
| 4 | **Landing page heading gap (h1→h3, no h2)** | **Medium** | Accessibility |
| 5 | **Heavy client bundles, no code splitting** | **Medium** | Performance/INP |
| 6 | **No `<nav>` landmark for navigation** | **Medium** | Accessibility |
| 7 | **Sitemap too thin (3 URLs, missing metadata)** | **Medium** | Crawlability |
| 8 | **Dashboard dnd-kit + charts + calendar = INP risk** | **Medium** | Core Web Vitals |
| 9 | **No explicit CSP — XSS vector for SaaS app** | **Medium** | Security |
| 10 | **Auth pages are client-only shell (no server content)** | **Low** | Crawlability |
| 11 | **No ISR configured — could benefit blog/content** | **Low** | Performance |
| 12 | **No `role="presentation"` on decorative images/icons** | **Low** | Accessibility |
| 13 | **No i18n/hreflang** | **Low** | Internationalization |

---

## Prioritized Action Plan

### Immediate (Critical/High)
1. **Add canonical URL** to root layout metadata and per-page `generateMetadata`
2. **Remove `/login` and `/signup` from sitemap** OR add `noindex` to their metadata
3. **Add security headers** — at minimum `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

### This Week (High/Medium)
4. **Fix heading hierarchy** on landing page — add `<h2>` above feature grid
5. **Wrap header nav in `<nav>`** element with `aria-label`
6. **Add basic CSP** to `next.config.ts` headers
7. **Lazy-load heavy components** in dashboard (`next/dynamic`) for INP

### This Month (Medium)
8. **Enrich sitemap** with any future marketing pages
9. **Audit dashboard INP** with Lighthouse — identify long tasks
10. **Add explicit `robots` metadata** to homepage (defensive)

### Backlog (Low)
11. Plan i18n strategy with hreflang
12. Add `role="presentation"` to decorative icons in component library
13. Consider ISR for any future data-driven static pages

---

**Note:** As a SaaS pre-launch/MVP, the biggest SEO risk is that auth pages are indexed without canonical tags or noindex. The landing page itself is well-constructed: static RSC, clean semantic structure, responsive design, fast font loading. The dashboard performance profile (INP) should be monitored as features are added.
