# CONTENT QUALITY & E-E-A-T REPORT: Joey Landing Page

**Analyzed URL structure:** `/` (homepage)  
**Business type:** SaaS – Autonomous social media agent platform  
**Analysis date:** July 28, 2026  
**Methodology:** claude-seo E-E-A-T Framework v2.2.4 (per Google QRG, Sept 2025) + Content Quality Gates

---

## 1. E-E-A-T SIGNALS

### 1.1 Experience (claude-seo weight: 20%) — Score: 0/100 (None)

| Check | Status | Notes |
|-------|--------|-------|
| First-hand experience signals | ❌ | No "I/we tested" narrative |
| Original photos / screenshots | ❌ | No screenshots of the product UI |
| Case studies with specifics | ❌ | None |
| Process documentation | ❌ | None |
| Before/after results | ❌ | None |
| Authentic anecdotes | ❌ | None |

**Verdict:** The page is entirely generic marketing copy. There is zero lived experience content. The tagline "You just click approve" is a claim, not a demonstration.

### 1.2 Expertise (claude-seo weight: 25%) — Score: 5/100 (None–Weak)

| Check | Status | Notes |
|-------|--------|-------|
| Author credentials visible | ❌ | No author bio, no team page |
| Technical accuracy & depth | ⚠️ | Surface-level feature descriptions only |
| Claims backed by evidence | ❌ | "Eve-Powered AI" — no explanation of how it works |
| Specialized vocabulary used correctly | ⚠️ | "agentic workflows" — correct term but unsubstantiated |
| Up-to-date content | ⚠️ | Metadata says "open-source, BYOK" which is current |
| Byline with author name | ❌ | No byline |

**Verdict:** A SaaS homepage for an AI product must demonstrate the team's AI/ML expertise. This page has zero team credentials, no whitepaper links, no technical architecture overview, and no blog. The words "Eve-Powered AI" and "agentic workflows" are buzzwords without substantiation.

### 1.3 Authoritativeness (claude-seo weight: 25%) — Score: 0/100 (None)

| Check | Status | Notes |
|-------|--------|-------|
| Recognized authority | ❌ | No indication of industry standing |
| Author externally cited | ❌ | No testimonials, no press mentions |
| Content cited by others | ❌ | No social proof, no logos |
| Industry awards / certifications | ❌ | None |
| Consistent publication history | ❌ | No blog, no changelog |
| Media features | ❌ | None |
| Professional affiliations | ❌ | None |

**Verdict:** Complete absence of authority signals. For a SaaS competing with Buffer, Hootsuite, Later, etc., zero social proof is a critical gap. Even early-stage projects should display GitHub stars, "As seen in" logos, or early-adopter testimonials.

### 1.4 Trustworthiness (claude-seo weight: 30%) — Score: 10/100 (Weak)

| Check | Status | Notes |
|-------|--------|-------|
| Contact info (address, phone, email) | ❌ | None. Footer only shows "Evonera" copyright |
| Privacy policy | ❌ | No link |
| Terms of service | ❌ | No link |
| HTTPS | ✅ | Assumed via Vercel (not explicitly validated) |
| Transparent content creation | ❌ | No author attribution |
| Customer reviews / testimonials | ❌ | None |
| Corrections / update history | ❌ | None |
| No deceptive practices | ✅ | No dark patterns visible |
| Return / refund policy | ⚠️ | N/A for SaaS — but no trial/pricing info either |

**Verdict:** The only trust signal is the copyright in the footer. No privacy policy, terms, contact page, or about page exists anywhere in the codebase (confirmed via grep). For a platform that will handle users' social media credentials and posting access, this is a significant trust liability.

### 1.5 E-E-A-T Composite Score: **4/100** (Very Low)

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Experience | 20% | 0 | 0.0 |
| Expertise | 25% | 5 | 1.25 |
| Authoritativeness | 25% | 0 | 0.0 |
| Trustworthiness | 30% | 10 | 3.0 |
| **Composite** | **100%** | | **4.25** |

---

## 2. CONTENT QUALITY

### 2.1 Word Count

Per **quality-gates.md**: Homepage minimum is **500 words**.

| Section | Approx. Words |
|---------|---------------|
| Hero headline + subtext | ~30 |
| Hero CTA | ~5 |
| Feature card 1 | ~25 |
| Feature card 2 | ~25 |
| Feature card 3 | ~25 |
| Feature card 4 | ~30 |
| Footer | ~5 |
| HTML/metadata | ~10 |
| **Total body text** | **~155 words** |

