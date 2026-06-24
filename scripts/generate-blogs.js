#!/usr/bin/env node
/**
 * Generates static blog HTML files for SnapSaver.
 * Run: node scripts/generate-blogs.js
 */

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '../public/blogs');
const SITE = 'https://thesnapsaver.com';
const STYLE_VER = '25';
const BLOG_CSS_VER = '4';
const THEME_JS_VER = '2';
const NAV_JS_VER = '2';

const THEME_INIT = `<script>(function(){try{var d=localStorage.getItem('snapsaver-theme')==='dark';var r=document.documentElement;if(d)r.setAttribute('data-theme','dark');else r.removeAttribute('data-theme');function u(dm){document.querySelectorAll('img[data-src-dark]').forEach(function(i){i.src=dm?i.getAttribute('data-src-dark'):i.getAttribute('data-src-light');});var f=document.querySelector('link[rel="icon"]');if(f)f.href=dm?'/images/logo.png':'/images/logo-light.png';}document.addEventListener('DOMContentLoaded',function(){u(d);});}catch(e){}})();</script>`;

const THEME_TOGGLE = `<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to night mode" title="Night mode">
          <svg class="theme-icon theme-icon--sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg class="theme-icon theme-icon--moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>`;

const posts = require('./blog-posts-data');

const IMAGE_MAP = {
  'how-to-download-snapchat-stories-without-watermark': { dark: 'blog-download-stories.png', light: 'blog-download-stories-light.png' },
  'snapchat-privacy-settings-complete-guide': { dark: 'blog-privacy-settings.png', light: 'blog-privacy-settings-light.png' },
  'how-to-use-snapsaver-snapchat-downloader': { dark: 'blog-snapsaver-tutorial.png', light: 'blog-snapsaver-tutorial-light.png' },
  'snapchat-spotlight-vs-stories-difference': { dark: 'blog-spotlight-vs-stories.png', light: 'blog-spotlight-vs-stories-light.png' },
  'is-downloading-snapchat-stories-safe-and-legal': { dark: 'blog-safe-legal.png', light: 'blog-safe-legal-light.png' },
  'how-to-view-snapchat-stories-anonymously': { dark: 'blog-anonymous-viewer.png', light: 'blog-anonymous-viewer-light.png' },
  'download-snapchat-videos-on-iphone-and-android': { dark: 'blog-mobile-download.png', light: 'blog-mobile-download-light.png' },
  'how-to-create-snapchat-public-profile': { dark: 'blog-public-profile.png', light: 'blog-public-profile-light.png' },
  'snapchat-data-privacy-what-you-need-to-know': { dark: 'blog-data-privacy.png', light: 'blog-data-privacy-light.png' },
  'how-to-save-your-own-snapchat-content-legally': { dark: 'blog-save-own-content.png', light: 'blog-save-own-content-light.png' },
};

const INDEX_HERO = { dark: 'blog-index-hero.png', light: 'blog-index-hero-light.png' };
const LOGO = { dark: 'logo.png', light: 'logo-light.png' };

posts.forEach((p) => { p.image = IMAGE_MAP[p.slug]; });

function themeImg(files, alt, attrs = '') {
  const dark = `/blogs/images/${files.dark}`;
  const light = `/blogs/images/${files.light}`;
  return `<img src="${light}" data-src-light="${light}" data-src-dark="${dark}" alt="${alt}" class="theme-image" ${attrs}>`;
}

function themeLogo(attrs = 'width="36" height="36"') {
  const dark = `/images/${LOGO.dark}`;
  const light = `/images/${LOGO.light}`;
  return `<img src="${light}" data-src-light="${light}" data-src-dark="${dark}" alt="SnapSaver Logo" class="theme-image" ${attrs}>`;
}

function postImageUrl(post, theme = 'dark') {
  return `${SITE}/blogs/images/${post.image[theme]}`;
}

function navLinks() {
  return `
  <nav class="navbar" id="navbar">
    <div class="container">
      <a href="/" class="nav-logo" id="logo">
        ${themeLogo()}
        <span>Snap<span class="gradient-text">Saver</span></span>
      </a>
      <div class="nav-links" id="nav-links">
        <a href="/">Home</a>
        <a href="/#features">Features</a>
        <a href="/#how-it-works">How It Works</a>
        <a href="/#faq">FAQ</a>
        <a href="/blogs/">Blogs <span class="nav-badge">New</span></a>
      </div>
      <div class="nav-actions">
        ${THEME_TOGGLE}
        <button class="nav-mobile-btn" id="nav-mobile-btn" aria-label="Toggle menu">☰</button>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-bottom">
        <p class="footer-copy">&copy; 2026 SnapSaver. All rights reserved. Not affiliated with Snap Inc. or Snapchat.</p>
        <p class="footer-legal-links">
          <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/dmca.html">DMCA</a>
        </p>
      </div>
    </div>
  </footer>`;
}

