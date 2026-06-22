(function () {
  // Set to false (or comment out the 3 script tags in _index.html) to revert
  // to the dot-grid background.
  const AMBIENT_BG_ENABLED = true;
  if (!AMBIENT_BG_ENABLED) return;

  // ── Weather → palette map ────────────────────────────────────────────────────
  // WMO weather interpretation codes: https://open-meteo.com/en/docs
  // HALO params: backgroundColor (scene bg), baseColor (halo glow color)
  const PALETTES = {
    sunny: {
      backgroundColor: 0x12080a,
      baseColor:       0x7a3800,
    },
    partly_cloudy: {
      backgroundColor: 0x080d1a,
      baseColor:       0x0a1a4a,
    },
    cloudy: {
      backgroundColor: 0x08090f,
      baseColor:       0x0a1020,
    },
    foggy: {
      backgroundColor: 0x0e0c0a,
      baseColor:       0x1a1610,
    },
    rainy: {
      backgroundColor: 0x05080f,
      baseColor:       0x00102a,
    },
    stormy: {
      backgroundColor: 0x060408,
      baseColor:       0x0f0820,
    },
    snowy: {
      backgroundColor: 0x070a12,
      baseColor:       0x0a1830,
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

  function initVanta(palette) {
    if (typeof VANTA === 'undefined' || !VANTA.HALO) return;
    document.body.classList.add('vanta-bg');
    VANTA.HALO({
      el: '#vantaBg',
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200,
      minWidth: 200,
      size: 1.5,
      ...palette,
    });
  }

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
