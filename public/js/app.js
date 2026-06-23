/**
 * SnapSaver — Frontend Application
 * 
 * Handles search, story rendering, and downloads.
 * Communicates with the backend API at /api/stories/:username
 * and downloads media through /api/download?url=...
 * 
 * Download flow: fetch → blob → createObjectURL → <a download> click
 * This ensures files save with correct names (.jpg/.mp4) on all devices.
 */

// ---------------------------------------------------------------------------
//  Configuration
// ---------------------------------------------------------------------------

/** API base path — relative so it works on localhost, ngrok, and production */
const API_BASE = '/api';

// ---------------------------------------------------------------------------
//  Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSearch();
  initStoryViewer();
  initTabs();
  initFAQ();
  initScrollTop();
  initStickyAd();
});

// ---------------------------------------------------------------------------
//  Navbar — Scroll effect & mobile toggle
// ---------------------------------------------------------------------------

function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const mobileBtn = document.getElementById('nav-mobile-btn');
  const navLinks  = document.getElementById('nav-links');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });

  mobileBtn?.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    mobileBtn.textContent = navLinks.classList.contains('open') ? '✕' : '☰';
  });

  // Close mobile menu when a link is tapped
  navLinks?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      mobileBtn.textContent = '☰';
    });
  });
}

// ---------------------------------------------------------------------------
//  Username Extraction — Supports URLs and plain usernames
// ---------------------------------------------------------------------------

/**
 * Extracts a clean Snapchat username from user input.
 * Handles full URLs (snapchat.com/@user, /add/user, /stories/user)
 * and plain text with or without leading @.
 *
 * @param {string} input — Raw user input from the search box
 * @returns {string} — Clean username
 */
