/**
 * Light / night theme toggle. Default: light. Persists in localStorage.
 */
(function () {
  const STORAGE_KEY = 'snapsaver-theme';

  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function updateThemeImages(theme) {
    document.querySelectorAll('img[data-src-dark][data-src-light]').forEach((img) => {
      img.src = theme === 'dark' ? img.dataset.srcDark : img.dataset.srcLight;
    });
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
      const useAbsolute = favicon.getAttribute('href')?.startsWith('/');
      const prefix = useAbsolute ? '/images/' : 'images/';
      favicon.href = theme === 'dark' ? `${prefix}logo.png` : `${prefix}logo-light.png`;
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    updateThemeImages(theme);
  }

  function updateToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isDark = theme === 'dark';
    btn.classList.toggle('is-dark', isDark);
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to night mode');
    btn.setAttribute('title', isDark ? 'Light mode' : 'Night mode');
  }

  function setTheme(theme) {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    updateToggle(theme);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const theme = getTheme();
    applyTheme(theme);
    updateToggle(theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  });

  // Apply immediately when script loads (keeps theme in sync across pages)
  applyTheme(getTheme());
})();
