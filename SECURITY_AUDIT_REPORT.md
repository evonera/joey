# Security Audit Report

## Summary
- **Overall Risk:** High
- **Findings:** 0 Critical, 2 High, 2 Medium, 3 Low
- **Standards:** CWE Top 25 (2025), OWASP Top 10 (2025), CVSS 4.0

## Critical Findings
*None identified.*

## High Findings

### 1. Lack of Tenant/User Isolation in Composio Connect (Cross-Tenant Data Leak & IDOR)
- **Severity:** High | CVSS 4.0: ~8.7
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **OWASP:** A01:2025 Broken Access Control
- **File:** [composio-connect.ts](file:///Users/shakthi/Desktop/joey/src/lib/composio-connect.ts#L34-L51)
- **Evidence:**
  ```typescript
  function apiKey(): string {
    const key = process.env.COMPOSIO_API_KEY;
    if (!key) throw new Error("COMPOSIO_API_KEY is not set");
    return key;
  }

  async function mcpFetch(body: object, sessionId?: string): Promise<Response> {
    return fetch(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-consumer-api-key": apiKey(),
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  ```
  And [composio.ts](file:///Users/shakthi/Desktop/joey/agent/connections/composio.ts#L7-L9):
  ```typescript
    headers: {
      "x-consumer-api-key": () => process.env.COMPOSIO_API_KEY!,
    },
  ```
- **Risk:** The database connections and tool integrations via Composio use a global `COMPOSIO_API_KEY` defined at the process environment level. When calling `manageConnections` or initializing the client connections, no tenant identifier or user scope (e.g. entity ID) is passed to Composio. Consequently, all users and tenants share the exact same connected toolkits, allowing one tenant to potentially access, view, modify, or execute actions on another tenant's connected tools (e.g. Gmail, Slack, GitHub).
- **Fix:** Use Composio's entity-scoping features by passing a unique tenant ID (e.g., `tenantId`) in the connection headers or arguments to isolate accounts per tenant.

### 2. Transitive Dependency Vulnerability in `sharp` (Runtime Image Optimization)
- **Severity:** High | CVSS 4.0: ~7.5
- **CWE:** CWE-1395 (Use of Vulnerable Third-Party Component)
- **OWASP:** A03:2025 Software and Data Supply Chain Failures
- **File:** [package.json](file:///Users/shakthi/Desktop/joey/package.json#L58)
- **Evidence:**
  ```json
  "next": "16.3.0-preview.6"
  ```
- **Risk:** Next.js transitively depends on the `sharp` library for production image optimization. The version resolved by `npm install` contains multiple high-severity vulnerabilities inherited from `libvips` (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591) which could lead to arbitrary code execution or denial of service when processing user-submitted image files.
- **Fix:** Explicitly override the `sharp` dependency in `package.json` to version `0.35.0` or higher.

## Medium Findings

### 3. Missing `SameSite` Attribute on Custom OAuth Cookies
- **Severity:** Medium | CVSS 4.0: ~4.3
- **CWE:** CWE-384 (Session Fixation)
- **OWASP:** A07:2025 Authentication Failures
- **File:** [zernio.ts](file:///Users/shakthi/Desktop/joey/src/app/actions/zernio.ts#L48-L54)
- **Evidence:**
  ```typescript
          cookieStore.set('zernio_oauth_state', state, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              maxAge: 10 * 60, // 10 mins
              path: '/'
          });
  ```
  And [zernio.ts](file:///Users/shakthi/Desktop/joey/src/app/actions/zernio.ts#L137-L142):
  ```typescript
              cookieStore.set('zernio_oauth_session', encrypt(JSON.stringify({ tempToken, userProfile })), {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  maxAge: 10 * 60,
                  path: '/'
              });
  ```
- **Risk:** The application stores transient OAuth state and session parameters in custom cookies (`zernio_oauth_state` and `zernio_oauth_session`) but does not explicitly set a `SameSite` attribute. If a user navigates to the application from an external link, browsers that do not default to `SameSite=Lax` could leak these cookies or expose them to Cross-Site Request Forgery (CSRF).
- **Fix:** Explicitly set `sameSite: 'lax'` or `sameSite: 'strict'` when setting these cookies.

### 4. Missing Content Security Policy (CSP) and HSTS Headers
- **Severity:** Medium | CVSS 4.0: ~4.0
- **CWE:** CWE-693 (Protection Mechanism Failure)
- **OWASP:** A02:2025 Security Misconfiguration
- **File:** [next.config.ts](file:///Users/shakthi/Desktop/joey/next.config.ts#L6-L17)
- **Evidence:**
  ```typescript
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ],
        },
      ];
    },
  ```
- **Risk:** The Next.js application configures several security headers, but does not define `Content-Security-Policy` (CSP) or `Strict-Transport-Security` (HSTS). A missing CSP increases the application's susceptibility to Cross-Site Scripting (XSS) and data exfiltration.
- **Fix:** Implement a robust CSP and HSTS header under the Next.js config or verify that the hosting/CDN layer enforces them.

## Low Findings

### 5. Non-Standard IV Size for AES-GCM Encryption
- **Severity:** Low | CVSS 4.0: ~2.1
- **CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)
- **OWASP:** A04:2025 Cryptographic Failures
- **File:** [crypto.ts](file:///Users/shakthi/Desktop/joey/src/lib/crypto.ts#L16)
- **Evidence:**
  ```typescript
  const iv = crypto.randomBytes(16);
  ```
- **Risk:** NIST guidelines recommend a 12-byte (96-bit) IV size for AES-GCM. Using a 16-byte IV forces Node's underlying OpenSSL cryptographic library to compute an extra GHASH step to derive the actual IV length, which introduces minor computation overhead and can theoretically reduce cryptographic strength compared to a 12-byte IV.
- **Fix:** Change the IV length to 12 bytes (`crypto.randomBytes(12)`) and update the corresponding decryption slice offsets.

### 6. Hardcoded Database Credentials in Compose Configuration
- **Severity:** Low | CVSS 4.0: ~1.5
- **CWE:** CWE-798 (Use of Hardcoded Credentials)
- **OWASP:** A07:2025 Authentication Failures
- **File:** [docker-compose.yml](file:///Users/shakthi/Desktop/joey/docker-compose.yml#L23-L25)
- **Evidence:**
  ```yaml
      environment:
        - POSTGRES_USER=postgres
        - POSTGRES_PASSWORD=postgres
        - POSTGRES_DB=joey
  ```
- **Risk:** Plaintext local PostgreSQL credentials are saved in the tracked `docker-compose.yml` file. If this configuration is used directly or modified for deployments/staging without overriding the environment, default credentials could be exposed.
- **Fix:** Reference environment variables (e.g., `POSTGRES_PASSWORD: ${DB_PASSWORD}`) to fetch credentials dynamically at runtime.

### 7. Missing Healthcheck in Container Definition
- **Severity:** Low | CVSS 4.0: ~1.0
- **CWE:** CWE-16 (Configuration)
- **OWASP:** A02:2025 Security Misconfiguration
- **File:** [Dockerfile](file:///Users/shakthi/Desktop/joey/Dockerfile#L1-L51)
- **Evidence:** The Dockerfile contains no `HEALTHCHECK` instruction.
- **Risk:** The Docker container lacks a built-in health check to signal the runtime state. Orchestrators or reverse proxies cannot automatically detect if the web server hangs or becomes unresponsive.
- **Fix:** Add a `HEALTHCHECK` command to verify that the Next.js server is successfully responding on port 3000.

## Passed Checks

- [ ] No SQL injection found (Category 1)
- [ ] Proper password hashing (Category 9)
- [ ] Database connections use parameterized queries (Category 17)
- [ ] Lockfile present and committed (Category 27 - Dependencies)
- [ ] Resource ownership verified on all endpoints (Category 28 - Authorization)
- [ ] File uploads validated and sanitized (Category 29 - File Uploads)
- [ ] Input validation with schema library (Category 30 - Input Validation)
- [ ] CI/CD secrets use proper references (Category 31 - CI/CD Security)
- [ ] No unused or bloated dependencies found (Category 33 - Unused Dependencies)
- [ ] FIPS-approved algorithms and key sizes in use (Category 34 - FIPS 140-3)
- [ ] Disaster recovery, health checks, and graceful shutdown patterns present (Category 36 - BC/DR)
- [ ] Token lifetimes appropriate for app type (Category 39 - Token Lifetimes)
- [ ] No tunnel credentials or dev tunnels in production (Category 40 - Tunnels & DNS)
- [ ] WebSocket rate-limiting and authentication (Category 45 - WebSocket Security)
- [ ] Fail-safe defaults in authorization paths (Category 46 - Error Handling)
- [ ] Subresource integrity, committed lockfile, and no unsafe deserialization (Category 47 - Software Integrity)

## Compound Risks

- **Cross-Tenant Connection Manipulation + Missing CSP:** The lack of tenant isolation in Composio tool connections combined with a missing Content Security Policy (CSP) increases the risk of client-side data exfiltration. If a script injection occurs, it could leverage the global Composio session endpoints to retrieve or manipulate connected data across different workspaces.
- **Transitive Vulnerability + User Uploads:** High-severity vulnerabilities in image processing (`sharp` / `libvips`) combined with the S3/R2 asset upload and registration flow could allow a malicious user to upload a crafted image that executes code when processed by Next.js's runtime image optimization server.
