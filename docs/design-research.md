# Design research → build plan

Research pass completed 2026-10-16. Each source, what it actually contributed, and where that
lands in the build. This is the reasoning behind [`../DESIGN.md`](../DESIGN.md).

---

## A. Source-by-source

### 1. Scrolltide — scrolltide.co
> "600+ design prompts and source code for 3D & scroll-driven web animations."
> 121 templates, 66 components, 55 shaders, 19 sections.

**What it gave:** the *philosophy* ("ship websites that move like the tide", "doesn't look AI-made")
and a library of **section patterns** rather than a style.
**What we took:** `Step Path` / `Step Accordion` → the "How it works" section on the landing page.
`Scroll Index` → a sticky section indicator. `Reel Slider` → the client logo marquee.
`Aurora / Mesh` shaders → a single low-opacity mesh behind the hero. Lenis smooth scroll.
**What we rejected:** 3D-heavy page templates. The marketing page gets depth from *one* animated
route polyline and *one* shader; the application itself stays a fast instrument.

### 2. Navbar Gallery — navbar.gallery
> Curated navbars, tagged: static, dropdown, megamenu, search bars, sidebars, tabs, fullscreen, progress bars, announcement.

**What it gave:** confirmation that the *sidebar* category is the relevant one for an app, and that
grouped rails beat flat lists. The "announcement bar" and "search bar" patterns informed the top bar.
**What we took:** grouped left rail with collapsible state; a persistent `⌘K` search affordance in the top bar;
badge placement on nav items that must not be missed (pending bookings, open incidents).
**What we rejected:** megamenus and fullscreen nav — wrong register for an internal operations tool.

### 3. Footer Design — footer.design
> The only footer gallery on earth. Editor's Choice entries with heavy editorial typography.

**What it gave:** the current footer in the codebase is one line of centred 12px text. That is the
weakest surface in the product and it reads as boilerplate.
**What we took:** oversized wordmark, four link columns, a "Northeast Tomato"-style descriptive lede
in the top-left cell, a live status indicator, and a legal row separated by **vertical pipes**
(the Raycast metadata detail — pipes signal "technical metadata" rather than prose).
**What we rejected:** newsletter capture and social icon rows — no audience to capture.

### 4. CTA Gallery — cta.gallery
> High-converting call-to-action sections, filterable by industry and mode.

**What it gave:** a discipline check. The current landing has two equal-weight buttons
(`Enter the platform` + `Architecture & API docs`) — the classic "we couldn't decide" pattern.
**What we took:** one dominant `--signal` fill with a ghost/outline secondary, one line of supporting
copy, and the CTA section as a full-bleed band rather than a centred card.
**What we rejected:** CTA sections as isolated floating cards.

### 5. Refero Styles — styles.refero.design
> 2,000+ AI-readable `DESIGN.md` design systems extracted from real product sites.

**This was the most valuable source**, because it gave us a *method*, not just pictures: a design
system can be written as an explicit contract of colour, type, spacing, radius, motion, plus a
**Do / Don't** list — and that contract can be committed to the repo so every later change is checked
against it. That is precisely how you avoid "generic AI" output: you stop describing taste in
adjectives and start specifying tokens.

**The four styles studied in full, and what each one contributed:**

| Style | Line | What it taught us |
| --- | --- | --- |
| **Axelar** | "Signal lights through dark lattice" | The anchor. Near-black canvas `#04070a`, tonal surface ladder (canvas → card → nav → border) instead of shadows, **one** chromatic authority (`#ff6314` Signal Orange) for actions and active states only, other hues demoted to 8px "node dot" indicators, Clashgrotesk + Inter + DM Mono. |
| **Raycast** | "Midnight command center, coral neon" | The "keyboard key" elevation treatment — an inset top highlight + hairline instead of a drop shadow. Also the *metadata pipes* footer detail, and the discipline of a 98%-achromatic page. |
| **Caldera** | "forge fire on warm limestone" | The warm light-mode canvas (`#f7f6f2` limestone, not `slate-50`), the warm grey card vs. warm grey canvas figure/ground split with no shadows, and the "one vivid accent against monochrome warm greys" rule. |
| **Mercury / Brex / Intercom** | "alpine banking at blue hour", "white concrete, single ember" | Confirmed the warm-neutral light theme: enterprise does not have to be cold blue-grey. |

