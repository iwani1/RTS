# StaffRide — Design System Contract

> The single source of truth for every pixel in this repository.
> Derived from a research pass across Scrolltide, Navbar Gallery, Footer Design, CTA Gallery,
> Refero Styles, Supahero, 3dicons, liquid-glass, Godly, Mobbin, Land-book, Dark Mode Design and Saaspo.
> If a value is not in this file, it does not exist.

---

## 1. North Star

**"Signal lights through dark lattice."**

StaffRide is an operations instrument, not a marketing site. A dispatcher watches it for nine hours.
An employee checks it on a bus in daylight. A finance officer reconciles it at month end.

So the interface is **built like a machine, not a document**:

- A near-black canvas with a deliberate ladder of surfaces. Depth comes from *tonal stepping*, never from shadow.
- Exactly **one chromatic authority** — Signal Orange. It marks action and brand, nothing else.
- Every other colour is a **status light**: a small dot or a hairline, never a wash of colour.
- Numbers are **monospaced and tabular** because they are read, compared, and scanned down a column.
- Motion is **instrument motion**: a needle settling, a row sliding in. Never a bounce, never a spring.

The word we are *not* designing against is "dashboard template". Nothing here is a floating rounded card
on a grey page with a purple gradient in the corner.

---

## 2. Colour

### 2.1 Dark — the default surface (operations)

| Token | Hex | Role |
| --- | --- | --- |
| `--canvas` | `#04070A` | Page canvas. Abyss. Never `#000`. |
| `--surface-1` | `#090C0F` | Cards, panels, table bodies. Carbon. |
| `--surface-2` | `#0F1214` | Nav rail, inspector drawer, popovers, headers. |
| `--surface-3` | `#15191C` | Hover, active row, pressed input, code blocks. |
| `--line` | `#1A1D1F` | Hairline borders, table rules, dividers. |
| `--line-strong` | `#242A2E` | Input borders, focus-adjacent edges, active hairlines. |
| `--text-3` | `#676F7A` | Steel. Muted helper text, axis labels, metadata. |
| `--text-2` | `#A8B2BB` | Secondary copy, table body. |
| `--text-1` | `#F0F5FA` | Snow. Primary body copy on dark. |
| `--text-0` | `#FFFFFF` | Headings, high-contrast labels, icon strokes. |

### 2.2 Light — passenger, driver, daytime, marketing

| Token | Hex | Role |
| --- | --- | --- |
| `--canvas` | `#F7F6F2` | Limestone. Warm off-white. **Never `#F8FAFC`.** |
| `--surface-1` | `#FFFFFF` | Cards, sheets. |
| `--surface-2` | `#F1EFE9` | Rail, table stripes, wells, disabled fills. |
| `--line` | `#E4E0D6` | Hairlines, table rules. |
| `--line-strong` | `#D3CEC0` | Input borders. |
| `--text-1` | `#14171A` | Obsidian. Primary copy. |
| `--text-2` | `#5A6169` | Secondary copy. |
| `--text-3` | `#8A9199` | Muted helper text. |

### 2.3 Brand — one authority

| Token | Hex | Role |
| --- | --- | --- |
| `--signal` | `#FF6314` | Signal Orange. Primary action fill, brand mark, active nav, route polyline on the live map, the single selected state. |
| `--signal-press` | `#E0560F` | Pressed / hover fill. |
| `--signal-wash` | `rgba(255,99,20,.12)` | Selected row tint, active nav pill, focus halo. |
| `--signal-ink` | `#0B0C0E` | Text placed **on** a `--signal` fill. Always this, never white. |

### 2.4 Status — signal lights, not surfaces

Status colour is **never** a large fill, never a gradient, never the only carrier of meaning.
Every status is `dot + word`. Word always wins.

| State | Dark | Light | Dot |
| --- | --- | --- | --- |
| Live / in progress | `#16C4FF` | `#0284C7` | pulsing |
| On time / available / paid | `#33FFAC` | `#0E9F6E` | solid |
| Scheduled / approved / draft | `#5B76FF` | `#4F46E5` | solid |
| Delayed / caution / waitlisted | `#F5B841` | `#B45309` | solid |
| Breakdown / critical / overdue | `#FF3B47` | `#DC2626` | pulsing |
| Cancelled / out of service / off duty | `#676F7A` | `#8A9199` | solid |

### 2.5 Chart series — six, fixed, in this order

`#FF6314` · `#16C4FF` · `#33FFAC` · `#F5B841` · `#FF7A9C` · `#5B76FF`

Never reorder. Never add a seventh. Never gradient-fill a series.

### 2.6 Do / Don't

**Do**
- Use `--signal` only for: primary action, brand mark, active/selected nav, live route polyline, one focal stat.
- Step surfaces tonally in the order canvas → surface-1 → surface-2 → surface-3.
- Pair every status colour with a label and a dot.
- Keep body copy at `--text-1` and reserve `--text-0` for headings.

