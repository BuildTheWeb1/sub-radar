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

## Colour palette

The existing `app/globals.css` uses the `oklch` colour space for shadcn tokens — do not add hex custom properties to that file. Instead, apply warm colours directly using Tailwind's arbitrary value syntax (e.g. `bg-[#fffbf5]`), which is already used elsewhere in the codebase (`post-card.tsx` uses `bg-green-100`, `bg-yellow-100`, etc.). No changes to `app/globals.css` are required.

Reference values used throughout:

| Hex | Usage |
|---|---|
| `#fffbf5` | Page / panel backgrounds |
| `#fff7ed` | Active sidebar item bg, scraper widget bg |
| `#fde8cc` | Borders, dividers |
| `#fed7aa` | Hover states, tag borders |
| `#fca474` | Muted text on dark backgrounds |
| `#ea580c` | Primary accent, CTA, active icon |
| `#c2410c` | Hover accent, subreddit labels |
| `#9a6b4b` | Muted body text |
| `#431407` | Primary text |
| `#1c0a00` | Headings, logo text |

---

## 1. Login page (`app/login/page.tsx`)

**Layout:** Full-screen horizontal split. Left 55% brand panel, right 45% sign-in panel.
**Mobile:** Stack vertically — brand panel collapses to a compact header bar on small screens.

### Left panel (brand)
- Background: gradient `from-[#1c0a00] via-[#431407] to-[#7c2d12]`
- Two decorative translucent circles (CSS `position:absolute`) for subtle depth — no image assets needed
- Logo mark: small orange rounded square with white circle inside + "SubRadar" wordmark in `fed7aa`
- Eyebrow label: "Reddit lead intelligence" in `ea580c`, uppercase, tracked
- Headline: "Find customers before your competitors do." — white, bold, large
- Body copy: one sentence describing the product value — `fca474`
- Tag row at bottom: three pill badges ("Reddit monitoring", "Lead generation", "AI relevance scoring") with `rgba(ea580c, 0.2)` background

### Right panel (sign-in)
- Background: `#fffbf5`
- Heading: "Welcome back" — `1c0a00`, bold
- Subtext: one sentence prompt — `9a6b4b`
- Google sign-in button: white bg, `fde8cc` border, Google logo as an inline SVG `<path>` (no external asset), "Continue with Google" label — `431407`
- Fine print: "Access is by invitation only" — `c4a882`, centred
- Terms note at bottom, separated by a `fde8cc` rule

---

## 2. Header (`app/dashboard/layout.tsx`, `app/settings/layout.tsx`)

**Current:** Plain `<span>` with text "SubRadar" on a white bar.
**New:**
- Logo mark: a `div` — `w-5 h-5 bg-[#ea580c] rounded-[5px]` with a centred inner `div` — `w-[7px] h-[7px] rounded-full bg-white opacity-90`. Pure CSS, no SVG or image.
- Wordmark: `<span>` with `font-bold text-[#1c0a00] tracking-tight text-sm`
- Right side: `<UserAvatar />` component (see implementation note below)
- Border-bottom remains; background stays white

**Implementation note — UserAvatar:** Create `components/user-avatar.tsx` as a `"use client"` component. Call `useSession()`. If session is unavailable (`status !== 'authenticated'`), render nothing (`return null`). When authenticated, derive initials from `session.user.name` (first letter of each word, max 2) or fall back to the first two characters of `session.user.email`. Render as a `w-7 h-7 rounded-full bg-[#fde8cc] text-[#c2410c] text-xs font-bold flex items-center justify-center` div.

**Duplication note:** `app/dashboard/layout.tsx` and `app/settings/layout.tsx` contain identical header markup. Apply the same change to both files.

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
- "Unreviewed posts" count: wrap in an inline `span` with `bg-[#fde8cc] text-[#c2410c] font-bold text-xs px-2 py-0.5 rounded-full` (do not use the shadcn `Badge` component — the plain span is sufficient and avoids variant conflicts)

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

The component has two distinct states. Restyle only the **"no posts found"** empty state (line 139–145 — `posts.length === 0` after loading). Leave the loading skeleton (lines 130–138) untouched.

Replace the existing dashed border container with:
```tsx
<div className="flex flex-col items-center justify-center py-16 text-center gap-3">
  <Inbox className="h-10 w-10 text-[#fde8cc]" />
  <p className="text-sm font-semibold text-[#431407]">No posts found</p>
  <p className="text-xs text-[#9a6b4b]">Adjust filters or wait for the next scrape.</p>
</div>
```
Import `Inbox` from `lucide-react` (already a project dependency).

---

## Out of scope

- Dark mode
- Mobile nav restyling (functional, not visually broken)
- Any changes to settings pages beyond the shared header/sidebar
- Data, API, or auth changes

---

## Files to change

1. `app/login/page.tsx` — split screen layout
3. `app/dashboard/layout.tsx` — new header with logo mark + UserAvatar
4. `app/settings/layout.tsx` — same header change (identical to dashboard layout header)
5. `components/user-avatar.tsx` — new `"use client"` component (create); renders initials badge using `useSession()`
6. `components/sidebar.tsx` — warm active/hover states
7. `components/scrape-status.tsx` — warm card + pill badge
8. `components/post-card.tsx` — warm border/shadow + subreddit colour
9. `components/post-feed.tsx` — improved empty state
