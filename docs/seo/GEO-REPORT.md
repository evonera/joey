# GEO-REPORT: Joey.ai Landing Page — AI Search Readiness

**Date:** 2026-07-28  
**Domain:** joey.evonera.com  
**Tooling:** claude-seo GEO methodology (seo-geo sub-skill)  
**Analysis scope:** Single-page generative engine optimization for AI Overviews (Google), ChatGPT, Perplexity, Claude, and Gemini.

---

## Executive Summary

The Joey.ai landing page is **not ready for AI search citation**. The page functions as a visual conversion funnel (hero → feature grid → CTA) optimized for human visitors, but provides none of the structural or textual depth that AI models require for confident citation. **GEO citability score: 18/100** — Critical deficiencies in all six assessment areas.

---

## 1. Passage Citability — Score: 5/100

**Requirement:** Self-contained answer blocks of 134–167 words (AI models penalize shorter passages as lacking substance and longer ones as unfocused).

**Current state:**

| Section | Word count | Self-contained? |
|---------|-----------|-----------------|
| Hero tagline | 6 words | No |
| Hero subtitle | 26 words | No |
| "Meet your new social media manager" pill | 5 words | No |
| Eve-Powered AI card | 30 words | No |
| Human in the Loop card | 28 words | No |
| Smart Scheduling card | 23 words | No |
| Cross-Platform Sync card | 24 words | No |
| Footer | 5 words | No |

**Total body text on page:** ~147 words (spread across 9 fragments).

**Problem:** No single passage exceeds 30 words. AI models require 134+ words of contiguous, self-contained explanatory prose to confidently attribute a claim. The page offers only bullet-point-style taglines.

**Recommendation — High priority:**
- Add a 150-word "how it works" section below the hero explaining Joey's agentic workflow: how the Eve framework analyzes brand voice, generates drafts, and maintains human oversight.
- Expand each feature card into a 50–60 word mini-answer paragraph (replace 25-word blurbs). Link these to a `/how-it-works` page for full-depth citability.
- Add a 140-word "Who is Joey for?" section targeting small business owners, social media managers, and agencies.

---

## 2. Question-Based Heading Hierarchy — Score: 10/100

**Requirement:** H2s should match real user questions that appear in AI search queries (e.g., "What is Joey?", "How does Joey automate social media?", "Is Joey open-source?").

**Current heading structure:**

```
H1: Autonomous Social Media, Solved.         ← not a question
     ├── H3: Eve-Powered AI                  ← not a question
     ├── H3: Human in the Loop               ← not a question
     ├── H3: Smart Scheduling                ← not a question
     └── H3: Cross-Platform Sync             ← not a question
```

**Problems:**
- No H2s exist at all — heading level hierarchy skips from H1 directly to H3.
- Zero question-formatted headings.
- H1 is a brand slogan ("Autonomous Social Media, Solved.") that no user would type as a query.
- No coverage of bottom-of-funnel informational queries.

**Likely user questions this page should answer via H2s:**

| User query | H2 needed |
|-----------|-----------|
| "What is Joey AI?" | `## What is Joey?` |
| "How does Joey social media automation work?" | `## How does Joey automate social media?` |
| "Is Joey open source?" | `## Is Joey open source?` |
| "What platforms does Joey support?" | `## What social platforms does Joey support?` |
| "How much does Joey cost?" | `## How much does Joey cost?` |
| "Is Joey better than Buffer/Hootsuite?" | `## How is Joey different from Buffer or Hootsuite?` |

**Recommendation — High priority:**
- Insert a `<h2>What is Joey?</h2>` section with ~160 words of citable prose between the hero and feature grid.
- Convert feature cards into `<h2>How does [Feature] work in Joey?</h2>` sections.
- Add an FAQ section with `<h2>` question headings and `<p>` answer blocks (see Structured Data below for QAPage schema).

---

## 3. Structured Data Coverage — Score: 0/100

**Requirement:** JSON-LD schema markup for entity recognition. AI models (especially Google AI Overviews and Perplexity) heavily weigh structured data for confident entity extraction.

**Current state:** Zero schema markup anywhere on the page — no `<script type="application/ld+json">` blocks.

**Missing schemas:**

