// popup.js — optimized for minimal page impact
(() => {
  const STORAGE_PREFIX = 'popup_seen_';
  const POPUP_ID = 'popupOverlay';
  const CLOSE_ID = 'popupClose';
  const TEMPLATE_ID = 'popupTemplate';

  const onReady = (fn) => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
  };

  const scheduleIdle = (fn) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(fn, { timeout: 2500 });
    } else {
      setTimeout(fn, 0);
    }
  };

  const currentPage = () => {
  const path = location.pathname.split('/').pop() || 'index.html';
  const params = new URLSearchParams(location.search);

  const id = params.get('id');

  return id ? `${path}?id=${id}` : path;
};
  const matchesPage = (rule, page) => {
  if (!rule) return true;

  const rules = Array.isArray(rule) ? rule : [rule];

  return rules.some((r) => {
    if (r === 'all') return true;

    // Exact URL match
    if (r === page) return true;

    // Base page match:
    // "test-series.html" matches
    // "test-series.html?id=249"
    // "test-series.html?id=300"
    if (!r.includes('?')) {
      return page.split('?')[0] === r;
    }

    return false;
  });
};

  const findAnnouncement = (json) => {
    if (!json || !json.active || !Array.isArray(json.announcements)) return null;

    const page = currentPage();
    return json.announcements.find((a) => {
      if (!a || !a.show) return false;
      if (!matchesPage(a.page, page)) return false;
      if (a.rules?.showOnce && localStorage.getItem(STORAGE_PREFIX + a.id)) return false;
      return true;
    }) || null;
  };

  const escapeHTML = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const buildPopup = (data) => {
    if (document.getElementById(POPUP_ID)) return;

    const wrapper = document.createElement('div');
    wrapper.id = POPUP_ID;
    wrapper.className = 'popup-overlay';
    wrapper.setAttribute('aria-hidden', 'true');

    const newTabAttrs = data.button?.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';

const imageHtml = data.image
  ? `<div class="popup-logo-wrap">
       <img class="popup-logo" src="${escapeHTML(data.image)}" alt="" width="96" height="96" decoding="async" fetchpriority="low">
     </div>`
  : '';

const titleHtml = data.title ? `<h2 id="popupTitle">${escapeHTML(data.title)}</h2>` : '';
const messageHtml = data.message
  ? `<p id="popupDesc" class="popup-sub">${escapeHTML(data.message).replace(/\n/g, '<br>')}</p>`
  : '';

const highlightHtml = data.highlight
  ? `<div class="popup-highlight">${escapeHTML(data.highlight).replace(/\n/g, '<br>')}</div>`
  : '';

const buttonHtml = (data.button && data.button.text && data.button.link)
  ? `<div class="popup-actions">
       <a class="popup-btn popup-btn-primary" href="${escapeHTML(data.button.link)}"${newTabAttrs}>
         ${escapeHTML(data.button.text)}
       </a>
     </div>`
  : '';

wrapper.innerHTML = `
  <div class="popup" role="dialog" aria-modal="true" aria-labelledby="popupTitle" aria-describedby="popupDesc">
    
    <div class="popup-top">
      <div class="popup-badge"><span class="popup-dot"></span> Announcement</div>
      <button class="popup-close" id="${CLOSE_ID}" type="button" aria-label="Close popup">✕</button>
    </div>

    <div class="popup-content">
      ${imageHtml}
      ${titleHtml}
      ${messageHtml}
      ${highlightHtml}
    </div>

    ${buttonHtml}

  </div>
`;

    document.body.appendChild(wrapper);

    const closeBtn = wrapper.querySelector(`#${CLOSE_ID}`);
    const popup = wrapper.querySelector('.popup');

    const markSeen = () => {
      if (data.rules?.showOnce) {
        try { localStorage.setItem(STORAGE_PREFIX + data.id, 'seen'); } catch (_) {}
      }
    };

    const removePopup = () => {
      wrapper.classList.remove('is-open');
      wrapper.classList.add('is-closing');
      window.setTimeout(() => {
        wrapper.remove();
        document.removeEventListener('keydown', onKeyDown);
      }, 220);
      markSeen();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') removePopup();
    };

    closeBtn.addEventListener('click', removePopup, { passive: true });
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) removePopup();
    }, { passive: true });
    document.addEventListener('keydown', onKeyDown);

    // Open on next frame; no forced reflow.
    requestAnimationFrame(() => {
      wrapper.classList.add('is-open');
      wrapper.setAttribute('aria-hidden', 'false');
      if (popup) popup.focus?.();
    });
  };

  const preloadAnnouncement = (data) => {
    if (!data?.image) return;
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = data.image;
  };

  onReady(() => {
    if (document.getElementById(POPUP_ID)) return;

    scheduleIdle(async () => {
      try {
        const res = await fetch('/announcement.json', { cache: 'no-store' });
        if (!res.ok) return;

        const json = await res.json();
        const data = findAnnouncement(json);
        if (!data) return;

        preloadAnnouncement(data);

        const delay = Number(data.timing?.delay || 0);
        window.setTimeout(() => buildPopup(data), Math.max(0, delay));
      } catch (e) {
        console.log('Popup error:', e);
      }
    });
  });
})();
