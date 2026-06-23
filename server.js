/**
 * SnapSaver — Backend Server
 *
 * Fetches public Snapchat stories by scraping the __NEXT_DATA__ JSON
 * embedded in Snapchat's public profile pages, and proxies media
 * downloads to bypass browser CORS restrictions.
 *
 * Architecture:
 *   GET /api/stories/:username → Scrape profile, return JSON with stories
 *   GET /api/download?url=...  → Proxy media from Snapchat CDN to client
 *
 * Data source path inside __NEXT_DATA__:
 *   props.pageProps.story.snapList[]         → Stories
 *   props.pageProps.userProfile.publicProfileInfo → Profile info
 *
 * Usage:
 *   npm install
 *   node server.js
 *   Open http://localhost:3000
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
//  Shared Constants
// ---------------------------------------------------------------------------

/** User-Agent sent when making requests to Snapchat */
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Regex to extract the __NEXT_DATA__ JSON block from a Snapchat profile page */
const NEXT_DATA_REGEX = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

// ---------------------------------------------------------------------------
//  Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json());

// Serve frontend static files
// Production: cache static assets for 1 day (improves PageSpeed / AdSense scores)
// Development: no caching (ensures code updates appear immediately)
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.static(path.join(__dirname), {
  etag: isProduction,
  lastModified: isProduction,
  maxAge: isProduction ? '1d' : 0,
  setHeaders: (res) => {
    if (!isProduction) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// ---------------------------------------------------------------------------
//  API Route: GET /api/stories/:username
//  Returns profile info + all active stories for a public Snapchat user.
// ---------------------------------------------------------------------------

app.get('/api/stories/:username', async (req, res) => {
  let { username } = req.params;
  username = username.replace(/^@/, '').trim();

  if (!username || username.length < 2) {
    return res.status(400).json({
      error: 'Please enter a valid Snapchat username (at least 2 characters).',
      stories: [],
    });
  }

  console.log(`[API] Fetching stories for: ${username}`);

  try {
    const result = await scrapeSnapchatProfile(username);
    console.log(`[API] Found ${result.stories.length} stories for @${username}`);
    return res.json(result);
  } catch (err) {
    console.error(`[API] Error for @${username}:`, err.message);
    return res.status(500).json({
      error: 'Could not load stories right now. Please try again in a moment.',
      stories: [],
    });
  }
});

// ---------------------------------------------------------------------------
//  API Route: GET /api/download?url=...
//  Proxies a media file from Snapchat's CDN to the client browser,
//  bypassing CORS and forcing a file download with a proper filename.
// ---------------------------------------------------------------------------

app.get('/api/download', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing download URL.' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': 'https://www.snapchat.com/',
      },
    });

    if (!upstream.ok) {
      throw new Error(`Snapchat CDN returned ${upstream.status}`);
    }

    // Determine file extension from upstream content-type
    const contentType = upstream.headers.get('content-type') || '';
    const isVideo     = contentType.includes('video');
    const ext         = isVideo ? 'mp4' : 'jpg';

    // Force browser to download (not display) the file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="snapsaver_${Date.now()}.${ext}"`);

    upstream.body.pipe(res);
  } catch (err) {
    console.error('[Download] Error:', err.message);
    res.status(500).json({ error: 'Download failed. The media may have expired.' });
  }
});

// ---------------------------------------------------------------------------
//  Core: Scrape Snapchat Profile Page
//  Fetches the public profile HTML, extracts __NEXT_DATA__, and returns
//  structured profile + story data.
// ---------------------------------------------------------------------------

