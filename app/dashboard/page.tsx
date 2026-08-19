import { PostFeed } from '@/components/post-feed'

export default function DashboardPage() {
  return (
    <PostFeed
      title="Leads"
      defaultStatus="new"
      statusFilterable
      showContentIdeasLink
      // Fewer, stronger leads by default: 20 is one verbatim keyword match (see
      // scoreRelevance in lib/scraper.ts), so this only hides posts that matched
      // via Reddit's own fuzzy search but never actually contain a watched
      // phrase. Purely a display filter — nothing is discarded, and the picker
      // on the page lets anyone drop back to "All scores". Leads-only: Saved and
      // the Replied filter default to 0 so nothing a user already acted on can
      // vanish because of it.
      defaultMinRelevance="20"
    />
  )
}