**Don't**
- Don't use `--signal` for borders, link text, body accents, icon colour, or secondary buttons.
- Don't add drop shadows for elevation. Use hairlines and a 1px inset top highlight.
- Don't use pure `#000` as a page background.
- Don't introduce a second accent hue. One brand, five status lights.
- Don't use violet/indigo as a brand colour. Ever.
- Don't mix radii — see §5.

---

## 3. Typography

Three faces, each with exactly one job.

| Role | Face | Weight | Where |
| --- | --- | --- | --- |
| **Display / UI** | Space Grotesk | 500, 600, 700 | Headings, nav, buttons, labels, table headers. Angular and engineered — it is the voice of the product. |
| **Body** | Inter | 400, 500 | Paragraphs, descriptions, long-form help, empty-state copy. |
| **Technical** | JetBrains Mono | 400, 500 | Money, times, distances, IDs, plate numbers, status codes, table numerics, eyebrow labels. |

**Rules**
- Money, counts, times, ETAs and coordinates are **always** JetBrains Mono with `font-variant-numeric: tabular-nums`.
  A table of money that does not align vertically is a failed table.
- Eyebrow / section labels: JetBrains Mono, 11px, `letter-spacing: .14em`, uppercase, `--text-3`.
- Display sizes get **positive** tracking (`+0.01em` → `+0.02em`). Never negative tracking on large type.
- Body copy is never set in Space Grotesk below 19px.
- Headings never exceed 1.25 line-height.

**Scale** (base 14px, minor third)

`11 · 12 · 13 · 14 · 16 · 19 · 21 · 24 · 30 · 37 · 48 · 64 · 74`

---

## 4. Spacing & density

- Base unit **4px**. Rhythm steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96.
- Content max width **1280px**; wide tables may run to 1600px.
- Page gutter: 16px mobile → 24px tablet → 32px desktop.
- Section gap: 64px marketing, 32px in-app.
- Card padding: 20px standard, 16px dense, 24px marketing.
- **Density toggle** ships: `comfortable` (default) and `compact` (−4px row height, −8px padding). A dispatcher on a 14" screen will need compact; a finance officer will not.
- Data tables: 40px rows comfortable / 32px compact. Sticky header. Hairline rules only — no zebra striping, no vertical borders.

---

## 5. Shape

| Element | Radius |
| --- | --- |
| Buttons, primary actions, pills | `999px` (full pill) |
| Inputs, selects, textareas | `8px` |
| Cards, panels, tables | `8px` |
| Badges, tags, status chips | `999px` |
| Small inline elements, code, keycaps | `4px` |

**The rule is memorable on purpose: _actions are pills, containers are 8px_.**
This one asymmetry does more anti-template work than any single colour choice.

**No drop shadows** in the app. Depth is tonal. Where a raised surface needs separation it gets a 1px hairline
plus an inset top highlight (`inset 0 1px 0 rgba(255,255,255,.04)`) — the "key" treatment.

---

## 6. Iconography

- **In-app:** Lucide, `stroke-width: 1.5`, 16px in tables, 20px in nav, 24px in empty states. Uniform optical weight.
- **Emoji is banned** in the interface. The current build uses emoji for every nav icon — that is the single loudest
  "template" tell in the codebase. It goes.
