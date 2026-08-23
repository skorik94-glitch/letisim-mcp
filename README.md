# Letisim retail MCP

Public, redirect-first MCP surface for consumer eSIM discovery and checkout handoff.

The server deliberately does not accept email or payment credentials. `create_checkout` persists
only an inert, PII-free `AgentCheckout`; the buyer must open the returned first-party Letisim URL.
The existing web checkout then re-quotes, collects email/legal action, creates the Order/Payment and
hands payment data directly to the PSP.

## Local run

```sh
npm run build -w @letisim/retail-mcp
# Start the API separately with RETAIL_MCP_ENABLED=1 in a non-production test environment.
LETISIM_API_BASE_URL=http://127.0.0.1:3200 npm run start:http -w @letisim/retail-mcp
```

The Streamable HTTP endpoint is `http://127.0.0.1:3210/retail`; `start:stdio` exposes the same tool
factory to a local MCP host. A non-loopback bind is fail-closed unless
`RETAIL_MCP_ALLOWED_HOSTS` is set. This package is private/test-only until the legal, tax, receipt,
abuse, client-matrix and controlled-live gates in the ExecPlan are closed. The API routes are
fail-closed unless `RETAIL_MCP_ENABLED=1`; the key is intentionally not in the generic production
env writer allowlist.

## Partner attribution

An installation can be attributed to an affiliate partner with one environment variable:

```sh
LETISIM_MCP_ATTRIBUTION=promo:TRAVELPRO   # or ref:<campaign-slug>
```

Purchases started by that installation carry the partner's promo code into the first-party
checkout URL, and the existing affiliate rules decide the commission. The handle is deliberately
not a tool argument: an agent that read an untrusted page must not be able to redirect somebody
else's commission. A malformed, unknown or revoked handle degrades to an unattributed checkout and
never fails the purchase. Ask for your handle in the Letisim affiliate cabinet at
<https://partner.letisim.com>.

## Install in Claude Code

```sh
claude plugin marketplace add skorik94-glitch/letisim-mcp
claude plugin install letisim@letisim
```

The plugin runs the bundled `dist/stdio.js`, so it needs no npm package and no build step. Export
`LETISIM_MCP_ATTRIBUTION` before starting Claude Code if you are an affiliate.

## Current capability

Plan search, destination coverage and prices are live against the production catalog. Quoting and
the checkout handoff answer `404` until Letisim opens the agent commerce gate — that is a
deliberate server-side switch, not a client bug.

## Distribution

Registry metadata lives in `server.json` and is kept in sync with `package.json` by
`test/distribution.test.ts`. The public repository <https://github.com/skorik94-glitch/letisim-mcp>
is generated from the Letisim monorepo by `scripts/sync-retail-mcp-public.mjs`: edit the source
upstream, never in the mirror.
