(() => {
  const stops = [
    { value: "1.4", height: 14, label: "very narrow" },
    { value: "2", height: 20, label: "narrow" },
    { value: "2.8", height: 28, label: "compact" },
    { value: "4", height: 38, label: "medium" },
    { value: "5.6", height: 48, label: "open" },
    { value: "8", height: 58, label: "wide" },
    { value: "11", height: 68, label: "very wide" },
    { value: "16", height: 80, label: "maximum" }
  ];

  const dial = document.querySelector("#apertureDial");
  const value = dial.querySelector(".dial-value");
  const focusLayer = document.querySelector(".focus-layer");
  const focusGrip = document.querySelector("#focusGrip");
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dragStep = 24;

  let currentIndex = 3;
  let focusCenter = window.innerHeight * 0.4;
  let startIndex = currentIndex;
  let startY = 0;
  let dragging = false;
  let positioning = false;
  let positionStartY = 0;
  let positionStartCenter = focusCenter;
  let audioContext;
  let settleTimer;

  function playClick(direction) {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(direction > 0 ? 780 : 620, now);
    oscillator.frequency.exponentialRampToValueAtTime(direction > 0 ? 560 : 460, now + 0.025);
    gain.gain.setValueAtTime(0.028, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.04);
  }

  function clickFeedback(direction) {
    playClick(direction);
    if (navigator.vibrate) navigator.vibrate(7);

    dial.classList.remove("is-clicking");
    void dial.offsetWidth;
    dial.classList.add("is-clicking");
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => dial.classList.remove("is-clicking"), 190);
  }

  function setAperture(nextIndex, withFeedback = true) {
    const clampedIndex = Math.max(0, Math.min(stops.length - 1, nextIndex));
    if (clampedIndex === currentIndex) return;

    const direction = clampedIndex > currentIndex ? 1 : -1;
    currentIndex = clampedIndex;
    const stop = stops[currentIndex];

    root.style.setProperty("--focus-height", `${stop.height}vh`);
    root.style.setProperty("--dial-rotation", `${-62 + currentIndex * 18}deg`);
    setFocusCenter(focusCenter, false);
    value.textContent = stop.value;
    dial.setAttribute("aria-valuenow", String(currentIndex + 1));
    dial.setAttribute("aria-valuetext", `f/${stop.value}, ${stop.label} focus region`);
    document.body.classList.add("has-adjusted");

    if (withFeedback) clickFeedback(direction);
  }

  function enableAudio() {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioContext = new AudioContext();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function focusLimits() {
    const halfHeight = window.innerHeight * (stops[currentIndex].height / 100) / 2;
    return {
      min: halfHeight + 8,
      max: window.innerHeight - halfHeight - 8
    };
  }

  function setFocusCenter(nextCenter, userDriven = true) {
    const { min, max } = focusLimits();
    focusCenter = Math.max(min, Math.min(max, nextCenter));
    const percentage = Math.round((focusCenter / window.innerHeight) * 100);

    root.style.setProperty("--focus-center", `${focusCenter}px`);
    focusGrip.setAttribute("aria-valuenow", String(percentage));
    focusGrip.setAttribute("aria-valuetext", `Focus region at ${percentage}% of screen height`);

    if (userDriven) document.body.classList.add("has-adjusted");
  }

  dial.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    enableAudio();
    dragging = true;
    startY = event.clientY;
    startIndex = currentIndex;
    dial.setPointerCapture(event.pointerId);
  });

  dial.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const travelled = startY - event.clientY;
    setAperture(startIndex + Math.round(travelled / dragStep));
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
  }

  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);

  dial.addEventListener("keydown", (event) => {
    let nextIndex = currentIndex;

    if (event.key === "ArrowUp" || event.key === "ArrowRight") nextIndex += 1;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") nextIndex -= 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = stops.length - 1;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    enableAudio();
    setAperture(nextIndex);
  });

  focusGrip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    positioning = true;
    positionStartY = event.clientY;
    positionStartCenter = focusCenter;
    focusLayer.classList.add("is-positioning");
    focusGrip.classList.add("is-dragging");
    focusGrip.setPointerCapture(event.pointerId);
  });

  focusGrip.addEventListener("pointermove", (event) => {
    if (!positioning) return;
    setFocusCenter(positionStartCenter + event.clientY - positionStartY);
  });

  function endPositioning(event) {
    if (!positioning) return;
    positioning = false;
    focusLayer.classList.remove("is-positioning");
    focusGrip.classList.remove("is-dragging");
    if (focusGrip.hasPointerCapture(event.pointerId)) focusGrip.releasePointerCapture(event.pointerId);
  }

  focusGrip.addEventListener("pointerup", endPositioning);
  focusGrip.addEventListener("pointercancel", endPositioning);

  focusGrip.addEventListener("keydown", (event) => {
    let nextCenter = focusCenter;
    const { min, max } = focusLimits();

    if (event.key === "ArrowUp") nextCenter -= 16;
    if (event.key === "ArrowDown") nextCenter += 16;
    if (event.key === "PageUp") nextCenter -= 64;
    if (event.key === "PageDown") nextCenter += 64;
    if (event.key === "Home") nextCenter = min;
    if (event.key === "End") nextCenter = max;
    if (nextCenter === focusCenter) return;

    event.preventDefault();
    setFocusCenter(nextCenter);
  });

  window.addEventListener("resize", () => setFocusCenter(focusCenter, false));

  if (reducedMotion) {
    dial.classList.remove("is-clicking");
  }
})();