- **Marketing / empty states:** 3D icons from [3dicons.co](https://3dicons.co) (CC0), recoloured to the palette,
  used sparingly — one per section, never in a grid of 12.
- **Brand mark:** a custom SVG — a shuttle silhouette broken by a route polyline that overshoots into a node.
  Not the letters "SR" in a rounded square.

---

## 7. Motion

Motion is how the instrument reports that it is alive. It is not decoration.

| Rule | Value |
| --- | --- |
| Duration | 120ms (micro) · 180ms (standard) · 320ms (panel / route) |
| Easing | `cubic-bezier(.2,.8,.2,1)` — decelerate, never overshoot |
| Curves | No springs. No bounce. No elastic. |
| Live pulse | 2s ease-in-out infinite on live status dots only |
| Route draw | 320ms stroke-dashoffset on the live map |
| Reveal | 16px rise + fade, staggered 60ms, once, on scroll (marketing only) |
| Reduced motion | `prefers-reduced-motion: reduce` → all transforms collapse to opacity, all loops stop |

---

## 8. Application shell

The shell is where most "generic" is won or lost. Ours is **grouped, collapsible, and keyboard-first**.

### 8.1 Left rail

- 60px collapsed icon rail, expandable to 244px. Collapse state persists.
- Sections, not a flat 16-item list:
  - `OPERATE` — Dashboard, Dispatch, Trips, Bookings
  - `PLAN` — Routes & Stops, Employees, Corporate Clients
  - `ASSET` — Fleet, Drivers
  - `GOVERN` — Incidents, Billing & Payroll, Reports, Audit Trail
  - `CONFIG` — Settings & Users
- Active item = `--signal-wash` pill with a 2px `--signal` left marker and a `--signal` icon.
- Badges (pending bookings, open incidents) are mono, in `--text-2`, on a `--surface-3` chip.

### 8.2 Top bar

`breadcrumb` · `⌘K search` · `live fleet ticker` · `theme` · `notifications` · `user menu`

The **live ticker** is a single mono line that cycles real events (`06:12:44 · GR-4412 boarded 14/14 · on time`).
It is the product's pulse and it must be present on every operations screen.

### 8.3 Command palette — `⌘K`

`cmdk`. Search trips, vehicles, drivers, employees, clients, bookings, pages.
Every result has a mono ID, a one-line context, and a keyboard-only path. Power users never touch the mouse.

### 8.4 Inspector, not modals

Row detail opens in a **right-side drawer** (380px) over a scrim, not a centred modal.
The underlying table keeps its scroll position and filter state. Forms in the drawer, autosaving.
A modal is reserved for destructive confirmation only.

### 8.5 Tables are the interface

Follow Stripe, not the "chart dashboard". Per the research pass: *a single dashboard page can't carry every
vertical's needs.* Every list view is a table with:

- sticky header, hairline rules, no vertical borders
- right-aligned tabular numerics in JetBrains Mono
- status as `dot + word` chip
- row actions revealed on hover, always reachable by keyboard
- a filter bar with saved views (per role)

---

## 9. Key screens

### 9.1 Dispatch Command Centre — the hero surface

Three panes: **trip board** (320px) · **live map** (fluid) · **inspector** (380px, slide-over).

- Map canvas is `--canvas`; the vector map is dark, minimal, with Ghana/Accra geometry.
- Route polylines in `--signal`; stop nodes as 4px circles; vehicles as directional glyphs.
- ETAs and ETD deviation rendered in mono, deviation shown as a signed bar.
- A horizontal **event tape** across the top: scrolling mono log of boardings, delays, SOS.
- This screen should look like an instrument panel, not a map with a sidebar.

### 9.2 Driver app (mobile-first)

Single column, bottom tab bar, one primary action in the thumb zone.
Boarding verification is a 4-cell mono OTP input. Offline queue banner when the network drops.
`Start trip` / `End trip` are the only big buttons on the screen.

### 9.3 Passenger app (mobile-first)

Next-ride card with live ETA, a one-tap book flow in a bottom sheet, QR/OTP, and trip history.
Reads in daylight: light mode is the default for passenger surfaces.

### 9.4 Marketing landing

- **Hero:** Space Grotesk display headline, one `--signal` CTA, a ghost secondary.
  Behind it: a live route animation (polyline drawing itself) and a faint mesh shader.
  Below the fold: the *actual dispatch board* in a device frame — not a stock illustration.
- **Sections:** client marquee → three pillars with real product screens → How it works (a route-line step path) →
  metrics strip → security & compliance → CTA band → footer.
- **Footer** (per Footer.design + the metadata-pipe detail): oversized wordmark, four link columns, a live
  `SYSTEMS OPERATIONAL` status dot, and a legal row separated by pipes.
- **Motion:** scroll reveals + smooth scroll. Lenis. Marketing page only — the app stays instant.

---

## 10. Implementation rules

- Tailwind v4. Tokens live in `@theme` in `src/app/globals.css`. No arbitrary colour values in components.
  If a colour is not a token, it does not get used.
- `cn()` = `clsx` + `tailwind-merge`.
- Icons: `lucide-react`. 3D icons: static assets from 3dicons.co, imported as images.
- Charts: hand-authored SVG (no chart library) so they inherit the tokens exactly.
- Liquid glass (`@samasante/liquid-glass`, MIT, zero-dep) is allowed in **exactly three places**:
  the command palette, the mobile bottom sheet, and the floating dispatch dock. Nowhere else.
  Glass everywhere is a 2021 look.
- Dark mode ships day one via `prefers-color-scheme` + a manual override, with a no-flash inline script.
- Every interactive element has a visible `:focus-visible` ring in `--signal`.
- All colour pairs used for text must clear WCAG AA (4.5:1 body, 3:1 large).

---

## 11. Definition of "not generic"

Ship-blocking. If any of these are true, the work is not done.

- [ ] No purple/indigo gradient anywhere.
- [ ] No emoji in the interface.
- [ ] No `rounded-2xl` / `rounded-3xl` container stack.
- [ ] No drop-shadow card grid on a grey page.
- [ ] No more than one chromatic brand colour.
- [ ] No chart library with a foreign palette.
- [ ] No centred hero with three feature cards and two equal-weight buttons.
- [ ] No tabular number rendered in a proportional font.
- [ ] No floating dashboard with 12 identical KPI cards.