const FORMAT_LABELS = {
  tutorial: 'Step-by-step guide',
  reference: 'Settings reference',
  walkthrough: 'Product walkthrough',
  comparison: 'Side-by-side comparison',
  briefing: 'Legal briefing',
  faq: 'Questions & answers',
  device: 'Mobile device guide',
  creator: 'Creator playbook',
  report: 'Privacy report',
  policy: 'Compliance guide',
};

function formatLabel(layout) {
  return FORMAT_LABELS[layout] || 'Article';
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function schemas(post) {
  const url = `${SITE}/blogs/${post.slug}.html`;
  const imageUrl = postImageUrl(post);
  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      image: imageUrl,
      datePublished: post.date,
      dateModified: post.date,
      author: {
        '@type': 'Person',
        name: post.author.name,
        jobTitle: post.author.role,
        worksFor: { '@type': 'Organization', name: 'SnapSaver', url: SITE }
      },
      publisher: {
        '@type': 'Organization',
        name: 'SnapSaver',
        logo: { '@type': 'ImageObject', url: `${SITE}/images/logo.png` }
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      articleSection: post.tag,
      inLanguage: 'en-US'
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Blogs', item: `${SITE}/blogs/` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url }
      ]
    }
  ];

  if (post.softwareApp) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SnapSaver',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web Browser, Android, iOS, Windows, macOS',
      url: SITE,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' }
    });
  }

  return schemas.map(s => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`).join('\n  ');
}

function relatedLinks(post) {
  return post.related.map(slug => {
    const p = posts.find(x => x.slug === slug);
    return `<li><a href="/blogs/${slug}.html">${p.title}</a><span>${p.author.name} · ${p.tag}</span></li>`;
  }).join('\n          ');
}

function articlePage(post) {
  const url = `${SITE}/blogs/${post.slug}.html`;
  const imageUrl = postImageUrl(post);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  ${THEME_INIT}
  <title>${post.title} | SnapSaver Blogs</title>
  <meta name="description" content="${post.description}">
  <meta name="keywords" content="snapchat, ${post.tag.toLowerCase()}, snapchat downloader, snapsaver, snapchat privacy">
  <meta name="robots" content="index, follow">
  <meta name="author" content="${post.author.name}">
  <meta property="article:author" content="${post.author.name}">
  <meta property="article:section" content="${post.tag}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.description}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta property="article:published_time" content="${post.date}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${post.title}">
  <meta name="twitter:description" content="${post.description}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="icon" href="/images/logo-light.png" type="image/png">
  <link rel="stylesheet" href="/css/style.css?v=${STYLE_VER}">
  <link rel="stylesheet" href="/css/blog.css?v=${BLOG_CSS_VER}">
  ${schemas(post)}
</head>
<body>
${navLinks()}

<main class="blog-page">
  <div class="container blog-article-wrap">
    <nav class="blog-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/blogs/">Blogs</a>
    </nav>

    <article class="post post--${post.layout}" itemscope itemtype="https://schema.org/BlogPosting">
      <header class="post-header">
        <div class="post-header-meta">
          <a href="/blogs/" class="post-tag">${post.tag}</a>
          <span class="post-format">${formatLabel(post.layout)}</span>
        </div>
        <h1 class="post-title" itemprop="headline">${post.title}</h1>
        <p class="post-dek">${post.subtitle}</p>
        <div class="post-byline">
          <div class="post-author" itemprop="author" itemscope itemtype="https://schema.org/Person">
            <span class="post-avatar" aria-hidden="true">${post.author.initials}</span>
            <div>
              <span class="post-author-name" itemprop="name">${post.author.name}</span>
              <span class="post-author-role">${post.author.role}</span>
            </div>
          </div>
          <time class="post-date" datetime="${post.date}" itemprop="datePublished">${formatDate(post.date)}</time>
          <span class="post-read">${post.readTime} read</span>
        </div>
      </header>

      <figure class="post-hero">
        ${themeImg(post.image, post.title, 'width="1200" height="675" loading="eager" itemprop="image"')}
      </figure>

      <div class="post-body" itemprop="articleBody">
        ${post.content}
      </div>

      <footer class="post-footer">
        <div class="post-cta">
          <p>Need to save a public story right now? <a href="/">Open SnapSaver</a>. It's free, needs no login, and works in your browser.</p>
        </div>
        <aside class="post-related" aria-label="Related articles">
          <h3>More to read</h3>
          <ul class="post-related-list">
          ${relatedLinks(post)}
          </ul>
        </aside>
      </footer>
    </article>
  </div>
</main>

${footer()}
<script src="/js/theme.js?v=${THEME_JS_VER}"></script>
<script src="/js/nav.js?v=${NAV_JS_VER}"></script>
</body>
</html>`;
}

