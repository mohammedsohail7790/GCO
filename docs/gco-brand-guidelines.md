# GCO Brand Guidelines

Concise and practical - this documents the tokens and rules actually implemented in the codebase (`tailwind.config.ts`, `components/marketing/`), not an aspirational separate spec. If this document and the code ever disagree, the code is what's live; update this doc to match rather than the reverse.

## Brand concept

GCO is not software, and it is not an outsourced headcount. It is the combination of three things - this is the core, recurring brand idea (see `components/marketing/HumanAiInfrastructure.tsx`, the homepage section built around it):

**Human judgment + AI assistance + Operational infrastructure = Conversation Operations**

Every page should feel like an instance of this idea, not restate it verbatim.

## Logo usage

Implemented in `components/marketing/GCOLogo.tsx` - always use these components rather than recreating the mark inline.

- **`GCOMark`** - the mark alone (rounded square, "G," accent signal dot). Use where space is tight: favicon, compact contexts, social profile picture.
- **`GCOWordmark`** - "GCO" text in the display face. Use with the mark, never alone in a context where a first-time visitor won't already know what GCO stands for.
- **`GCOLockup`** - mark + wordmark, with an optional spelled-out "Global Conversation Operations" tagline (`withTagline`). Use the tagline version in the footer and anywhere the acronym needs explaining on first read (the homepage hero also spells it out directly in the eyebrow, not via this component). Use the compact version (no tagline) in the header, where space is limited and the visitor has likely already seen the full name.

**Clear space:** at least the height of the mark itself on all sides - don't crowd the lockup against other content.

**Minimum size:** the mark should never render below 24px on any surface (the `sm` lockup size, 28px, is the practical floor).

**Tone variants:** `tone="onLight"` (default, solid ink-colored square) for use on light/paper backgrounds; `tone="onDark"` (translucent white square) for use directly on the ink-colored footer/hero. Never place the solid `onLight` mark on a dark background or vice versa - the contrast breaks.

**Do not:**
- Recreate the mark as a screenshot or rasterized image where the SVG component can be used instead.
- Stretch, skew, or recolor the mark outside the two defined tones.
- Add a drop shadow, gradient, or outline to the mark.

## Color palette

Marketing-site-only tokens (`tailwind.config.ts`) - deliberately separate from the `brand-*` palette used by the authenticated product (login/admin/manager/operator/client-panel/hunter), which this redesign does not touch.

| Token | Value | Use |
|---|---|---|
| `ink` | `#0B0D12` | Primary dark surface - hero, footer, CTA blocks |
| `ink-700` | `#1D2029` | Dark surface hover state |
| `paper` | `#FAFAF8` | Page background |
| `paper-surface` | `#FFFFFF` | Elevated card surface |
| `paper-border` | `#E7E5E0` | Borders/dividers on light surfaces |
| `graphite` | `#16171C` | Primary text on light |
| `graphite-secondary` | `#54555F` | Secondary text on light |
| `graphite-muted` | `#8B8C93` | Muted/label text on light |
| `accent-500` | `#3D3FDB` | The one signature accent - primary CTA, key numerals, the logo's signal dot |

**Rule:** one accent color, used sparingly (primary CTA, small highlights, the logo dot) - never as a background wash across a whole section. Don't introduce a second accent color without updating this document first.

## Typography

- **Display** (`font-display`, Space Grotesk): headlines, section titles, numerals, the wordmark. Self-hosted via `next/font/google` - no runtime network request.
- **Body** (`font-sans`/default, Inter): paragraph copy, UI text, form labels.

| Role | Size (approx.) | Weight |
|---|---|---|
| Hero H1 | 44-48px | Semibold |
| Section H2 | 30-36px | Semibold |
| Card/subsection H3 | 15-17px | Semibold |
| Body | 14-16px | Regular |
| Eyebrow/label | 11-13px, uppercase, tracked | Semibold |

Avoid more than two weights (regular/semibold) in any one composition. Avoid uppercase for anything longer than a short label.

## Buttons

- **Primary:** solid `ink` (light contexts) or solid `accent-500` (dark contexts), white text, `rounded-lg`, `px-5/6 py-2.5/3`.
- **Secondary (inline):** text link, `accent-600`, with a trailing arrow (`→`) for "view more" links; no border/background.
- One consistent primary CTA phrase site-wide: **"Book a Call"** (falls back to `/contact` when Calendly isn't configured - see `lib/integrations/calendar/provider.ts` - never a fabricated link). One consistent secondary CTA phrase: **"See How It Works."** Don't introduce a third competing CTA label.

## Border radius

- Cards/panels: `rounded-2xl` (16px)
- Buttons/inputs: `rounded-lg` (8px)
- The logo mark: `rounded-md`/`8px` corner radius at 32px reference size (scales proportionally)
- Never a full pill (`rounded-full`) except for small status dots/indicators.

## Spacing

- Section vertical padding: `py-20` to `py-24` on desktop - sections should breathe, not feel cramped.
- Card/panel internal padding: `p-6` to `p-9` depending on content density.
- Don't default to a card grid for every section - see `HumanAiInfrastructure`, the homepage's closing section, and the About page's belief list for editorial (non-card) alternatives.

## Icon style

No icon library is used. Where a small mark is needed (bullet points, the OperationsFlow diagram's channel nodes), use plain geometric shapes (dots, simple rects) in the accent or muted-text color - not an imported icon set. This keeps the visual language restrained and avoids the generic "icon-in-a-circle" pattern common to template SaaS sites.

## Motion principles

- CSS-only (no animation library) - `animate-fade-up`, `animate-fade-in`, and the `dash` keyframe (OperationsFlow's flow lines) defined in `tailwind.config.ts`.
- Every animation has a specific purpose: a hero element arriving, a drawer opening, a flow line suggesting movement through the system. Never decorative/ambient motion (no floating shapes, no infinite background gradients shifting on their own).
- `prefers-reduced-motion: reduce` is respected globally (`app/globals.css`) - all animation/transition durations collapse to near-zero for users who request it.

## Photography / illustration principles

**No stock photography, no fabricated dashboard screenshots, no fake data visualizations.** Where a visual is needed to represent the product/system (the homepage hero), use an abstract, accurate representation of the real architecture (see `OperationsFlow`) - channels, an operations layer, AI + human indicators, an outcome. Never imply a specific provider integration that hasn't been built, never show numbers that aren't real.

## Tone of voice

| Do | Don't |
|---|---|
| "We operate..." | "We're revolutionizing..." |
| "Human operators, AI-assisted workflows, and operational infrastructure." | "Next-generation AI-powered solutions." |
| "Built for reliable execution." | "Transform your business overnight." |
| "People handle the conversations that require judgment." | "Humans are obsolete." |

Confident, specific, calm, human. State what GCO actually does in plain terms rather than reaching for hype language. Specificity is the credibility mechanism in the absence of case studies/testimonials/logos - see `docs/client-capability-matrix.md`'s VERIFIED/INTEGRATION-READY/PLANNED distinctions, which the website's copy must never blur.