**Grade: FAIL** — 155 words is **31% of the 500-word minimum**. This is classified as "thin content" per quality gates. The site is unlikely to rank for any competitive keyword.

### 2.2 Readability & Clarity

| Criterion | Assessment |
|-----------|------------|
| Value proposition clarity | ✅ Good: "Autonomous Social Media" + "You just click approve" is clear |
| Headline effectiveness | ✅ Strong headline. However, "Solved." as a sub-brand is generic |
| Call-to-action clarity | ⚠️ "Get Started" / "Start Automating" — fine but no risk reversal |
| Scannability | ⚠️ 4 feature cards, good visual hierarchy, but little to scan |
| Above-the-fold engagement | ✅ Headline + CTA visible immediately |
| Jargon accessibility | ❌ "Eve-Powered AI", "agentic workflows" — unclear to non-technical buyers |

### 2.3 Value Proposition Assessment

The core idea ("AI drafts posts, you approve") is clear and differentiates from traditional schedulers like Buffer. However:

- **Missing "why":** Why is Joey better than using ChatGPT to write posts? Why is it better than Buffer's AI feature?
- **Missing "who":** Who is this for? Social media managers? Founders? Agencies?
- **Missing "how":** "Analyzes your brand voice" — how? What does that setup look like?
- **Missing "results":** What outcomes can users expect? % time saved? engagement lift?

### 2.4 Content Quality Score: **25/100**

| Factor | Score | Notes |
|--------|-------|-------|
| Word count adequacy | 10 | 155 words vs 500 minimum |
| Value proposition | 50 | Clear but unsubstantiated |
| Readability | 40 | Good for skimming but thin |
| Differentiation | 30 | Positioned vs traditional tools but no contrast vs AI competitors |
| Scannability | 50 | Good visual layout |
| **Composite** | **25** | |

---

## 3. TRUST SIGNALS

| Signal | Present? | Details |
|--------|----------|---------|
| HTTPS / SSL | ✅ | Assumed (Next.js on Vercel) — not explicitly enforced in config |
| Copyright notice | ✅ | "© 2026 Evonera" in footer |
| Company name | ✅ | "Evonera" — no link to company site |
| Contact page | ❌ | Not found in codebase |
| Privacy policy | ❌ | Not found anywhere |
| Terms of service | ❌ | Not found anywhere |
| About page | ❌ | Not found |
| Team page | ❌ | Not found |
| Social proof / testimonials | ❌ | Zero |
| Client logos | ❌ | Zero |
| Pricing page | ❌ | Not found |
| FAQ page | ❌ | Not found |
| Blog / resources | ❌ | Not found |
| Documentation | ❌ | Not found (just README) |
| Schema.org markup | ❌ | No structured data |
| Open Graph tags | ❌ | Not in layout.tsx metadata |
| Twitter cards | ❌ | Not set |
| Robots meta | ❌ | Not set |
| Sitemap | ❌ | Not detected |

**Trust Score: 8/100**

This is critical for a platform that asks users to connect their social media accounts. Potential users will (correctly) be hesitant to grant access to Twitter/LinkedIn/Facebook APIs without seeing a privacy policy and terms of service.

---

## 4. CONTENT GAPS

### Critical Gaps (blocking conversions)

1. **No privacy policy** — Must have for a SaaS handling OAuth tokens and social media access.
2. **No terms of service** — Legal requirement for user-generated content and API access.
3. **No contact / support information** — How do users get help or report issues?
4. **No social proof** — Zero testimonials, case studies, or user logos.
5. **No pricing or trial CTA** — The only CTA is "Start Automating" with no mention of free tier, trial, or pricing.

### Major Gaps (significantly harming conversion)

6. **No about / team page** — Who built this? Why should I trust you with my social accounts?
7. **No product demo / screenshots** — The page describes features but shows nothing. A video or interactive demo would dramatically improve conversion.
8. **No blog / resource section** — Zero content marketing. No SEO traffic potential from educational content.
9. **No FAQ** — Common objections (security, platform support, pricing, cancellations) unaddressed.

### Medium Gaps (optimization opportunities)