function indexPage() {
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const featured = sorted[0];
  const rest = sorted.slice(1);

  const featuredBlock = `
    <article class="blog-featured">
      <div class="blog-featured-visual">
        <a href="/blogs/${featured.slug}.html">
          ${themeImg(featured.image, featured.title, 'width="800" height="500" loading="eager"')}
        </a>
      </div>
      <div class="blog-featured-body">
        <span class="blog-featured-tag">${featured.tag}</span>
        <h2><a href="/blogs/${featured.slug}.html">${featured.title}</a></h2>
        <p>${featured.subtitle}</p>
        <div class="blog-featured-meta">
          <span class="post-avatar" aria-hidden="true">${featured.author.initials}</span>
          <span>${featured.author.name}</span>
          <span class="blog-feed-dot">${formatDate(featured.date)}</span>
          <span>${featured.readTime} read</span>
        </div>
      </div>
    </article>`;

  const feedItems = rest.map(p => `
    <a href="/blogs/${p.slug}.html" class="blog-feed-item">
      <div class="blog-feed-tag">${p.tag}</div>
      <h2 class="blog-feed-title">${p.title}</h2>
      <p class="blog-feed-excerpt">${p.subtitle}</p>
      <div class="blog-feed-meta">
        <span class="post-avatar" aria-hidden="true">${p.author.initials}</span>
        <span>${p.author.name}</span>
        <span class="blog-feed-dot">${formatDate(p.date)}</span>
        <span>${p.readTime} read</span>
      </div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  ${THEME_INIT}
  <title>SnapSaver Blogs | Snapchat Guides, Privacy Tips & Downloader Tutorials</title>
  <meta name="description" content="Expert guides on Snapchat privacy, story downloading, SnapSaver tutorials, Spotlight tips, and mobile how-tos. Free SEO-friendly Snapchat resources.">
  <meta name="keywords" content="snapchat blogs, snapchat guides, snapchat privacy, snapchat downloader tutorial, snapsaver blogs">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${SITE}/blogs/">
  <meta property="og:image" content="${SITE}/blogs/images/blog-index-hero.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SITE}/blogs/images/blog-index-hero.png">
  <link rel="icon" href="/images/logo-light.png" type="image/png">
  <link rel="stylesheet" href="/css/style.css?v=${STYLE_VER}">
  <link rel="stylesheet" href="/css/blog.css?v=${BLOG_CSS_VER}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "SnapSaver Blogs",
    "description": "Snapchat guides, privacy tips, and downloader tutorials",
    "url": "${SITE}/blogs/",
    "publisher": { "@type": "Organization", "name": "SnapSaver", "url": "${SITE}" }
  }
  </script>
</head>
<body>
${navLinks()}

<main class="blog-page">
  <div class="container">
    <header class="blog-index-header">
      <h1>SnapSaver <span class="gradient-text">Blogs</span></h1>
      <p>Guides on Snapchat privacy, downloading, and creator tools, written by people who actually use the product.</p>
    </header>
    ${featuredBlock}
    <div class="blog-feed">
      ${feedItems}
    </div>
  </div>
</main>

${footer()}
<script src="/js/theme.js?v=${THEME_JS_VER}"></script>
<script src="/js/nav.js?v=${NAV_JS_VER}"></script>
</body>
</html>`;
}

// Generate files
fs.mkdirSync(BLOG_DIR, { recursive: true });
fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexPage());
posts.forEach(p => {
  fs.writeFileSync(path.join(BLOG_DIR, `${p.slug}.html`), articlePage(p));
  console.log('Created:', p.slug);
});
console.log('Done —', posts.length, 'blog posts generated.');
