"""
Reddit Post Finder for Mood Fast
Finds relevant posts where Mood Fast could be mentioned naturally.
No API key required — uses Reddit's public .json endpoints.
"""

import requests
import time
import json
from datetime import datetime

# ── Configuration ──────────────────────────────────────────────────────────────

HEADERS = {"User-Agent": "MoodFastResearch/1.0 (personal research script)"}

SUBREDDITS = [
    "intermittentfasting",
    "fasting",
    "OMAD",
    "moodtracking",
    "mentalhealth",
    "selfimprovement",
    "loseit",
    "keto",
]

KEYWORDS = [
    "mood",
    "mental clarity",
    "brain fog",
    "feel better",
    "emotional",
    "anxiety fasting",
    "how do you feel",
    "track mood",
    "fasting benefits",
    "mood swings",
    "emotional eating",
    "mindfulness fasting",
]

OUTPUT_FILE = "reddit_results.json"

# ── Helpers ────────────────────────────────────────────────────────────────────

def fetch_posts(subreddit, keyword, limit=25):
    url = f"https://www.reddit.com/r/{subreddit}/search.json"
    params = {"q": keyword, "sort": "new", "limit": limit, "restrict_sr": "true"}
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=10)
        r.raise_for_status()
        return r.json()["data"]["children"]
    except Exception as e:
        print(f"  ⚠️  Error fetching r/{subreddit} + '{keyword}': {e}")
        return []


def score_relevance(title, selftext):
    """Simple relevance score based on keyword density."""
    text = (title + " " + selftext).lower()
    high_value = ["mood", "feel", "mental", "emotion", "clarity", "track", "how are you"]
    score = sum(text.count(kw) for kw in high_value)
    return min(score * 10, 100)


def format_post(post_data):
    d = post_data["data"]
    return {
        "title": d.get("title", ""),
        "url": f"https://reddit.com{d.get('permalink', '')}",
        "subreddit": d.get("subreddit", ""),
        "score": d.get("score", 0),
        "num_comments": d.get("num_comments", 0),
        "created": datetime.utcfromtimestamp(d.get("created_utc", 0)).strftime("%Y-%m-%d"),
        "selftext_preview": d.get("selftext", "")[:200].replace("\n", " "),
        "relevance": score_relevance(d.get("title", ""), d.get("selftext", "")),
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Mood Fast — Reddit Post Finder")
    print("=" * 60)

    all_posts = {}  # keyed by URL to deduplicate

    total = len(SUBREDDITS) * len(KEYWORDS)
    count = 0

    for subreddit in SUBREDDITS:
        for keyword in KEYWORDS:
            count += 1
            print(f"[{count}/{total}] r/{subreddit} → '{keyword}' ...", end=" ", flush=True)

            posts = fetch_posts(subreddit, keyword)
            new = 0
            for p in posts:
                formatted = format_post(p)
                url = formatted["url"]
                if url not in all_posts:
                    all_posts[url] = formatted
                    new += 1

            print(f"{new} new posts found")
            time.sleep(2)  # stay under 10 req/min unauthenticated limit

    # Sort by relevance score descending
    results = sorted(all_posts.values(), key=lambda x: x["relevance"], reverse=True)

    # Save to JSON
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)

    # Print top 20
    print("\n" + "=" * 60)
    print(f"  DONE — {len(results)} unique posts found")
    print(f"  Full results saved to: {OUTPUT_FILE}")
    print("=" * 60)
    print("\n🔥 TOP 20 MOST RELEVANT POSTS:\n")

    for i, post in enumerate(results[:20], 1):
        print(f"{i:2}. [{post['relevance']:3}/100] r/{post['subreddit']} — {post['score']}pts — {post['num_comments']} comments")
        print(f"    {post['title']}")
        print(f"    {post['url']}")
        if post["selftext_preview"]:
            print(f"    Preview: {post['selftext_preview'][:120]}...")
        print()


if __name__ == "__main__":
    main()