**What we took:** Axelar's system, adapted — Signal Orange retained, tonal surface ladder retained,
node-dot status encoding retained, its three-font pairing retained (substituted with Google-Fonts
equivalents: Space Grotesk / Inter / JetBrains Mono).
**What we rejected:** its 24px pill *inputs* (pill buttons yes, tight fields better for dense forms),
and its 6px base unit (we use 4px).

### 6. Supahero — supahero.io
> Curated hero sections. Anubi, Zed, 35mm, Better Stack, Raycast-adjacent…

**What it gave:** a reality check on hero composition. Almost every hero in the gallery is
*one headline + one sentence + one button + one visual*. The visual is the product, not an illustration of the product.
**What we took:** hero = 74px Space Grotesk display headline, one supporting paragraph, one `--signal` CTA,
and a **real product surface** (the actual dispatch board, live) as the visual.
**What we rejected:** gradient-orb hero visuals, floating 3D icons, badge clouds.

### 7. 3dicons — 3dicons.co
> 1500+ hand-made 3D icons, **CC0**, colour/angle editable, downloadable.

**What it gave:** a licence-clean 3D asset source (CC0 = no attribution required, commercially safe).
**What we took:** 3D icons for the *marketing* page and for empty states — one per section, recoloured
into the palette so they read as part of the system rather than stock.
**What we rejected:** 3D icons in the application chrome. In a dense ops console they read as toys.
The app uses a 1.5px-stroke Lucide set instead, at uniform optical weight.

### 8. liquid-glass — glass.samasante.com
> Real DOM refraction, Safari/Firefox/Chrome, zero dependencies, MIT.

**What it gave:** a *restrained* way to use glass. Real refraction, not `backdrop-blur` fake.
**What we took:** exactly three placements — command palette, mobile bottom sheet, floating dispatch dock.
Each is a floating layer that genuinely sits over content, which is the only place refraction reads correctly.
**What we rejected:** glass cards, glass tables, glass everything. Glass as a default surface is a
2021 look and it destroys text contrast over busy data.

### 9. Godly → Recent.design
> "The gold standard for modern, WebGL, 3D and high-interaction web design."

**What it gave:** the bar for *motion quality* — the difference between "animated" and "alive" is
inertia, easing and sequencing, not the number of effects. Also the discipline of restraint.
**What we took:** a strict motion budget (120/180/320ms, one easing curve, no springs) and the
decision that all 3D/WebGL lives on the marketing page only.
**What we rejected:** WebGL in the application. A dispatcher on a phone on patchy Accra 3G does not
need a shader; they need the trip board to load in under a second.

### 10. Mobbin — mobbin.com
> 621,500 shipped screens from real apps.

**What it gave:** the mobile app flows. The reference apps for "book a ride" and "driver duty start"
are single-column, one-decision-per-screen, with the primary action in the thumb zone — not a
desktop layout squeezed to 375px.
**What we took:** the driver and passenger apps are designed mobile-first as their own surfaces with
a bottom tab bar, a thumb-zone primary action, a 4-cell mono OTP input for boarding verification,
and an explicit offline queue state.
**What we rejected:** the "app shell with a sidebar" pattern for mobile.

### 11. Land-book — land-book.com
> Curated website inspiration, filterable by page type.

**What it gave:** page-type structure. A real enterprise SaaS site has: landing, pricing, security,
about, customers, careers, contact, changelog. It also confirmed the headline gallery —
**headlines are a design artefact worth studying on their own.**
**What we took:** a *headline-first* approach to the landing page — the headline is designed, not
generated; the marketing page is structured like a real enterprise product site (hero → proof →
pillars → how it works → metrics → security → CTA → footer) rather than a feature list.
**What we rejected:** the generic "Trusted by" logo row as a substitute for actual proof — we use
real operational numbers instead.

### 12. Dark Mode Design — darkmodedesign.com
> Hand-picked showcase of websites featuring dark themes.

**What it gave:** how to stop a dark theme looking like an inverted light theme. The recurring
techniques: hairline borders instead of shadows, a *warm* or *tinted* near-black rather than pure
grey, one accent that glows, and status colours that are actually luminous against the dark.
**What we took:** `#04070A` (blue-cast near-black) rather than `#0A0A0A`; `--text-1` at `#F0F5FA`
(slightly cool near-white) rather than `#FFF` everywhere; status colours chosen for luminance
against the canvas; dark mode shipped **day one** via `prefers-color-scheme` with a no-flash script.
**What we rejected:** "dark mode = an inverted palette" and glow-heavy neon.

