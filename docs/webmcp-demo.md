# WebMCP demo script

This document is the reproducible demo + recording script for Joey's WebMCP surface. It assumes the repository is deployed to an HTTPS origin with the WebMCP origin trial registered (see `docs/webmcp.md`).

## Prerequisites

- Deployed Joey origin with `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` set (Chrome/Edge origin trial) or ChatGPT Desktop (no token needed).
- A signed-in Joey user with a tenant.
- A browser agent that can discover and invoke WebMCP tools on the open page: Chrome 149+ with the trial, Edge 150+ with the trial, Brave Leo (experimental), or ChatGPT Desktop.
- For the Theme Studio segment: a Theme Page with at least one source and slot configured, and a connected Zernio account.

## Act 1 — Flow builder copilot (~90 seconds)

1. Open a flow at `/flows/:id`.
2. Ask the agent: "What tools does this page expose?" Confirm it lists the 7 flow-builder tools.
3. Ask: "Inspect my flow and tell me what it does." (`joey_inspect_staged_flow`)
4. Ask: "Add an RSS node reading <feed URL> after the schedule trigger." (`joey_add_flow_node`)
5. Point out that the change appears on the canvas as an unsaved, staged change. Ask: "Validate the flow." (`joey_validate_staged_flow`)
6. Emphasize: the agent cannot save or run the flow. Save manually and note the staged change becomes a real flow edit.

Human-boundary beat: attempt to make the agent publish or activate the flow and show it refusing or deferring to the person.

## Act 2 — Engagement inbox triage (~60 seconds)

1. Open `/engagement` with a comment or DM selected.
2. Ask: "Summarize this conversation." (`joey_list_engagement_conversations` + `joey_inspect_selected_engagement`)
3. Ask: "Draft a reply that thanks them and links to the launch post." (`joey_stage_reply_edit`)
4. Show the draft appearing in the editor with a "staged by agent" indicator, and that it is not sent until you click Save and then Approve & Send.

Human-boundary beat: ask the agent to send the DM; show it cannot.

## Act 3 — Theme Studio readiness check (~60 seconds)

1. Open a Theme Page at `/theme-studio/:id`.
2. Point out the "WebMCP ready" badge in the header when registration succeeded.
3. Ask: "Inspect this theme page." (`theme_studio_inspect_page`) — show sources, slots, packages.
4. Remove a required piece of config (e.g., pause the last source), then ask: "Is this page ready to activate?" (`theme_studio_check_readiness`) and show the issue list explaining exactly what to fix.
5. Ask the agent to activate the page or approve a package; show it cannot — activation, approval, publishing, and DM sending are human-only.

## Recording checklist

- Show the "WebMCP ready" badge appearing on each surface.
- Show at least one staged edit that the agent made appear in the UI, followed by the human save.
- Show one denied action (activate / publish / send) with the agent deferring to the person.
- Keep each act under 90 seconds; total under 4 minutes.
- Record with the browser's WebMCP tool list visible (agent UI) if the browser exposes it.

## Known environment caveats

- WebMCP is origin-trial gated in Chrome/Edge: a browser without the trial shows no badge and registers no tools; pages still work normally.
- Theme Studio's two tools are read-only by design; there is deliberately no tool that approves or publishes.
