# Joey's public core and optional managed services

## What this change does

Joey stays MIT-licensed and independently usable. Scout collection now goes
through `ScoutDataProvider`; existing Apify collection remains the default.
The public app still owns its database, tenant authorization, Eve delegation,
account bindings, run history, approvals, budgets, research, draft creation,
and publication gates. A collection provider returns evidence only. It cannot
approve a draft, select a publishing account, or invoke Joey tools.

This repository does **not** implement a private Joey Cloud collector or sell
included collection/render capacity. The custom adapter is a service boundary
that a self-host operator or future private service can implement.

| Keep in public Joey                                   | Potential new private Joey Cloud work                |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Compose, Calendar, Theme Studio, agent roster/chat    | Managed collection infrastructure and operations     |
| Basic Eve delegation, approvals, permissions, budgets | New premium research/ranking and curated datasets    |
| BYOK Apify and self-host render recipes               | Managed render capacity, queues, monitoring, support |
| Provider interfaces and run-status UI                 | New enterprise integrations and workflow packs       |

Already-public MIT code does not become exclusive by moving it into a private
repository. MIT permits proprietary derivatives subject to its notices; existing
recipients retain their licensed rights. Preserve third-party notices and audit
actual code provenance before copying, extracting, or relicensing anything.
See [MIT terms](https://opensource.org/license/mit) and
[the provenance review](source-provenance.md). This is an engineering boundary,
not a legal clearance. Private hosting and BYOK do not establish permission to
collect or reuse social content; review platform terms, privacy, and content
rights for the particular service. See [Meta's scraping explanation](https://about.fb.com/news/2021/04/how-we-combat-scraping/).

## Configure collection

- `SCOUT_DATA_PROVIDER=apify` (default): workspace Apify key in Settings →
  Integrations, with the existing optional server `APIFY_TOKEN` fallback. A
  disabled workspace credential does not authorize production collection.
- `SCOUT_DATA_PROVIDER=mock`: only tests or development with
  `ENABLE_MOCK_SCOUTS=true`. Production refuses this mode, including when the
  flag is accidentally enabled. With default Apify, missing credentials may use
  the same development/test fixture fallback; production never does.
- `SCOUT_DATA_PROVIDER=custom`: set server-only `SCOUT_PROVIDER_ENDPOINT` to a
  public HTTPS endpoint, without credentials, query, or fragment. In each
  workspace, an owner/admin saves its provider-issued key under **Custom Scout
  provider** in Settings → Integrations. Keys use tenant-bound encryption under
  provider `scout-data`. There is no global custom-key fallback or automatic
  retry/fallback to Apify after a custom failure.

Setup readiness means configuration/credentials resolve, not that a remote
service has passed a live health check. Activation and manual scans use the same
resolver as evaluation and Agency automation. External collection does not
remove the separate AI/Exa/media requirements or execution kill switches.
Collection charges remain with the configured provider; Joey's AI budget ledger
does not meter vendor collection charges. Enforce provider-side quotas before
selling included usage.

## External collection protocol, version 1

Joey sends `POST` to the operator-configured endpoint with
`Authorization: Bearer <workspace-provider-key>` and `Content-Type: application/json`:

```json
{
  "version": 1,
  "targetUrl": "https://www.instagram.com/example/",
  "platform": "instagram",
  "limit": 15
}
```

Platforms: `instagram`, `tiktok`, `twitter`, `youtube`, `web`. The authenticated
key must identify a single provider customer/workspace. **The provider must
derive tenant identity and entitlements from that key**, not from a caller's
unverified tenant ID. Joey intentionally sends no user-supplied tenant identity.
Issue separate keys for different workspaces; do not reuse a master account key.

Return a 2xx JSON response with exactly this envelope:

```json
{
  "version": 1,
  "items": [
    {
      "id": "stable-source-post-id",
      "url": "https://www.instagram.com/p/example/",
      "text": "Source caption, treated as untrusted evidence",
      "views": 12000,
      "likes": 800,
      "timestamp": "2026-10-01T00:00:00Z"
    }
  ]
}
```

`id`, `url`, `text` are required. Metrics and timestamp are optional; metrics
must be finite, nonnegative, and at most 1e12. Timestamp must be an ISO datetime
with timezone. Limit: 15 items, 120-character IDs, 2048-character public HTTPS
URLs, 6000-character text, 2 MiB response. Unknown envelope/item fields and
malformed responses fail the scan; a valid empty `items` array means no change.
Stable IDs/URLs help existing alert deduplication. No facts are deemed verified
merely because a provider returned them.

The client enforces a 50-second request timeout, response cap, cancellation,
no redirects, public endpoint DNS resolution, and pinned outbound DNS. It
validates source hosts/DNS before forwarding. **The remote service must repeat
SSRF checks and pin DNS on its own network for every fetch and redirect**;
Joey's preflight cannot protect a different network or a later DNS resolution.
Provider output URLs are syntactically checked, not fetched or certified safe
for media use. Existing downstream safe-media validation still applies.

Paid collection invokes the existing `beforePaidPhase` governance hook, when
provided, before sending. Cancellation and provider failures do not create
publishable output. Errors record sanitized provider/status messages, not
tokens, private endpoint paths, or upstream response bodies. Do not send
credentials to the model, expose them in browser DTOs, or log bearer headers.

## Next steps for an actual managed service

Create a separate private service only for **new** implementations and licensed
data. First define customer-key issuance/revocation, entitlement/usage metering,
collection permission, retention/deletion, idempotency, observability, and cost
caps. Verify this protocol against a disposable staging workspace before
advertising managed collection. Keep media rendering as its existing separate
boundary; this adapter does not implement managed GPU capacity.
