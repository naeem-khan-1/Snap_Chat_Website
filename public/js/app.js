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
  const card = document.getElementById('story-viewer-card');
  const closeBtn = document.getElementById('story-viewer-close');
  const msgCloseBtn = document.getElementById('story-viewer-download-msg-close');

  closeBtn?.addEventListener('click', closeStoryViewer);
  msgCloseBtn?.addEventListener('click', hideViewerDownloadMessage);
  card?.addEventListener('click', (e) => e.stopPropagation());
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeStoryViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStoryViewer();
  });
  window.addEventListener('resize', layoutStoryViewerInsets);
  window.addEventListener('orientationchange', () => {
    setTimeout(layoutStoryViewerInsets, 100);
  });
}

function layoutStoryViewerInsets() {
  const modal = document.getElementById('story-viewer-modal');
  const header = document.querySelector('.story-viewer-header');
  const footer = document.querySelector('.story-viewer-footer');
  const body = document.getElementById('story-viewer-body');

  if (!modal?.classList.contains('active') || !header || !body) return;

  if (window.innerWidth > 768) {
    body.style.top = '';
    body.style.bottom = '';
    body.style.position = '';
    return;
  }

  const headerHeight = header.getBoundingClientRect().height;
  const footerHeight = footer && window.getComputedStyle(footer).display !== 'none'
    ? footer.getBoundingClientRect().height
    : 0;

  body.style.position = 'fixed';
  body.style.left = '0';
  body.style.right = '0';
  body.style.top = `${headerHeight}px`;
  body.style.bottom = `${footerHeight}px`;
}

function wireViewerDownloadButtons(url, type) {
  const footerBtn = document.getElementById('story-viewer-download');
  const topBtn = document.getElementById('story-viewer-download-top');

  [footerBtn, topBtn].forEach((btn) => {
    if (!btn) return;
    btn.dataset.url = url;
    btn.dataset.type = type;
    btn.onclick = () => handleStoryDownload(btn);
    btn.disabled = false;
    if (btn === footerBtn) btn.innerHTML = '⬇ Download';
    if (btn === topBtn) btn.innerHTML = '⬇ Download';
  });
}

function hideViewerDownloadMessage() {
  if (viewerMsgTimer) {
    clearTimeout(viewerMsgTimer);
    viewerMsgTimer = null;
  }
  const box = document.getElementById('story-viewer-download-msg');
  if (box) {
    box.classList.remove('is-fading');
    box.setAttribute('hidden', '');
  }
  layoutStoryViewerInsets();
}

function fadeViewerDownloadMessage() {
  const box = document.getElementById('story-viewer-download-msg');
  if (!box || box.hasAttribute('hidden')) return;
  box.classList.add('is-fading');
  viewerMsgTimer = setTimeout(hideViewerDownloadMessage, 560);
}

function showDownloadProgressMessage() {
  const box = document.getElementById('story-viewer-download-msg');
  const text = document.getElementById('story-viewer-download-msg-text');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    showDismissibleToast('Downloading in progress!', 'progress', 1300);
    return;
  }

  if (!box || !text) return;

  if (viewerMsgTimer) {
    clearTimeout(viewerMsgTimer);
    viewerMsgTimer = null;
  }

  text.textContent = 'Downloading in progress!';
  box.className = 'story-download-msg story-download-msg--progress';
  box.classList.remove('is-fading');
  box.removeAttribute('hidden');
  viewerMsgTimer = setTimeout(fadeViewerDownloadMessage, 1300);
  layoutStoryViewerInsets();
}

function closeStoryViewer() {
  const modal = document.getElementById('story-viewer-modal');
  const body = document.getElementById('story-viewer-body');
  const video = body?.querySelector('video');

  video?.pause();
  body.innerHTML = '';
  hideViewerDownloadMessage();
  modal?.classList.remove('active');
  unlockBodyScroll();
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

  titleEl.textContent = title;
  body.innerHTML = type === 'video'
    ? `<video src="${url}" controls autoplay playsinline webkit-playsinline class="story-viewer-media"></video>`
    : `<img src="${url}" alt="${title}" class="story-viewer-media">`;

  wireViewerDownloadButtons(url, type);
  hideViewerDownloadMessage();

  modal.classList.add('active');
  document.documentElement.classList.add('viewer-open');
  document.body.classList.add('viewer-open');
  requestAnimationFrame(layoutStoryViewerInsets);
  setTimeout(layoutStoryViewerInsets, 80);
}

function unlockBodyScroll() {
  document.documentElement.classList.remove('viewer-open');
  document.body.classList.remove('viewer-open');
  const body = document.getElementById('story-viewer-body');
  if (body) {
    body.style.top = '';
    body.style.bottom = '';
    body.style.position = '';
  }
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
    const storyTitle   = `${story.mediaType} #${index + 1} · ${timeAgo}`;

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

  const isViewerDownload = btn.id === 'story-viewer-download' || btn.id === 'story-viewer-download-top';

  if (isViewerDownload) {
    showDownloadProgressMessage();
    const otherId = btn.id === 'story-viewer-download' ? 'story-viewer-download-top' : 'story-viewer-download';
    const otherBtn = document.getElementById(otherId);
    if (otherBtn) {
      otherBtn.innerHTML = '⏳ Downloading...';
      otherBtn.classList.add('downloading');
      otherBtn.disabled = true;
    }
  } else {
    showDismissibleToast('Downloading in progress!', 'progress', 1300);
  }

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
  } catch (err) {
    console.error('Download failed:', err);
    btn.innerHTML = '❌ Failed';
    hideViewerDownloadMessage();
    showDismissibleToast('Download failed. Please try again.', 'error', 4000);
  }

  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove('downloading');
    btn.disabled = false;
    if (isViewerDownload) {
      const otherId = btn.id === 'story-viewer-download' ? 'story-viewer-download-top' : 'story-viewer-download';
      const otherBtn = document.getElementById(otherId);
      if (otherBtn) {
        otherBtn.innerHTML = '⬇ Download';
        otherBtn.classList.remove('downloading');
        otherBtn.disabled = false;
      }
    }
  }, 900);
}

// ---------------------------------------------------------------------------
//  Toast Notification — Dismissible messages with close button
// ---------------------------------------------------------------------------

let toastTimer = null;
let viewerMsgTimer = null;

/**
 * Shows a toast with a close (✕) button.
 * @param {string} message
 * @param {'default'|'success'|'error'|'progress'} type
 * @param {number} duration — Auto-hide ms (0 = stay until closed or replaced)
 */
function showDismissibleToast(message, type = 'default', duration = 5000) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  const existing = document.getElementById('snapsaver-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'snapsaver-toast';
  toast.className = `snapsaver-toast snapsaver-toast--${type}`;
  toast.innerHTML = `
    <span class="snapsaver-toast-text">${message}</span>
    <button type="button" class="snapsaver-toast-close" aria-label="Close">✕</button>
  `;

  const closeToast = () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toast.classList.add('is-closing');
    setTimeout(() => toast.remove(), 400);
  };

  toast.querySelector('.snapsaver-toast-close')?.addEventListener('click', closeToast);
  document.body.appendChild(toast);

  if (duration > 0) {
    toastTimer = setTimeout(closeToast, duration);
  }
}

/**
 * Simple toast for short system messages.
 */
function showToast(message, type = 'default') {
  showDismissibleToast(message, type, 4000);
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
