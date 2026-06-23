const fetch = require('node-fetch');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const NEXT_DATA_REGEX = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

function proxyUrl(url) {
  return `/api/download?url=${encodeURIComponent(url)}`;
}

function parseStories(snapList) {
  return snapList.map((snap, index) => {
    const urls = snap?.snapUrls || {};
    const mediaUrl = urls?.mediaUrl || '';
    const thumbUrl = urls?.mediaPreviewUrl?.value || '';
    const snapId = snap?.snapId?.value || `snap_${index}`;
    const isVideo = snap?.snapMediaType !== 0;

    const timestamp = snap?.timestampInSec?.value
      ? parseInt(snap.timestampInSec.value, 10) * 1000
      : snap?.timestamp || Date.now() - index * 3600000;

    const rawDuration = snap?.snapDurationInSec || snap?.mediaDuration || 0;
    const duration = typeof rawDuration === 'number' ? Math.round(rawDuration) : 10;

    return {
      id: snapId,
      index,
      type: isVideo ? 'video' : 'image',
      mediaType: 'Story',
      timestamp,
      duration,
      thumbnailUrl: thumbUrl ? proxyUrl(thumbUrl) : '',
      mediaUrl: mediaUrl ? proxyUrl(mediaUrl) : '',
    };
  });
}

function parseSpotlights(items, startIndex) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, i) => {
      const mediaUrl = item?.snapUrls?.mediaUrl || item?.mediaUrl || '';
      const thumbUrl = item?.snapUrls?.mediaPreviewUrl?.value || item?.thumbnailUrl || '';
      if (!mediaUrl) return null;

      return {
        id: item?.snapId?.value || `spotlight_${i}`,
        index: startIndex + i,
        type: 'video',
        mediaType: 'Spotlight',
        timestamp: item?.timestamp || Date.now() - (startIndex + i) * 3600000,
        duration: item?.snapDurationInSec || 15,
        thumbnailUrl: thumbUrl ? proxyUrl(thumbUrl) : '',
        mediaUrl: mediaUrl ? proxyUrl(mediaUrl) : '',
      };
    })
    .filter(Boolean);
}

async function scrapeSnapchatProfile(username) {
  const profileUrl = `https://www.snapchat.com/@${encodeURIComponent(username)}`;

  const response = await fetch(profileUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Snapchat returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(NEXT_DATA_REGEX);

  if (!match || !match[1]) {
    return {
      username,
      displayName: username,
      bio: '',
      subscriberCount: 0,
      profilePicUrl: '',
      stories: [],
    };
  }

  let pageData;
  try {
    pageData = JSON.parse(match[1]);
  } catch {
    throw new Error('Failed to parse page data from Snapchat');
  }

  const pageProps = pageData?.props?.pageProps || {};
  const profile = pageProps?.userProfile?.publicProfileInfo || {};
  const displayName = profile?.title || username;
  const bio = profile?.bio || '';
  const subscriberCount = parseInt(profile?.subscriberCount, 10) || 0;
  const avatarUrl = profile?.squareHeroImageUrl || profile?.profilePicUrl || '';

  const stories = parseStories(pageProps?.story?.snapList || []);
  const spotlightSrc = pageProps?.spotlightFeed?.elements || pageProps?.curatedHighlights || [];
  const spotlights = parseSpotlights(spotlightSrc, stories.length);
  const allContent = [...stories, ...spotlights];

  return {
    username,
    displayName,
    bio,
    subscriberCount,
    profilePicUrl: avatarUrl ? proxyUrl(avatarUrl) : '',
    stories: allContent,
  };
}

module.exports = {
  BROWSER_UA,
  scrapeSnapchatProfile,
};