| Schema type | Purpose | Priority |
|-------------|---------|----------|
| `SoftwareApplication` | Identifies Joey as a software product with applicationCategory, operatingSystem, offers | Critical |
| `Organization` | Establishes Evonera as the publisher entity with name, url, logo, sameAs | Critical |
| `WebPage` | Provides name, description, about, breadcrumb context | High |
| `FAQPage` with `QAPage` | Answers structured questions — AI models cite FAQ blocks heavily | High |
| `BreadcrumbList` | Signals site structure for AI traversal | Medium |
| `Review` / `AggregateRating` | Provides social proof signals for AI confidence | Medium |

**Recommendation — Critical priority:**

Add the following to `<head>` in `layout.tsx`. Complete working JSON-LD blocks to implement:

### SoftwareApplication (SoftwareApplication schema)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Joey",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "Autonomous social media agent that analyzes brand voice, curates content, and drafts high-performing social posts on autopilot.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Organization",
    "name": "Evonera"
  }
}
```

### Organization (Organization schema)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Evonera",
  "url": "https://joey.evonera.com",
  "description": "Open-source, BYOK social media automation platform powered by the Eve framework.",
  "sameAs": [
    "https://github.com/evonera/joey"
  ]
}
```

**Implementation:** Inject via Next.js `json-ld` script component. Place in `layout.tsx` inside the `<head>` or in-page via a dedicated component.

---

## 4. Entity Signals — Score: 15/100

**Requirement:** Brand-name authority signals, social proof metrics, external citations, and E-E-A-T indicators that AI models use to assess credibility.

**Current brand mentions:**

- "Joey.ai" in nav — weak brand anchor
- "Joey" in hero + feature text — descriptive use only
- "Zernio" mentioned once (cross-platform sync tech) — no link, no explanation
- "Evonera" in footer — no link to parent site
- No GitHub link, no Twitter/LinkedIn profiles, no contributor info

**Missing signals:**

| Signal | Status | Impact |
|--------|--------|--------|
| GitHub stars / repo link | Missing | AI uses repo metrics for credibility |
| Twitter / X profile | Missing | Social proof |
| LinkedIn company page | Missing | Entity disambiguation for Evonera |
| Testimonials or logos | Missing | Authority signal |
| User count / stats | Missing | Scale signal for AI ranking |
| Author / team page | Missing | E-E-A-T |
| External citations | Missing | AI TrustRank |
| Open-source license mention | Only in `<meta>` description | No visible license badge or link |

**Recommendation — High priority:**
- Add a GitHub badge with star count next to the nav logo (e.g., "★ 1.2k Stars on GitHub").
- Add a "Trusted by X users" stat bar between hero and features.
- Link "Evonera" in footer to evonera.com.
- Add social profile links (GitHub, Twitter) in footer.
- Create a visible "Open Source — MIT License" badge.

---

## 5. llms.txt Evaluation — Score: 0/100

