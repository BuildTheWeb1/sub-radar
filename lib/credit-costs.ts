// Pure constants, deliberately split out from lib/credits.ts: that module
// imports lib/db (which is `server-only`), so a client component importing
// anything from it — even just a number — fails to bundle. This file has no
// server dependencies, so both the routes that charge these costs and the
// client components that display them beforehand can import the same values.
export const SUGGEST_COST = 1
export const CONTENT_IDEAS_COST = 3
