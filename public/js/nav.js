/**
 * Shared navbar behavior for blog and legal pages.
 */
document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const mobileBtn = document.getElementById('nav-mobile-btn');
  const navLinks = document.getElementById('nav-links');

  if (!navbar) return;

  // Pages without a hero should use the solid header immediately
  if (!document.getElementById('hero')) {
    navbar.classList.add('scrolled');
  }

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50 || !document.getElementById('hero'));
  });

  mobileBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    mobileBtn.textContent = navLinks?.classList.contains('open') ? '✕' : '☰';
  });

  navLinks?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      if (mobileBtn) mobileBtn.textContent = '☰';
    });
  });
});
