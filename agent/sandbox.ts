import { defineSandbox, defaultBackend } from "eve/sandbox";

// Harden the default sandbox: the Joey agent never needs shell/network
// access from the sandbox (all integrations run as authored tools and MCP
// connections in the app runtime). Deny egress on every backend so the
// built-in bash/file tools cannot exfiltrate data if prompted.
export default defineSandbox({
  backend: defaultBackend({
    vercel: { networkPolicy: "deny-all" },
    docker: { networkPolicy: "deny-all" },
    microsandbox: { networkPolicy: "deny-all" },
  }),
});
