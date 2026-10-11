"""Push source evidence from the installed local UGC collectors into Joey.

No public listener is required. Login cookies, if the operator configured
UGC_COOKIES_FILE, stay on the operator's computer. Data never grants approval.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def observation(record):
    result = {"id": str(record["id"]), "url": record["url"], "text": str(record.get("caption") or record.get("title") or "")[:6000]}
    if record.get("published_at"):
        result["timestamp"] = record["published_at"]
    for output, names in [("views", ["views", "view_count"]), ("likes", ["likes", "like_count"])]:
        for name in names:
            value = record.get(name)
            if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1e12:
                result[output] = value
                break
    return result


def request(origin, token, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(origin + path, data=data, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    # API credentials must never follow a redirect to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            return json.loads(response.read(256 * 1024))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Joey API returned HTTP {error.code}; verify the origin, token scopes and saved Scout configuration.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ugc-root", default=os.environ.get("JOEY_UGC_ROOT"), required=not bool(os.environ.get("JOEY_UGC_ROOT")))
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--scout-id")
    target.add_argument("--post", help="Individual social post URL whose media should be offered to a Theme Studio package")
    parser.add_argument("--package-id", help="Required with --post")
    parser.add_argument("--rights", choices=["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"], help="Declare reuse rights when importing post media")
    parser.add_argument("--joey-url", default=os.environ.get("JOEY_URL", "https://joey-alpha-five.vercel.app"))
    parser.add_argument("--limit", type=int, default=5, choices=range(1, 16))
    parser.add_argument("--dry-run", action="store_true", help="Collect and validate observations without sending them to Joey")
    parser.add_argument("--watch", action="store_true", help="Keep collecting at the saved polling interval while this process is running")
    args = parser.parse_args()
    origin = urllib.parse.urlparse(args.joey_url)
    if origin.scheme != "https" or origin.username or origin.password or origin.query or origin.fragment or origin.path not in ("", "/"):
        parser.error("Use the HTTPS origin of your Joey deployment without a path or credentials")
    token = os.environ.get("JOEY_API_TOKEN", "")
    if not token:
        parser.error("Set JOEY_API_TOKEN to a workspace token with read and write scopes")
    root = Path(args.ugc_root).expanduser().resolve()
    if not (root / "studio/discovery.py").is_file():
        parser.error("UGC root must contain studio/discovery.py")
    sys.path.insert(0, str(root))
    from studio.discovery import discover, identify
    api = args.joey_url.rstrip("/")
    if args.post:
        if args.watch:
            parser.error("--watch is only for Scout monitoring")
        if not args.package_id or not args.rights:
            parser.error("--post requires --package-id and --rights")
        if identify(args.post)["is_profile"]:
            parser.error("Media import needs an individual post URL, not a profile")
        record = discover(args.post, 1)[0]
        media = [{"url": item["url"], "kind": item["kind"]} for item in record.get("media", [])[:8] if item.get("kind") in {"image", "video"}]
        if record.get("thumbnail") and not media:
            media = [{"url": record["thumbnail"], "kind": "image"}]
        if not media:
            parser.error("Post exposes no downloadable media; upload an owned source file in Assets")
        payload = {"sourceUrl": record["url"], "rightsCategory": args.rights, "media": media}
        result = {"dryRun": True} if args.dry_run else request(api, token, "/api/v1/theme-packages/" + urllib.parse.quote(args.package_id, safe="") + "/source-media", payload)
        print(json.dumps({"packageId": args.package_id, "mediaFound": len(media), "imported": result.get("imported", False), "dryRun": args.dry_run}))
        return
    first = True
    while True:
        sources = request(api, token, "/api/v1/scouts?scoutId=" + urllib.parse.quote(args.scout_id, safe=""))["scouts"]
        scout = next((source for source in sources if source["id"] == args.scout_id), None)
        if not scout:
            parser.error("Scout was not returned for this workspace token")
        target = identify(scout["targetUrl"])
        if target["platform"] != scout["platform"]:
            parser.error("Scout platform does not match the supported local collector")
        if first or not args.watch or scout["isActive"]:
            try:
                records = discover(scout["targetUrl"], args.limit)
                payload = {"version": 1, "scoutId": scout["id"], "targetUrl": scout["targetUrl"], "platform": scout["platform"], "items": [observation(record) for record in records]}
                result = {"dryRun": True} if args.dry_run else request(api, token, "/api/v1/scouts/observations", payload)
                print(json.dumps({"scoutId": scout["id"], "items": len(records), "evidenceHash": hashlib.sha256(json.dumps(payload["items"], sort_keys=True).encode()).hexdigest(), **result}), flush=True)
            except (RuntimeError, ValueError, urllib.error.URLError) as error:
                if not args.watch:
                    raise
                print(json.dumps({"scoutId": scout["id"], "status": "access_failed", "message": str(error)}), file=sys.stderr, flush=True)
        first = False
        if not args.watch:
            break
        time.sleep(max(15, min(1440, scout["pollIntervalMinutes"])) * 60)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, urllib.error.URLError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
