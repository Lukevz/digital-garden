/**
 * Home feed — clones launchpad artwork into the remaining home-feed section
 * headers (Case Studies, Experiments). Writing / Videos / Photos now live on
 * their own dedicated section pages, reached via the top-bar tabs.
 */
(function () {
  function cloneAppIcon(appName, target) {
    const src = document.querySelector(`.app[data-app="${appName}"] .app-icon svg`);
    if (!src || !target) return;
    const clone = src.cloneNode(true);
    const ids = [...clone.querySelectorAll('[id]')].map(el => el.id).filter(Boolean).sort((a, b) => b.length - a.length);
    const suffix = 'hf' + Date.now().toString(36);
    let html = new XMLSerializer().serializeToString(clone);
    ids.forEach(id => {
      const nid = id + suffix;
      html = html.split(`id="${id}"`).join(`id="${nid}"`);
      html = html.split(`url(#${id})`).join(`url(#${nid})`);
    });
    target.innerHTML = html;
  }

  function initIcons() {
    document.querySelectorAll('[data-clone-icon]').forEach(slot => {
      cloneAppIcon(slot.dataset.cloneIcon, slot);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIcons);
  } else {
    initIcons();
  }

  window.scrollToHomeSection = function (id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
