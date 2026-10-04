# Local cross-repository Cloud contract acceptance

This opt-in check executes public Joey's actual `CustomScoutProvider` against
the operator-selected Joey Cloud checkout's actual Fastify `createApp`,
`PostgresStore`, key authentication, schema, and versioned migrations. It is
excluded from ordinary `npm test` and never provisions a database or calls a
hosted provider. Use Node 24 and installed dependencies in both checkouts.

```sh
JOEY_CLOUD_REPO_PATH=/absolute/path/to/joey-cloud \
JOEY_CLOUD_TEST_DATABASE_URL=postgres://LOCAL_TEST_USER:LOCAL_TEST_PASSWORD@127.0.0.1:LOCAL_TEST_PORT/joey_cloud_contract_test \
npm run test:integration:cloud-contract
```

The database URL must use PostgreSQL, a loopback hostname, and a database name
ending `_test`; remote databases are refused. Supply a disposable local Cloud
database, not Joey's application database. The check applies only Cloud's
existing migrations and removes only the service workspaces/keys/runs it created
(workspace deletion cascades its usage rows). Existing rows and Docker volumes
are preserved. The runner starts two HTTP listeners on ephemeral loopback
ports, closes them afterward, and does not start or stop your database.

## What this proves

- The real Joey adapter emits protocol v1, the workspace bearer, exact-endpoint
  bound server-only Modal credentials, and stable opaque idempotency headers.
- Real Cloud HTTP requests and Postgres transactions replay completed evidence,
  isolate two workspaces, reject revoked keys and paused workspaces even on
  replay, and allow only one reservation in a concurrent daily-quota race.
- Malformed collector/wire evidence fails closed. Upstream exceptions are
  redacted in the Cloud operational reporter and the Joey adapter error.
- Pre-cancelled calls never enter the transport; mid-collection cancellation
  traverses actual HTTP socket disconnects to Cloud's collection abort signal.
  Its failed receipt retains conservative usage, and replay cannot recollect.

## Exact substitutions and limits

Vitest replaces only Joey's `outboundRequest` network hop and `dns/promises`
lookup. The actual source/HTTPS/private-IP validation, target resolver, adapter,
headers helper, payload construction, and evidence parser execute unchanged.
The transport replacement checks the exact approved HTTPS endpoint and request
bounds, then sends those actual headers/body to a loopback HTTP proxy. The proxy
simulates Modal's outer key/secret gate and forwards only the workspace bearer,
content type, and idempotency key to the real Cloud HTTP server. One case
deliberately corrupts the proxy response to test Joey's parser.

Cloud uses its supported `dnsCheck` injection to avoid hosted DNS, and a
deterministic collector that delegates ordinary output/validation to the real
`FixtureCollector`. Special fixture modes wait for cancellation or return
malformed evidence/throw a sensitive-looking error. No Apify, AI, social,
payment, hosted database, or real Modal request occurs.

This is **cross-repository adapter/HTTP/persistence contract acceptance**, not a
full Joey UI/Eve evaluation or hosted end-to-end test. It does not prove hosted
Modal/TLS routing, production DNS pinning, encrypted workspace-key lookup,
approvals, production migration application, alert delivery, or real collector
behavior. Those require their separate acceptance gates.