function extractUsername(input) {
  let text = input.trim();

  // Strip protocol and www prefix
  text = text.replace(/^https?:\/\/(www\.)?/i, '');

  // Drop query params / hash before matching (e.g. ?share_id=...&locale=en-PK)
  const pathOnly = text.split(/[?#]/)[0].replace(/\/+$/, '');

  const patterns = [
    /snapchat\.com\/add\/@?([a-zA-Z0-9._-]+)/i,
    /story\.snapchat\.com\/s\/@?([a-zA-Z0-9._-]+)/i,
    /snapchat\.com\/stories\/@?([a-zA-Z0-9._-]+)/i,
    /snapchat\.com\/@([a-zA-Z0-9._-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = pathOnly.match(pattern);
    if (match?.[1]) return match[1];
  }

  // Plain username — not a snapchat.com URL
  if (!pathOnly.includes('snapchat.com')) {
    return pathOnly.replace(/^@/, '').split(/[/?#]/)[0];
  }

  return '';
}

// ---------------------------------------------------------------------------
//  Search — Form submission, API call, result routing
// ---------------------------------------------------------------------------

function initSearch() {
  const form           = document.getElementById('search-form');
  const input          = document.getElementById('search-input');
  const modal          = document.getElementById('loading-modal');
  const resultsSection = document.getElementById('results-section');
  const storyList      = document.getElementById('story-list');
  const profileHeader  = document.getElementById('profile-header');
  const storiesSummaryBar = document.getElementById('stories-summary-bar');
  const resultsError   = document.getElementById('results-error');
  const tryAgainBtn    = document.getElementById('btn-try-again');

  // "Try Again" — reset and scroll back to search
  tryAgainBtn?.addEventListener('click', () => {
    resultsSection.classList.remove('active');
    input.value = '';
    input.focus();
    document.getElementById('hero').scrollIntoView({ behavior: 'smooth' });
  });

  // Form submit — main search flow
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const raw = input.value.trim();
    if (!raw) {
      input.focus();
      input.style.borderColor = '#ef4444';
      setTimeout(() => (input.style.borderColor = ''), 1500);
      return;
    }

    const username = extractUsername(raw);

    if (!username) {
      input.focus();
      input.style.borderColor = '#ef4444';
      showToast('Could not find a username in that link. Try pasting the profile URL or username.');
      setTimeout(() => (input.style.borderColor = ''), 1500);
      return;
    }

    // Show loading spinner, clear previous results
    modal.classList.add('active');
    profileHeader.style.display = 'none';
    storiesSummaryBar.style.display = 'none';
    storyList.innerHTML = '';
    resultsError.classList.remove('active');

    try {
      const profileData = await fetchStories(username);
      const stories = profileData.stories || [];
      modal.classList.remove('active');

      if (stories.length > 0) {
        renderStoryResults(profileData);
      } else {
        showNoResults(username);
      }
    } catch (err) {
      modal.classList.remove('active');
      console.error('Search failed:', err);
      showNoResults(username);
    }
  });
}

// ---------------------------------------------------------------------------
//  Story Viewer — Preview stories in a modal
// ---------------------------------------------------------------------------

function initStoryViewer() {
  const modal = document.getElementById('story-viewer-modal');
  const closeBtn = document.getElementById('story-viewer-close');

  closeBtn?.addEventListener('click', closeStoryViewer);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeStoryViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStoryViewer();
  });
}

function closeStoryViewer() {
  const modal = document.getElementById('story-viewer-modal');
  const body = document.getElementById('story-viewer-body');
  const video = body?.querySelector('video');

  video?.pause();
  body.innerHTML = '';
  modal?.classList.remove('active');
  document.body.classList.remove('viewer-open');
}

function handleStoryView(btn) {
  const url = btn.dataset.url;
  const type = btn.dataset.type;
  const title = btn.dataset.title || 'Story';

  if (!url || url === '#') {
    showToast('Preview not available for this story.');
    return;
  }

  const modal = document.getElementById('story-viewer-modal');
  const body = document.getElementById('story-viewer-body');
  const titleEl = document.getElementById('story-viewer-title');
  const downloadBtn = document.getElementById('story-viewer-download');

  titleEl.textContent = title;
  body.innerHTML = type === 'video'
    ? `<video src="${url}" controls autoplay playsinline webkit-playsinline class="story-viewer-media"></video>`
    : `<img src="${url}" alt="${title}" class="story-viewer-media">`;

  downloadBtn.dataset.url = url;
  downloadBtn.dataset.type = type;
  downloadBtn.onclick = () => handleStoryDownload(downloadBtn);

  modal.classList.add('active');
  document.body.classList.add('viewer-open');
}

// ---------------------------------------------------------------------------
//  API — Fetch stories from backend
// ---------------------------------------------------------------------------

/**
 * Calls the backend API to get profile info and stories.
 * @param {string} username
 * @returns {Promise<Object>} — { username, displayName, bio, subscriberCount, profilePicUrl, stories[] }
 */
async function fetchStories(username) {
  const res = await fetch(`${API_BASE}/stories/${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
//  Rendering — Profile header & story list
// ---------------------------------------------------------------------------

/**
 * Populates the results section with profile info and story cards.
 * @param {Object} profileData — Response from the /api/stories endpoint
 */
function renderStoryResults(profileData) {
  const { username, displayName, bio, subscriberCount, profilePicUrl, stories } = profileData;

  const resultsSection = document.getElementById('results-section');
  const storyList      = document.getElementById('story-list');
  const profileHeader  = document.getElementById('profile-header');
  const storiesSummaryBar = document.getElementById('stories-summary-bar');
  const resultsError   = document.getElementById('results-error');

  // --- Profile card ---
  document.getElementById('profile-name').textContent     = displayName || username;
  document.getElementById('profile-username').textContent  = `@${username}`;
  document.getElementById('profile-bio').textContent       = bio || '';
  document.getElementById('subscriber-count').textContent  = formatCount(subscriberCount);
  document.getElementById('story-count').textContent       = stories.length;
  document.getElementById('total-stories-label').textContent =
    `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;

  // Avatar
  const avatarImg      = document.getElementById('profile-avatar-img');
  const avatarFallback = document.getElementById('profile-avatar-fallback');
  if (profilePicUrl) {
    avatarImg.src = profilePicUrl;
    avatarImg.style.display      = 'block';
    avatarFallback.style.display = 'none';
  } else {
    avatarImg.style.display      = 'none';
    avatarFallback.style.display = 'block';
  }

  profileHeader.style.display  = 'flex';
  storiesSummaryBar.style.display = 'flex';
  resultsError.classList.remove('active');

  // --- Story cards ---
  let html = '';

  stories.forEach((story, index) => {
    // Ad slot after every 3rd story (empty container ready for AdSense)
    if (index > 0 && index % 3 === 0) {
      html += `<div class="ad-zone ad-zone--inline"><!-- AdSense in-feed ad --></div>`;
    }

    const timeAgo      = formatTimeAgo(story.timestamp);
    const isVideo      = story.type === 'video';
    const badgeClass   = isVideo ? 'story-badge--video' : 'story-badge--image';
    const badgeIcon    = isVideo ? '🎬' : '🖼️';
    const durationStr  = isVideo ? formatDuration(story.duration) : '';
    const downloadUrl  = story.mediaUrl || '#';
    const storyTitle   = `${story.mediaType} #${index + 1} — ${timeAgo}`;

    const thumbContent = story.thumbnailUrl
      ? `<img src="${story.thumbnailUrl}" alt="Story preview" loading="lazy">`
      : `<span class="story-thumb-placeholder">${badgeIcon}</span>`;

    html += `
      <div class="story-item" data-index="${index}" style="animation: fadeUp 0.3s ${index * 0.05}s both">
        <div class="story-thumb"
             role="button"
             tabindex="0"
             aria-label="View ${storyTitle}"
             data-url="${downloadUrl}"
             data-type="${story.type}"
             data-title="${storyTitle}"
             onclick="handleStoryView(this)"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleStoryView(this);}">
          ${thumbContent}
          ${durationStr ? `<span class="media-duration">${durationStr}</span>` : ''}
        </div>
        <div class="story-details">
          <p class="story-title">${storyTitle}</p>
          <div class="story-meta">
            <span class="story-badge ${badgeClass}">${badgeIcon} ${story.type}</span>
            <span>${timeAgo}</span>
            ${durationStr ? `<span>⏱ ${durationStr}</span>` : ''}
          </div>
        </div>
        <div class="story-actions">
          <button class="story-view-btn"
                  data-url="${downloadUrl}"
                  data-type="${story.type}"
                  data-title="${storyTitle}"
                  onclick="handleStoryView(this)">
            👁 View
          </button>
          <button class="story-download-btn"
                  data-url="${downloadUrl}"
                  data-type="${story.type}"
                  data-id="${story.id}"
                  onclick="handleStoryDownload(this)">
            ⬇ Download
          </button>
        </div>
      </div>`;
  });

  storyList.innerHTML = html;

  // Show results and scroll into view
  resultsSection.classList.add('active');
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/**
 * Shows a friendly "no results" message.
 */
function showNoResults(username) {
  const resultsSection = document.getElementById('results-section');
  const profileHeader  = document.getElementById('profile-header');
  const storiesSummaryBar = document.getElementById('stories-summary-bar');
  const resultsError   = document.getElementById('results-error');

  profileHeader.style.display  = 'none';
  storiesSummaryBar.style.display = 'none';
  document.getElementById('story-list').innerHTML = '';
  resultsError.classList.add('active');
  resultsSection.classList.add('active');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
//  Download — Fetch as blob, save with proper filename
// ---------------------------------------------------------------------------

/**
 * Downloads a single story to the user's device.
 * Uses a same-origin anchor click so the browser handles the file directly
 * from /api/download (works better for videos than fetch + blob).
 *
 * @param {HTMLButtonElement} btn — The download button that was clicked
 */
function handleStoryDownload(btn) {
  const url          = btn.dataset.url;
  const type         = btn.dataset.type;
  const originalText = btn.innerHTML;

  // Guard: no real download URL available
  if (!url || url === '#') {
    showToast('Download not available for this story. Please try again later.');
    return;
  }

  btn.innerHTML = '⏳ Downloading...';
  btn.classList.add('downloading');
  btn.disabled = true;

  try {
    const ext      = type === 'video' ? 'mp4' : 'jpg';
    const filename = `snapsaver_${Date.now()}.${ext}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    btn.innerHTML = '✅ Downloaded';
    showToast('Downloaded successfully! Check your Downloads folder or gallery.', 'success');
  } catch (err) {
    console.error('Download failed:', err);
    btn.innerHTML = '❌ Failed';
    showToast('Download failed. Please check your connection and try again.', 'error');
  }

  // Reset button after a short delay
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove('downloading');
    btn.disabled = false;
  }, 2500);
}

// ---------------------------------------------------------------------------
//  Toast Notification — User-friendly messages
// ---------------------------------------------------------------------------

/**
 * Shows a non-intrusive toast message at the bottom of the screen.
 * Auto-dismisses after 4 seconds.
 *
 * @param {string} message — The message to display
 * @param {'default'|'success'|'error'} type — Toast style
 */
function showToast(message, type = 'default') {
  // Remove any existing toast
  const existing = document.getElementById('snapsaver-toast');
  if (existing) existing.remove();

  const borderColor = type === 'success'
    ? 'rgba(34, 197, 94, 0.45)'
    : type === 'error'
      ? 'rgba(239, 68, 68, 0.45)'
      : 'rgba(139, 92, 246, 0.3)';

  const toast = document.createElement('div');
  toast.id = 'snapsaver-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(30, 30, 60, 0.95); color: #fff; padding: 14px 28px;
    border-radius: 12px; font-size: 0.9rem; z-index: 99999;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);
    border: 1px solid ${borderColor}; max-width: 90vw; text-align: center;
    animation: fadeUp 0.3s ease;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---------------------------------------------------------------------------
//  Formatting Helpers
// ---------------------------------------------------------------------------

/** Formats a subscriber count into a human-readable string (e.g. 1.4M, 12K) */
function formatCount(count) {
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (!num || isNaN(num)) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 10_000)    return (num / 1_000).toFixed(0) + 'K';
  return num.toLocaleString();
}

/** Formats a Unix timestamp into a relative time string (e.g. "3h ago") */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)  return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Formats seconds into mm:ss display (e.g. "1:05") */
function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
//  UI Components — Tabs, FAQ, Scroll-to-top, Sticky Ad
// ---------------------------------------------------------------------------

/** Content type tab switching */
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/** FAQ accordion — only one answer open at a time */
function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      items.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });
}

/** Floating scroll-to-top button */
function initScrollTop() {
  const btn = document.getElementById('scroll-top');
  window.addEventListener('scroll', () => {
    btn?.classList.toggle('visible', window.scrollY > 400);
  });
  btn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/** Sticky bottom ad banner — shows after 5 seconds */
function initStickyAd() {
  const stickyAd = document.getElementById('sticky-ad');
  const closeBtn = stickyAd?.querySelector('.ad-close');

  setTimeout(() => {
    if (stickyAd) stickyAd.style.display = 'flex';
  }, 5000);

  closeBtn?.addEventListener('click', () => {
    stickyAd.style.display = 'none';
  });
}

// ---------------------------------------------------------------------------
//  CSS Animation — Injected once for story card entrance
// ---------------------------------------------------------------------------

const _style = document.createElement('style');
_style.textContent = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(_style);