async function scrapeSnapchatProfile(username) {
  const profileUrl = `https://www.snapchat.com/@${encodeURIComponent(username)}`;
  console.log(`[Scraper] Fetching: ${profileUrl}`);

  // Fetch the profile page HTML
  const response = await fetch(profileUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Snapchat returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // Extract the __NEXT_DATA__ JSON blob
  const match = html.match(NEXT_DATA_REGEX);
  if (!match || !match[1]) {
    console.warn('[Scraper] __NEXT_DATA__ not found — page structure may have changed');
    return { username, displayName: username, bio: '', subscriberCount: 0, profilePicUrl: '', stories: [] };
  }

  let pageData;
  try {
    pageData = JSON.parse(match[1]);
  } catch {
    throw new Error('Failed to parse page data from Snapchat');
  }

  const pageProps = pageData?.props?.pageProps || {};

  // --- Extract profile info ---
  const profile        = pageProps?.userProfile?.publicProfileInfo || {};
  const displayName    = profile?.title || username;
  const bio            = profile?.bio || '';
  const subscriberCount = profile?.subscriberCount || 0;
  const avatarUrl      = profile?.squareHeroImageUrl || profile?.profilePicUrl || '';

  // --- Extract stories ---
  const stories  = parseStories(pageProps?.story?.snapList || []);

  // --- Extract spotlight content (if available) ---
  const spotlightSrc = pageProps?.spotlightFeed?.elements || pageProps?.curatedHighlights || [];
  const spotlights   = parseSpotlights(spotlightSrc, stories.length);

  const allContent = [...stories, ...spotlights];

  console.log(`[Scraper] Profile: ${displayName} (@${username}), ${allContent.length} items found`);

  return {
    username,
    displayName,
    bio,
    subscriberCount,
    profilePicUrl: avatarUrl ? proxyUrl(avatarUrl) : '',
    stories: allContent,
  };
}

// ---------------------------------------------------------------------------
//  Parsers — Transform raw Snapchat data into clean story objects
// ---------------------------------------------------------------------------

/**
 * Parses the snapList array from __NEXT_DATA__ into story objects.
 * @param {Array} snapList — Raw snap objects from Snapchat
 * @returns {Array} — Cleaned story objects
 */
function parseStories(snapList) {
  return snapList.map((snap, index) => {
    const urls      = snap?.snapUrls || {};
    const mediaUrl  = urls?.mediaUrl || '';
    const thumbUrl  = urls?.mediaPreviewUrl?.value || '';
    const snapId    = snap?.snapId?.value || `snap_${index}`;
    const isVideo   = snap?.snapMediaType !== 0;

    const timestamp = snap?.timestampInSec?.value
      ? parseInt(snap.timestampInSec.value, 10) * 1000
      : snap?.timestamp || Date.now() - index * 3600000;

    const rawDuration = snap?.snapDurationInSec || snap?.mediaDuration || 0;
    const duration    = typeof rawDuration === 'number' ? Math.round(rawDuration) : 10;

    return {
      id:           snapId,
      index,
      type:         isVideo ? 'video' : 'image',
      mediaType:    'Story',
      timestamp,
      duration,
      thumbnailUrl: thumbUrl ? proxyUrl(thumbUrl) : '',
      mediaUrl:     mediaUrl ? proxyUrl(mediaUrl) : '',
    };
  });
}

/**
 * Parses spotlight/highlight content into story-compatible objects.
 * @param {Array} items — Raw spotlight/highlight objects
 * @param {number} startIndex — Index offset for numbering
 * @returns {Array} — Cleaned spotlight objects
 */
function parseSpotlights(items, startIndex) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, i) => {
      const mediaUrl = item?.snapUrls?.mediaUrl || item?.mediaUrl || '';
      const thumbUrl = item?.snapUrls?.mediaPreviewUrl?.value || item?.thumbnailUrl || '';
      if (!mediaUrl) return null;

      return {
        id:           item?.snapId?.value || `spotlight_${i}`,
        index:        startIndex + i,
        type:         'video',
        mediaType:    'Spotlight',
        timestamp:    item?.timestamp || Date.now() - (startIndex + i) * 3600000,
        duration:     item?.snapDurationInSec || 15,
        thumbnailUrl: thumbUrl ? proxyUrl(thumbUrl) : '',
        mediaUrl:     mediaUrl ? proxyUrl(mediaUrl) : '',
      };
    })
    .filter(Boolean);
}

/**
 * Wraps a direct CDN URL in our download proxy route.
 * @param {string} url — Direct Snapchat CDN URL
 * @returns {string} — Proxied URL like /api/download?url=...
 */
function proxyUrl(url) {
  return `/api/download?url=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
//  Start Server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log('');
  console.log(`🚀 SnapSaver server running at http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/stories/{username}`);
  console.log(`🌐 Web: http://localhost:${PORT}`);
  console.log('');
});
