import './style.css';

// Закріплену кнопку ховаємо, коли видно кнопку першого екрана або розділ «Як допомогти»:
// там кнопка чи пояснення вже є, дублювати не треба.
const sticky = document.querySelector('.sticky-cta');
const watched = [document.getElementById('hero-cta'), document.getElementById('help')].filter(Boolean);

if (sticky && 'IntersectionObserver' in window) {
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    sticky.hidden = visible.size > 0;
  });
  watched.forEach((el) => observer.observe(el));
}

// «Поділитися посиланням»: системне меню на телефоні, інакше копіювання в буфер.
const shareBtn = document.querySelector('[data-share]');
const pageUrl = document.querySelector('link[rel="canonical"]')?.href || location.href.split('#')[0];

if (shareBtn && navigator.share) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', () => {
    navigator.share({ title: document.title, url: pageUrl }).catch(() => {});
  });
} else if (shareBtn && navigator.clipboard) {
  shareBtn.hidden = false;
  shareBtn.textContent = 'Скопіювати посилання';
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      shareBtn.textContent = 'Посилання скопійовано';
    } catch {
      shareBtn.textContent = pageUrl;
    }
  });
}