10. **No Open Graph or Twitter Card metadata** — Links will render as plain URLs when shared on social media.
11. **No schema markup** — No `SoftwareApplication`, `Organization`, or `FAQPage` schema.
12. **No comparison page** — How is Joey different from Buffer, Hootsuite, Sprout Social, or Typefully?
13. **No changelog or roadmap** — No transparency about product development.
14. **No llms.txt** — For AI crawler discoverability (per GEO skill guidance).
15. **No "How it works" section** — The 4 features are listed but there is no step-by-step explanation of the workflow.

---

## 5. OVERALL CONTENT SCORE

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| E-E-A-T Composite | 35% | 4 | 1.4 |
| Content Quality | 30% | 25 | 7.5 |
| Trust Signals | 20% | 8 | 1.6 |
| Content Completeness (gaps) | 15% | 10 | 1.5 |
| **Overall** | **100%** | | **12/100** |

### Health Rating: 🔴 **Critical** (0-29 range)

---

## 6. PRIORITIZED RECOMMENDATIONS

### P0 — Immediate (blocker for any user trust / signup)

| # | Recommendation | Dimension | Effort | Impact |
|---|---------------|-----------|--------|--------|
| 1 | **Add privacy policy & terms of service pages** — Link in footer. Use standard SaaS templates (e.g., Termly, Iubenda). | Trust | Low | Critical |
| 2 | **Add contact / support info** — At minimum an email address (hello@joey.ai) or support link. | Trust | Low | Critical |
| 3 | **Add Open Graph metadata** (`og:title`, `og:description`, `og:image`) and Twitter card tags in `layout.tsx`. | Content Quality | Low | High |
| 4 | **Add `SoftwareApplication` + `Organization` schema markup** to the homepage. | Content Quality | Low | High |

### P1 — High (directly impacts conversion)

| # | Recommendation | Dimension | Effort | Impact |
|---|---------------|-----------|--------|--------|
| 5 | **Expand homepage to 500+ words** — Add sections: "How It Works" (3 steps), "Who It's For" (target audience), "Security & Privacy" (data handling). | Content Quality | Medium | High |
| 6 | **Add social proof** — GitHub star count, early user testimonials, "Built by" context. Even 2–3 testimonials would dramatically improve E-E-A-T. | Authoritativeness | Medium | High |
| 7 | **Create an About / Team page** — Show who is behind Joey. Photos, LinkedIn profiles, relevant experience. | Expertise | Medium | High |
| 8 | **Add product screenshots or a short demo video** — Show the dashboard, the approval flow, the calendar. | Experience | Medium | High |

### P2 — Medium (SEO growth & differentiation)

| # | Recommendation | Dimension | Effort | Impact |
|---|---------------|-----------|--------|--------|
| 9 | **Start a blog / content section** — Publish 3-5 articles on social media automation, AI for marketing, etc. Target long-tail keywords. | Expertise | High | Medium |
| 10 | **Add a pricing page** — Even if it says "Coming Soon," signal transparency and set expectations. | Trust | Low | Medium |
| 11 | **Create an FAQ section** — Address common concerns: "Is my data safe?", "Which platforms are supported?", "Can I cancel anytime?" | Trust | Medium | Medium |
| 12 | **Add "As seen on" or press logos** — If any media mentions exist; otherwise pursue a Product Hunt launch. | Authoritativeness | Medium | Medium |
| 13 | **Improve meta description** — Current: "An open-source, BYOK social media automation platform." (55 chars). Rewrite to 120-155 chars with keyword + CTA. | On-Page SEO | Low | Medium |

### P3 — Low (nice-to-have)

| # | Recommendation | Dimension | Effort | Impact |
|---|---------------|-----------|--------|--------|
| 14 | Add llms.txt for AI crawler discoverability | GEO | Low | Low |
| 15 | Add changelog / roadmap page | Trust | Low | Low |
| 16 | Add case study template for future use | Experience | Low | Low |
| 17 | Add alt text to all images (once screenshots are added) | Accessibility | Low | Low |

---

## 7. SUMMARY

The Joey landing page has a **strong headline and clear value proposition**, but it stops there. At ~155 words of body text, no author identity, no contact info, no privacy policy, and zero social proof, the page fails every E-E-A-T dimension and the content quality gate. For an AI product that asks users to entrust their social media credentials, this is a critical trust deficit.

**The single highest-leverage action** is adding privacy policy + terms of service (P0, ~2 hours work) followed by expanding the homepage copy to the 500-word minimum with a "How It Works" section that demonstrates the team's understanding of the problem space.