**Requirement:** An `llms.txt` file at the domain root following the [llmstxt protocol](https://llmstxt.org) — this is the single most impactful GEO asset for AI crawlers (ChatGPT, Claude, Perplexity, Gemini all consume it).

**Current state:** No `/llms.txt` file exists. No `/llms-full.txt` fallback.

**What it should contain:**

```markdown
# Joey — Autonomous Social Media Agent
> An open-source, BYOK social media automation platform powered by the Eve framework.

## Core Features

- **Eve-Powered AI:** Joey uses advanced agentic workflows to understand context, format constraints, and your unique brand persona. It analyzes brand voice, curates content, and drafts high-performing social posts.
- **Human in the Loop:** Nothing goes live without your approval. Review, tweak, and approve agent-generated drafts before they hit your timeline.
- **Smart Scheduling:** Visual content calendar with drag-and-drop support. Joey knows when to draft content based on your schedule.
- **Cross-Platform Sync:** Powered by Zernio. Post to Twitter, LinkedIn, Facebook, and more simultaneously from one dashboard.

## Key Details

- **License:** MIT (open source)
- **Pricing:** BYOK (bring your own API keys) — no mandatory subscription
- **Tech Stack:** Built on the Eve framework, Next.js, TypeScript
- **Parent Company:** Evonera
- **GitHub:** https://github.com/evonera/joey

## Product Links

- Homepage: https://joey.evonera.com
- Login: https://joey.evonera.com/login
- Sign Up: https://joey.evonera.com/signup

## FAQ

- **What is Joey?** Joey is an autonomous social media agent that analyzes your brand voice, curates relevant content, and drafts high-performing social posts on autopilot. You just review and approve.
- **Is Joey open source?** Yes, Joey is open source under the MIT license. Source code is available on GitHub.
- **How does Human in the Loop work?** Joey generates posts based on your brand voice and scheduling preferences, but nothing publishes without your manual approval. You can edit any draft before it goes live.
- **What platforms are supported?** Twitter/X, LinkedIn, Facebook are supported via the Zernio cross-platform publishing engine.
- **How is Joey different from Buffer/Hootsuite?** Joey uses AI agentic workflows to autonomously create content, not just schedule it. It learns your brand voice and generates platform-specific posts.
```

**Recommendation — Critical priority:**
- Create `/public/llms.txt` with the content above.
- Verify it's served at `https://joey.evonera.com/llms.txt`.
- Add it to the sitemap.
- Optionally create `/public/llms-full.txt` for the comprehensive version.

---

## 6. Citability Scoring

### Composite GEO Citability Score: 18/100

| Factor | Weight | Score | Weighted |
|--------|--------|-------|----------|
| Passage citability (134–167w blocks) | 25% | 5/100 | 1.25 |
| Question-based heading hierarchy | 20% | 10/100 | 2.00 |
| Structured data coverage | 20% | 0/100 | 0.00 |
| Entity signals & E-E-A-T | 15% | 15/100 | 2.25 |
| llms.txt presence | 10% | 0/100 | 0.00 |
| Social proof & external citations | 10% | 10/100 | 1.00 |

### AI citation likelihood breakdown:

| AI platform | Likelihood of citation | Basis |
|-------------|----------------------|-------|
| **Google AI Overviews** | Very low | Requires schema + 134w+ passages + FAQPage |
| **ChatGPT** | Low | May cite from llms.txt if present (it's not) |
| **Perplexity** | Very low | Requires source depth and structured data |
| **Claude** | Low | Will cite if linked; no self-contained prose |
| **Gemini** | Very low | Requires schema and question-aligned H2s |

---

## Prioritized Action Plan

### Critical (fix immediately — blocks AI citation entirely):

1. **Create `/public/llms.txt`** — single highest-impact GEO change. AI crawlers from all major providers check this file first.
2. **Add SoftwareApplication + Organization JSON-LD** to `layout.tsx`. Without schema, AI models cannot confidently identify Joey as a software product.

### High (fix within 1 week):

3. **Add a 150–160 word "What is Joey?" H2 section** below the hero. This is the passage AI models will cite in answer snippets.
4. **Convert feature card body text to 50–60 word mini-answers** — depth over breadth.
5. **Add GitHub badge + star count** to nav header for social proof.
6. **Add social links (GitHub, Twitter)** to footer.
7. **Add a "Trusted by X users" or stat bar** between hero and features.

### Medium (fix within 1 month):

8. **Add FAQPage/QAPage JSON-LD** with 5–7 questions matching real user queries.
9. **Create a `/how-it-works` page** with a 300–400 word explainer (citability depth).
10. **Add BreadcrumbList schema** for site structure.
11. **Add team / about page** with author schema for E-E-A-T.
12. **Add OpenGraph and Twitter Card meta tags** with richer descriptions.

### Low (backlog):

13. **Add blog section** with articles targeting informational queries (e.g., "how to automate social media with AI").
14. **Collect and display testimonials** with Review schema.
15. **Monitor AI search appearances** using Perplexity page search and ChatGPT browse output.

---

## Summary

The Joey landing page is optimized for human conversion but **invisible to AI search**. It lacks every structural element that generative engines rely on: no llms.txt, no schema markup, no citable prose passages, no question-aligned headings, and minimal entity signals. Implementing the llms.txt and SoftwareApplication schema alone will move the score from 18 to approximately 45. Full GEO readiness (75+) requires adding depth paragraphs, FAQ schema, and social proof.
