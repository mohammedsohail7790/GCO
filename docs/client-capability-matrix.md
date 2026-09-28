# GCO Client Capability Matrix

Status definitions:
- **VERIFIED IMPLEMENTED** - built, deployed to production, and tested end-to-end.
- **INTEGRATION-READY / CLIENT-SPECIFIC** - the platform has a proven, general mechanism (webhook ingestion, adapter interface) that a specific channel integration plugs into, but that specific channel's connector has not been built because it requires a real client's API access/spec to build against.
- **PLANNED** - not yet started, no committed timeline.
- **PENDING CREDENTIAL / ACCOUNT** - the code path exists but is inactive because a required external credential has not been provided.

| Integration / Capability | Current Status | What Is Required | Typical Scope |
|---|---|---|---|
| Core webhook ingestion pipeline (message receive → queue → assignment → operator → reply) | **VERIFIED IMPLEMENTED** | - | Already proven live in this deployment; the general mechanism any channel integration builds on. |
| Business email (as a conversation channel) | **PLANNED** | Client's email provider access (IMAP/API or forwarding rule) | New adapter implementing the existing `IntegrationAdapter` interface. |
| Website live chat widget | **PLANNED** | Decision on widget vendor or custom embed | New adapter + a small embeddable widget. |
| WhatsApp Business | **INTEGRATION-READY / CLIENT-SPECIFIC** | Client's WhatsApp Business API access (Meta-verified) | New adapter against Meta's Cloud API; webhook signature verification already has a proven pattern to extend. |
| Instagram (DMs) | **INTEGRATION-READY / CLIENT-SPECIFIC** | Client's Instagram/Meta Business API access | Same adapter pattern as WhatsApp. |
| Messenger | **INTEGRATION-READY / CLIENT-SPECIFIC** | Client's Meta Business API access | Same adapter pattern. |
| Shopify | **INTEGRATION-READY / CLIENT-SPECIFIC** | Client's Shopify store API credentials/scopes | Order/customer-lookup integration for support context, not a channel adapter - scoped once we know what data the client wants surfaced to operators. |
| WooCommerce | **INTEGRATION-READY / CLIENT-SPECIFIC** | Client's WooCommerce REST API keys | Same category as Shopify. |
| Calendly (discovery-call booking) | **PENDING CREDENTIAL / ACCOUNT** | A `CALENDLY_SCHEDULING_URL` - the app already reads this env var and will show a live "Book a Call" button the moment it's set; until then, the site's CTA falls back to the Contact form (verified behavior, not broken). | Configuration only, no development. |
| OpenAI (AI-assisted operator suggestions / memory) | **PENDING CREDENTIAL / ACCOUNT** | A production `OPENAI_API_KEY`. `AI_PROVIDER` is currently `mock` - the platform runs correctly without it, with AI features producing deterministic mock output rather than real model responses. | Configuration only once a key is provided; no architecture change. |
| Custom client API / webhook | **INTEGRATION-READY / CLIENT-SPECIFIC** | The client's own API spec or webhook payload shape | New adapter, typically the fastest integration to build since the pipeline behind it (dedup, HMAC verification, queueing, assignment) is already production-proven. |

**Note on "integration-ready":** every one of the client-specific rows above plugs into the same `IntegrationAdapter` interface already proven live in this deployment (the demo conversation you saw in the live demo went through exactly this pipeline via the reference `dev-mock` adapter). Building a specific channel's adapter is a scoped, typically fast engineering task once that channel's real API access is available - it is not new platform architecture.