### 13. Saaspo — saaspo.com
> 791 SaaS landing pages, 392 pricing, 239 product, filterable by stack.

**What it gave:** the enterprise landing page *spine*, and the reminder that the app and the
marketing site are two different design systems sharing one palette.
**What we took:** the marketing page follows a proven enterprise spine; the application follows
neither it nor any template. The shared primitives (colour, type, radius, motion) are the only
thing that crosses between them.

---

## B. The "generic AI" audit — what is actually wrong with the current codebase

Audited both supplied zips. These are the concrete tells, with fixes.

| # | Symptom | Where | Fix |
| --- | --- | --- | --- |
| 1 | **Navy + teal.** `navy-900` sidebar with `teal-500` active pill. A default admin palette. | `globals.css`, `nav.tsx` | Signal Orange on a near-black tonal ladder |
| 2 | **Emoji as iconography.** `📊 🛰️ 🚌 🎫 🧭 👥 🏢 🚐 🧑‍✈️ 🚨 💰 📈 🗂️ 🧍 🚏 ⚙️` in the nav, and 10 more on the landing page. | `shell.tsx`, `page.tsx` | Lucide, 1.5px stroke, uniform optical weight |
| 3 | **Centred landing hero with two equal buttons and a 3×3 feature grid.** The exact shape of generated output. | `page.tsx` | Asymmetric hero, one real product surface, asymmetric pillar grid |
| 4 | **Ten identical rounded-xl cards in a grid.** | `page.tsx` | Three pillars with real screens; section rhythm from the Scrolltide patterns |
| 5 | **`rounded-xl` everywhere** — 12px on cards, buttons, badges, inputs, and the logo tile. | `ui.tsx` | 8px containers, pill actions, 4px inline |
| 6 | **Drop shadows on every card** (`shadow-sm`) in a light theme, and no elevation logic at all in dark. | `ui.tsx` | Hairlines + tonal stepping + 1px inset top highlight |
| 7 | **`bg-slate-50` / `text-slate-900`.** The most recognisable "unstyled Tailwind" tell in existence. | `layout.tsx`, `globals.css` | Warm limestone canvas |
| 8 | **Proportional figures in money and time columns.** | `ui.tsx`, `charts.tsx` | JetBrains Mono + `tabular-nums` everywhere numeric |
| 9 | **Proportional SVG charts** with flat 2.5px strokes and a generic blue/teal palette, outside the token system. | `charts.tsx` | Bespoke SVG inheriting tokens; fixed 6-series palette |
| 10 | **A 16-item flat nav list.** No grouping, no collapse, no ⌘K, no wayfinding for 8 roles. | `nav.tsx` | 5 grouped sections, collapsible rail, command palette |
| 11 | **Every detail view is a full page navigation.** | all routes | Right-side inspector drawer that preserves list state |
| 12 | **No density control.** 40px rows everywhere. | `ui.tsx` | Comfortable / compact toggle |
| 13 | **Zip 2 uses `// @ts-nocheck` in every component** and has a nearly empty `globals.css`. | zip2 | Discard zip 2; build on zip 1 |
| 14 | **The landing page ships a `Phase 1 MVP · Live Phase 2` badge as its hero eyebrow.** Tells the visitor the build state before telling them what it does. | `page.tsx` | Lead with the product, not the roadmap |

---

## C. Base selection

Two zips were supplied. Decision: **zip 1 (`staff-transportation-management-system.zip`) is the base.**

| | Zip 1 — StaffRide | Zip 2 — "TMS" |
| --- | --- | --- |
| Schema | 28 tables, real FKs, tenant scoping, indexes on hot paths | 8 tables, partial |
| Backend | Server actions, session auth, scrypt, 2FA, RBAC matrix, audit log on every mutation | API routes only, JWT, no audit |
| Domain | `domain.ts` — pure, testable business rules (capacity, trip state machine, VRP heuristic, billing, payroll) | `validation.ts` only |
| Data | Auto-seeding demo dataset (3 clients, 36 employees, 12 vehicles, 10 drivers) | `seed.ts`, thinner |
| Tests | 15 unit tests over the domain layer | none |
| Docs | `docs/API.md`, `docs/OPERATIONS.md`, in-app `/docs` | none |
| UI | Weak (see audit above) — **but the UI is what we are replacing** | Weak, and `// @ts-nocheck` throughout |
| Deps | Lean | `lucide-react`, `framer-motion`, `cmdk`, `sonner`, `zod`, `react-hook-form` — **all of which we want anyway** |

