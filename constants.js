// constants.js — Pro Time Tracker v3.1
// Shared defaults. User-defined categories ALWAYS override these.

const DEFAULT_CATEGORIES = {
    // ── Productive: Development ──────────────────────────────────────────
    'github.com': 'productive',
    'gitlab.com': 'productive',
    'bitbucket.org': 'productive',
    'stackoverflow.com': 'productive',
    'stackexchange.com': 'productive',
    'superuser.com': 'productive',
    'serverfault.com': 'productive',
    'askubuntu.com': 'productive',
    'developer.mozilla.org': 'productive',
    'npmjs.com': 'productive',
    'crates.io': 'productive',
    'pypi.org': 'productive',
    'packagist.org': 'productive',
    'nuget.org': 'productive',
    'hub.docker.com': 'productive',
    'codepen.io': 'productive',
    'codesandbox.io': 'productive',
    'replit.com': 'productive',
    'w3schools.com': 'productive',
    'css-tricks.com': 'productive',
    'smashingmagazine.com': 'productive',
    'dev.to': 'productive',
    'hashnode.com': 'productive',
    'roadmap.sh': 'productive',
    'refactoring.guru': 'productive',
    // ── Productive: Cloud / DevOps ──────────────────────────────────────
    'vercel.com': 'productive',
    'netlify.com': 'productive',
    'railway.app': 'productive',
    'render.com': 'productive',
    'digitalocean.com': 'productive',
    'aws.amazon.com': 'productive',
    'cloud.google.com': 'productive',
    'azure.microsoft.com': 'productive',
    'cloudflare.com': 'productive',
    'supabase.com': 'productive',
    'mongodb.com': 'productive',
    // ── Productive: Project / Work Tools ────────────────────────────────
    'notion.so': 'productive',
    'figma.com': 'productive',
    'linear.app': 'productive',
    'jira.atlassian.com': 'productive',
    'confluence.atlassian.com': 'productive',
    'trello.com': 'productive',
    'asana.com': 'productive',
    'monday.com': 'productive',
    'clickup.com': 'productive',
    'airtable.com': 'productive',
    'miro.com': 'productive',
    'obsidian.md': 'productive',
    // ── Productive: Communication (Work) ────────────────────────────────
    'slack.com': 'productive',
    'zoom.us': 'productive',
    'teams.microsoft.com': 'productive',
    'meet.google.com': 'productive',
    'mail.google.com': 'productive',
    'outlook.live.com': 'productive',
    'outlook.com': 'productive',
    'office.com': 'productive',
    'calendar.google.com': 'productive',
    'drive.google.com': 'productive',
    'docs.google.com': 'productive',
    // ── Productive: AI Tools ────────────────────────────────────────────
    'chatgpt.com': 'productive',
    'claude.ai': 'productive',
    'perplexity.ai': 'productive',
    'gemini.google.com': 'productive',
    'copilot.microsoft.com': 'productive',
    'deepl.com': 'productive',
    'grammarly.com': 'productive',
    // ── Productive: Learning ────────────────────────────────────────────
    'coursera.org': 'productive',
    'udemy.com': 'productive',
    'pluralsight.com': 'productive',
    'khanacademy.org': 'productive',
    'edx.org': 'productive',
    'skillshare.com': 'productive',
    'linkedin.com': 'productive',
    'duolingo.com': 'productive',
    'leetcode.com': 'productive',
    'hackerrank.com': 'productive',
    'codewars.com': 'productive',
    'exercism.org': 'productive',
    'freecodecamp.org': 'productive',
    'frontendmentor.io': 'productive',
    'theodinproject.com': 'productive',
    // ── Unproductive: Social Media ──────────────────────────────────────
    'twitter.com': 'unproductive',
    'x.com': 'unproductive',
    'instagram.com': 'unproductive',
    'facebook.com': 'unproductive',
    'tiktok.com': 'unproductive',
    'snapchat.com': 'unproductive',
    'pinterest.com': 'unproductive',
    'tumblr.com': 'unproductive',
    'threads.net': 'unproductive',
    // ── Unproductive: Entertainment ─────────────────────────────────────
    'youtube.com': 'unproductive',
    'twitch.tv': 'unproductive',
    'netflix.com': 'unproductive',
    'primevideo.com': 'unproductive',
    'disneyplus.com': 'unproductive',
    'hulu.com': 'unproductive',
    'max.com': 'unproductive',
    'crunchyroll.com': 'unproductive',
    'bilibili.com': 'unproductive',
    'dailymotion.com': 'unproductive',
    // ── Unproductive: Time-sink ─────────────────────────────────────────
    'reddit.com': 'unproductive',
    '9gag.com': 'unproductive',
    'buzzfeed.com': 'unproductive',
    'dailymail.co.uk': 'unproductive',
    // ── Unproductive: Gaming ────────────────────────────────────────────
    'store.steampowered.com': 'unproductive',
    'epicgames.com': 'unproductive',
    'gog.com': 'unproductive',
};

/**
 * Returns effective category. Priority:
 * 1. Explicit user setting
 * 2. Default list (full domain)
 * 3. Subdomain fallback  e.g. docs.github.com → github.com
 * 4. 'neutral'
 */
function getEffectiveCategory(domain, userCategories) {
    if (!domain) return 'neutral';
    if (domain in userCategories) return userCategories[domain];
    if (domain in DEFAULT_CATEGORIES) return DEFAULT_CATEGORIES[domain];
    // Subdomain fallback
    const parts = domain.split('.');
    if (parts.length > 2) {
        const parent = parts.slice(-2).join('.');
        if (parent in userCategories) return userCategories[parent];
        if (parent in DEFAULT_CATEGORIES) return DEFAULT_CATEGORIES[parent];
    }
    return 'neutral';
}