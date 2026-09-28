# Client Integration Estimation Framework

**No fake fixed timelines.** An estimate is only as good as the information behind it - use the categories below to communicate confidence honestly, and require the listed information before giving any number to a client.

## SIMPLE

Existing adapter/configuration with a documented API, using a pattern GCO has already built and proven (the general webhook-ingestion pipeline, HMAC verification, dedup/idempotency).

**Required before estimating:** confirmed API documentation, confirmed authentication method, confirmed webhook availability (or equivalent), no unusual data-mapping requirements.

## MODERATE

The existing adapter interface fits, but this client's specific data mapping, message format, or configuration needs real work beyond swapping in credentials.

**Required before estimating:** everything SIMPLE requires, plus a clear picture of the client-specific mapping (custom fields, non-standard message shapes, multiple systems needing correlation).

## COMPLEX

A new provider/API behavior GCO hasn't built an adapter for yet, or a substantial custom workflow (e.g. a genuinely new kind of escalation logic, a new data-retention requirement needing schema changes).

**Required before estimating:** full API/webhook documentation, a sandbox to build and test against, and a completed `docs/integration-feasibility-template.md` for the specific provider.

## BLOCKED

Missing API access, documentation, permissions, or third-party approval (e.g. WhatsApp/Meta Business verification pending, client hasn't provided sandbox access, a required third-party approval hasn't been granted).

**Required before estimating:** nothing can be estimated meaningfully until the blocker is named and a path to resolving it exists. State the blocker plainly to the client rather than guessing a number around it.

## How to use this

1. Complete `docs/integration-feasibility-template.md` for the specific integration first.
2. Place it in one of the four categories above based on what that assessment actually found - not on how simple it "should" be.
3. Only give the client a timeline once the category is SIMPLE or MODERATE with all required information in hand, or COMPLEX with a sandbox/documentation confirmed available. Never estimate a BLOCKED item - name the blocker instead.