Zip 1 wins on everything that is hard to rebuild, and the UI is the one thing being thrown away.
Zip 2's dependency list is adopted.

**Stack for the build:**

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 16 App Router, React 19 | Already both |
| Styling | Tailwind v4 + `@theme` tokens | Already; tokens are the contract |
| Data | Drizzle ORM + PostgreSQL | Already |
| **DB without a server** | **PGlite** (`@electric-sql/pglite`) as a zero-service fallback when `DATABASE_URL` is unset | Makes the app actually runnable and demonstrable; real Postgres is still the production path |
| Icons | `lucide-react` | Replaces emoji; uniform stroke weight |
| Command palette | `cmdk` | ~5KB, keyboard-first |
| Toasts | `sonner` | Small, good defaults, theme-aware |
| Validation | `zod` | Server actions currently trust their inputs |
| Class merging | `clsx` + `tailwind-merge` | Standard |
| Motion | CSS first; `motion` only on the marketing page | Keeps the app instant |
| Charts | Hand-authored SVG | Inherits tokens exactly; no library palette to fight |
| 3D assets | 3dicons.co, CC0 | Licence-clean |
| Glass | `@samasante/liquid-glass`, MIT | 3 placements only |
| Fonts | `next/font/google` → Space Grotesk, Inter, JetBrains Mono | Self-hosted, no layout shift, no CDN dependency |

---

## D. Build sequence

**Phase 1 — Foundation**
Extract zip 1 into the repo root. Add the dependency set. Write `globals.css` with the full token
ladder (dark + light), the `@custom-variant` for class-based theming, the no-flash theme script, and
the density variables. Wire the PGlite/pg dual driver. Migrate + seed. Verify the app boots.

**Phase 2 — Primitives**
`src/components/ui/` — Button, Input, Select, Textarea, Checkbox, Switch, Card, Panel, Badge,
StatusDot, StatusChip, Table (head/row/cell), Tabs, Dialog, Sheet, Popover, Tooltip, Skeleton,
EmptyState, StatTile, Segmented, KeyValue, Toast. Every one reads from tokens only.

**Phase 3 — Shell**
Grouped collapsible rail, top bar with the live ticker, ⌘K command palette, right-side inspector
drawer, theme switch, density switch, mobile bottom bar. Role-aware section filtering (RBAC-driven,
as today) but presented as groups.

**Phase 4 — Charts & map**
Restyle `charts.tsx` into token-driven SVG components (bar, stacked bar, line/area, sparkline,
donut, heatmap, timeline) with the fixed 6-series palette, tabular mono axes and hover crosshair.
Restyle the vector live map: dark canvas, `--signal` route polylines, stop nodes, directional
vehicle glyphs, mono ETA labels, animated route draw.

**Phase 5 — Operations screens**
Dashboard (one primary metric + a handful of secondary, per the cap-at-six rule), Dispatch command
centre (3-pane), Trips, Bookings, Routes, Employees, Companies, Fleet, Drivers, Incidents,
Finance, Reports, Audit, Settings.

**Phase 6 — Mobile surfaces**
Driver app (duty list, trip execution, boarding OTP, offline queue, SOS) and passenger app
(next ride, book sheet, trip history). Bottom tab bar, thumb-zone primary action, light-first.

**Phase 7 — Marketing**
Landing page: hero with live route animation + real dispatch board, client proof, three pillars,
step-path how-it-works, metrics strip, security band, CTA band, editorial footer.
Auth screens (login / register / forgot / reset) in the same system.

**Phase 8 — Hardening**
Accessibility pass (contrast, focus rings, keyboard paths, reduced motion), print styles for
reports, empty/error/loading states everywhere, no-flash theme verification, mobile/tablet/desktop
at 360 / 768 / 1440, and the §11 "not generic" checklist from `DESIGN.md` run against the build.

---

## E. Out of scope

Native apps, real VRP solving (OR-Tools), live payment rails, SMS/email providers, SSO, and
multicurrency stay where the current code leaves them — behind clearly labelled demo mode.
