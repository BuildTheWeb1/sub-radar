# SubRadar UI Redesign — Design Spec

**Date:** 2026-03-19
**Scope:** Component-level visual redesign (Option B)
**Palette:** Warm & Energetic — off-white backgrounds, deep brown text, orange accents

---

## Goals

- Make the login page feel substantial and branded instead of a blank canvas with a button
- Apply a consistent warm colour palette across the whole app
- Improve visual hierarchy on the dashboard: header identity, post card readability, sidebar active state
- No changes to routes, data models, or API surface

---

## Colour tokens

Add CSS custom properties to `app/globals.css` (or a dedicated tokens file):

| Token | Value | Usage |
|---|---|---|
| `--brand-50` | `#fffbf5` | Page backgrounds |
| `--brand-100` | `#fff7ed` | Active sidebar item bg, scraper widget bg |
| `--brand-200` | `#fde8cc` | Borders, dividers |
| `--brand-300` | `#fed7aa` | Hover states, tags |
| `--brand-400` | `#fca474` | Muted text on dark bg |
| `--brand-600` | `#ea580c` | Primary accent, CTA buttons, active icon |
| `--brand-700` | `#c2410c` | Hover on accent, subreddit labels |
| `--brand-900` | `#431407` | Primary text |
| `--brand-950` | `#1c0a00` | Headings, logo text |

These map onto the existing Tailwind classes already used in the codebase (`orange-*`, `amber-*`) — no new dependencies needed.

---

## 1. Login page (`app/login/page.tsx`)

**Layout:** Full-screen horizontal split. Left 55% brand panel, right 45% sign-in panel.
**Mobile:** Stack vertically — brand panel collapses to a compact header bar on small screens.

### Left panel (brand)
- Background: gradient `from-[#1c0a00] via-[#431407] to-[#7c2d12]`
- Two decorative translucent circles (CSS `position:absolute`) for subtle depth — no images or SVG assets needed
- Logo mark: small orange rounded square with white circle inside + "SubRadar" wordmark in `fed7aa`
- Eyebrow label: "Reddit lead intelligence" in `ea580c`, uppercase, tracked
- Headline: "Find customers before your competitors do." — white, bold, large
- Body copy: one sentence describing the product value — `fca474`
- Tag row at bottom: three pill badges ("Reddit monitoring", "Lead generation", "AI relevance scoring") with `rgba(ea580c, 0.2)` background

### Right panel (sign-in)
- Background: `#fffbf5`
- Heading: "Welcome back" — `1c0a00`, bold
- Subtext: one sentence prompt — `9a6b4b`
- Google sign-in button: white bg, `fde8cc` border, real Google logo SVG (inline), "Continue with Google" label — `431407`
- Fine print: "Access is by invitation only" — `c4a882`, centred
- Terms note at bottom, separated by a `fde8cc` rule

---

## 2. Header (`app/dashboard/layout.tsx`, `app/settings/layout.tsx`)

**Current:** Plain `<span>` with text "SubRadar" on a white bar.
**New:**
- Logo mark: 20×20px orange rounded square + white dot, matching the login panel
- Wordmark next to it in `1c0a00`, `font-weight:700`
- Right side: user avatar — circular badge showing initials, `fde8cc` background, `c2410c` text, pulled from `session.user.name` or `session.user.email`
- Border-bottom remains; background stays white

---

## 3. Sidebar (`components/sidebar.tsx`)

**Current:** Plain text links with Lucide icons, `bg-accent` active state.
**New:**
- Active item: `bg-[#fff7ed]` background, `text-[#c2410c]` for both icon and label, `font-semibold`
- Inactive items: `text-[#9a6b4b]` with hover `text-[#431407] bg-[#fffbf5]`
- No structural changes — same `navItems` array, same routing logic

---

## 4. ScrapeStatus widget (`components/scrape-status.tsx`)

**Current:** Plain white card with thin border.
**New:**
- Background: `#fffbf5`, border `#fde8cc`
- "Run now" button: `border-[#fde8cc]`, text `#c2410c`, hover `bg-[#fff7ed]`
- "Unreviewed posts" count: displayed as a pill badge (`bg-[#fde8cc]`, text `#c2410c`, `font-bold`) instead of plain text

---

## 5. Post cards (`components/post-card.tsx`)

**Current:** `rounded-lg border bg-card` with default border colour.
**New:**
- Border: `border-[#fde8cc]`
- Box shadow: `shadow-sm` with warm tint (`0 1px 4px rgba(234,88,12,0.07)`)
- Hover: `hover:border-[#fed7aa] hover:shadow-md`
- Relevance pill: keep existing green/yellow/red logic — just tighten the colour values:
  - ≥70: `bg-green-100 text-green-800`
  - ≥40: `bg-yellow-100 text-yellow-800`
  - <40: `bg-red-100 text-red-800`
- Subreddit label: `text-[#c2410c] font-semibold` instead of plain foreground
- Action buttons: `border-[#fde8cc]`, text `#9a6b4b`, hover `bg-[#fff7ed]`

---

## 6. Post feed empty state (`components/post-feed.tsx`)

Read this file to find the empty state and replace the plain text with:
- Centred container, `py-16`
- A simple icon (e.g. Lucide `Inbox` or `Radio`) in `text-[#fde8cc]`, large size
- Heading: "No posts yet" — `text-[#431407]`, `font-semibold`
- Body: "Run the scraper to fetch your first batch." — `text-[#9a6b4b]`

---

## Out of scope

- Dark mode
- Mobile nav restyling (functional, not visually broken)
- Any changes to settings pages beyond the shared header/sidebar
- Data, API, or auth changes

---

## Files to change

1. `app/globals.css` — add brand colour tokens
2. `app/login/page.tsx` — split screen layout
3. `app/dashboard/layout.tsx` — new header
4. `app/settings/layout.tsx` — same header change
5. `components/sidebar.tsx` — warm active/hover states
6. `components/scrape-status.tsx` — warm card + pill badge
7. `components/post-card.tsx` — warm border/shadow + subreddit colour
8. `components/post-feed.tsx` — improved empty state
