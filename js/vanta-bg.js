(function () {
  // Set to false (or comment out the 3 script tags in _index.html) to revert
  // to the dot-grid background.
  const VANTA_BG_ENABLED = true;
  if (!VANTA_BG_ENABLED) return;

  // ── Weather → palette map ────────────────────────────────────────────────────
  // WMO weather interpretation codes: https://open-meteo.com/en/docs
  // DOTS params: backgroundColor, color (primary dots), color2 (secondary dots)
  const PALETTES = {
    sunny: {
      backgroundColor: 0xfff0e8,
      color:           0xf0a080,
      color2:          0xa8d4f0,
    },
    partly_cloudy: {
      backgroundColor: 0xf0f4fc,
      color:           0xa8c4f0,
      color2:          0xe0d0f8,
    },
    cloudy: {
      backgroundColor: 0xeeeef4,
      color:           0xb4b8cc,
      color2:          0x8c94a8,
    },
    foggy: {
      backgroundColor: 0xf2ede8,
      color:           0xc4bcb4,
      color2:          0x9c9488,
    },
    rainy: {
      backgroundColor: 0xe8eef8,
      color:           0x6c90c0,
      color2:          0x3c5880,
    },
    stormy: {
      backgroundColor: 0xdedaea,
      color:           0x6c58a8,
      color2:          0x2e1e60,
    },
    snowy: {
      backgroundColor: 0xf6f8ff,
      color:           0x90b4f0,
      color2:          0xb8d0f8,
    },
  };

  function codeToCondition(code) {
    if (code === 0)                   return 'sunny';
    if (code <= 2)                    return 'partly_cloudy';
    if (code === 3)                   return 'cloudy';
    if (code === 45 || code === 48)   return 'foggy';
    if (code >= 51 && code <= 67)     return 'rainy';
    if (code >= 71 && code <= 77)     return 'snowy';
    if (code >= 80 && code <= 82)     return 'rainy';
    if (code === 85 || code === 86)   return 'snowy';
    if (code >= 95)                   return 'stormy';
    return 'partly_cloudy';
  }

  // ── Vanta init ───────────────────────────────────────────────────────────────
  function initVanta(palette) {
    if (typeof VANTA === 'undefined' || !VANTA.DOTS) return;
    document.body.classList.add('vanta-bg');
    VANTA.DOTS({
      el: '#vantaBg',
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200,
      minWidth: 200,
      scale: 1.00,
      scaleMobile: 1.00,
      showLines: false,
      ...palette,
    });
  }

  // ── Weather fetch ─────────────────────────────────────────────────────────────
  async function fetchCondition() {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=33.749&longitude=-84.388' +
        '&current=weather_code&timezone=America%2FNew_York'
      );
      const data = await res.json();
      return codeToCondition(data.current.weather_code);
    } catch {
      return 'partly_cloudy';
    }
  }

  async function init() {
    const condition = await fetchCondition();
    initVanta(PALETTES[condition]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
