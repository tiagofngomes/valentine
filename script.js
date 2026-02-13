const LOVE_START = new Date("2019-02-14T00:00:00");

const timerEl = document.getElementById("timer");
const sinceEl = document.getElementById("since");
const finalNoteEl = document.querySelector(".final-note");
const heartEl = document.getElementById("heart-source");
const canvas = document.getElementById("petal-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const audioEl = document.getElementById("bg-music");

const staticColors = ["#d70f3f", "#ff3e72", "#ff6c95", "#f77ca8", "#ff9cbc", "#e42453"];
const fallingColors = ["#e30b45", "#fb3f77", "#ff6b95", "#ff95b4", "#ffd0df"];

const staticPetals = [];
const fallingPetals = [];
const settledPetals = [];

const IS_MOBILE = window.matchMedia("(max-width: 820px)").matches;
const PREFERS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CPU_CORES = navigator.hardwareConcurrency || 4;
const DEVICE_MEMORY = navigator.deviceMemory || 4;
const LOW_END_DEVICE = CPU_CORES <= 6 || DEVICE_MEMORY <= 4;
const PERF = {
  maxDpr: IS_MOBILE ? 1.5 : 2,
  staticPetalCount: PREFERS_REDUCED_MOTION ? 220 : IS_MOBILE ? 430 : 700,
  maxFalling: PREFERS_REDUCED_MOTION ? 24 : LOW_END_DEVICE ? 56 : IS_MOBILE ? 72 : 104,
  maxSettled: PREFERS_REDUCED_MOTION ? 1400 : LOW_END_DEVICE ? 3500 : IS_MOBILE ? 5500 : 12000,
  pileBinSize: IS_MOBILE ? 3 : 2,
  spawnBaseMs: PREFERS_REDUCED_MOTION ? 180 : LOW_END_DEVICE ? 125 : 85,
  spawnJitterMs: PREFERS_REDUCED_MOTION ? 90 : LOW_END_DEVICE ? 70 : 35
};
const MAX_PILE_RISE = 180;

let width = 0;
let height = 0;
let heartMask = { x: 0, y: 0, w: 0, h: 0 };
let groundY = 0;
let lastTs = 0;
let spawnClock = 0;
let pileBins = [];
let pileCeilingY = 0;
let animationFrameId = 0;
let timerIntervalId = 0;
let isPaused = false;

function updateTimer() {
  const now = new Date();
  const diff = Math.max(0, now - LOVE_START);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  timerEl.textContent = `${days} dias ${hours} horas ${minutes} minutos ${seconds} segundos`;
}

function updateSinceText() {
  const formatter = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  sinceEl.textContent = `Volt\u00e1mos a encontrar-nos a ${formatter.format(LOVE_START)}, desde ent\u00e3o estamos juntos \u00e0:`;
}

function tryPlayAudio() {
  if (!audioEl) {
    return;
  }
  audioEl.volume = 0.7;
  audioEl.play().catch(() => {});
}

function initAudio() {
  if (!audioEl) {
    return;
  }

  const unlockAudio = () => {
    tryPlayAudio();
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };

  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  tryPlayAudio();
}

function sampleHeartPoint() {
  const t = Math.random() * Math.PI * 2;
  const edgeX = 16 * Math.sin(t) ** 3;
  const edgeY = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

  const scale = Math.pow(Math.random(), 0.58);
  const x = edgeX * scale + (Math.random() - 0.5) * 0.7;
  const y = edgeY * scale + (Math.random() - 0.5) * 0.7;

  const nx = 0.04 + ((x + 16) / 32) * 0.92;
  const ny = 0.02 + ((13 - y) / 30) * 0.94;

  return {
    x: Math.max(0.02, Math.min(0.98, nx)),
    y: Math.max(0.02, Math.min(0.98, ny))
  };
}

function drawHeart(ctx2d, size, color) {
  ctx2d.fillStyle = color;
  ctx2d.beginPath();
  ctx2d.moveTo(0, size * -0.22);
  ctx2d.bezierCurveTo(size * 0.9, size * -1.1, size * 2.0, size * -0.08, 0, size * 1.45);
  ctx2d.bezierCurveTo(size * -2.0, size * -0.08, size * -0.9, size * -1.1, 0, size * -0.22);
  ctx2d.fill();
}

function seedStaticHeart() {
  staticPetals.length = 0;
  for (let i = 0; i < PERF.staticPetalCount; i += 1) {
    const p = sampleHeartPoint();
    staticPetals.push({
      x: p.x,
      y: p.y,
      r: 3 + Math.random() * 6,
      c: staticColors[(Math.random() * staticColors.length) | 0],
      a: 0.72 + Math.random() * 0.28,
      rot: Math.random() * Math.PI * 2
    });
  }
}

function renderStaticHeart() {
  heartEl.innerHTML = "";
  const w = heartMask.w;
  const h = heartMask.h;

  for (const p of staticPetals) {
    const el = document.createElement("span");
    el.className = "static-petal";
    el.style.left = `${p.x * w}px`;
    el.style.top = `${p.y * h}px`;
    el.style.width = `${p.r}px`;
    el.style.height = `${p.r}px`;
    el.style.opacity = `${p.a}`;
    el.style.setProperty("--petal", p.c);
    el.style.setProperty("--rot", `${Math.round((p.rot * 180) / Math.PI)}deg`);
    heartEl.appendChild(el);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, PERF.maxDpr);

  width = rect.width;
  height = rect.height;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const heartRect = heartEl.getBoundingClientRect();
  heartMask = {
    x: heartRect.left - rect.left,
    y: heartRect.top - rect.top,
    w: heartRect.width,
    h: heartRect.height
  };

  groundY = height - 10;
  pileCeilingY = groundY - MAX_PILE_RISE;
  pileBins = new Array(Math.max(2, Math.ceil(width / PERF.pileBinSize))).fill(groundY);
  settledPetals.length = 0;
  fallingPetals.length = 0;
  seedStaticHeart();
  renderStaticHeart();
  updateFinalNotePosition();
}

function spawnFallingPetal() {
  const p = sampleHeartPoint();
  fallingPetals.push({
    x: heartMask.x + p.x * heartMask.w,
    y: heartMask.y + p.y * heartMask.h,
    size: 4 + Math.random() * 6,
    vx: -0.05 + Math.random() * 0.1,
    vy: 0.19 + Math.random() * 0.28,
    swayAmp: 5 + Math.random() * 13,
    swayFreq: 0.0016 + Math.random() * 0.0028,
    spin: -0.014 + Math.random() * 0.028,
    rot: Math.random() * Math.PI * 2,
    color: fallingColors[(Math.random() * fallingColors.length) | 0],
    alpha: 0.62 + Math.random() * 0.28,
    bornAt: lastTs
  });
}

function getPileSurfaceY(x) {
  if (!pileBins.length) {
    return groundY;
  }

  const fx = Math.max(0, Math.min(pileBins.length - 1, x / PERF.pileBinSize));
  const i0 = Math.floor(fx);
  const i1 = Math.min(pileBins.length - 1, i0 + 1);
  const t = fx - i0;
  return pileBins[i0] * (1 - t) + pileBins[i1] * t;
}

function settlePetal(p, drift) {
  const edgePadding = 12;
  const usableWidth = Math.max(1, width - edgePadding * 2);
  const centerBias = (Math.random() + Math.random()) * 0.5;
  const fullRangeBias = Math.random();
  const blend = centerBias * 0.65 + fullRangeBias * 0.35;
  const targetX = Math.max(
    edgePadding,
    Math.min(width - edgePadding, edgePadding + blend * usableWidth + drift * 0.12)
  );
  const petalsPerLanding = 1;

  for (let i = 0; i < petalsPerLanding; i += 1) {
    const targetIdx = Math.max(0, Math.min(pileBins.length - 1, Math.round(targetX / PERF.pileBinSize)));
    const radius = 9;
    const baseLift = 0.7 + Math.random() * 0.24;

    for (let j = targetIdx - radius; j <= targetIdx + radius; j += 1) {
      if (j < 0 || j >= pileBins.length) {
        continue;
      }
      const dist = Math.abs(j - targetIdx);
      const influence = Math.max(0, 1 - dist / (radius + 1));
      const lift = baseLift * influence * influence;
      pileBins[j] -= lift;
      if (pileBins[j] < pileCeilingY) {
        pileBins[j] = pileCeilingY;
      }
    }

    const px = Math.max(12, Math.min(width - 12, targetIdx * PERF.pileBinSize + (Math.random() - 0.5) * 2.4));
    const py = getPileSurfaceY(px) - Math.random() * 0.2;

    settledPetals.push({
      x: px,
      y: py,
      size: p.size * (0.74 + Math.random() * 0.32),
      rot: p.rot + (Math.random() - 0.5) * 0.4,
      color: p.color,
      alpha: 0.96 + Math.random() * 0.04
    });
  }

  while (settledPetals.length > PERF.maxSettled) {
    settledPetals.shift();
  }
}

function smoothPileBins() {
  if (pileBins.length < 3) {
    return;
  }
  const next = pileBins.slice();
  for (let i = 1; i < pileBins.length - 1; i += 1) {
    const neighbors = (pileBins[i - 1] + pileBins[i + 1]) * 0.5;
    const y = pileBins[i] * 0.975 + neighbors * 0.025;
    next[i] = Math.max(pileCeilingY, Math.min(groundY, y));
  }
  pileBins = next;
}

function getVisualPileTop() {
  if (!pileBins.length) {
    return groundY;
  }
  let minY = groundY;
  const start = Math.floor(pileBins.length * 0.08);
  const end = Math.ceil(pileBins.length * 0.92);
  for (let i = start; i <= end; i += 1) {
    const y = pileBins[i];
    if (y < minY) {
      minY = y;
    }
  }
  return minY;
}

function updateFinalNotePosition() {
  if (!finalNoteEl) {
    return;
  }
  const distanceFromGround = 80;
  const floorOffset = Math.max(0, height - groundY);
  const bottom = floorOffset + distanceFromGround;
  finalNoteEl.style.top = "auto";
  finalNoteEl.style.bottom = `${bottom}px`;
  const noteHeight = finalNoteEl.offsetHeight || 24;
  const noteBaseY = finalNoteEl.offsetTop + noteHeight;
  pileCeilingY = Math.max(groundY - MAX_PILE_RISE, noteBaseY + 2);
}

function drawSettledPetals() {
  for (const p of settledPetals) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    drawHeart(ctx, p.size * 0.48, p.color);
    ctx.restore();
  }
}

function animate(ts) {
  if (isPaused) {
    return;
  }

  const dt = Math.min(34, ts - (lastTs || ts));
  lastTs = ts;
  spawnClock += dt;

  const wind = Math.sin(ts * 0.00034) * 0.07 + Math.cos(ts * 0.00016) * 0.04;
  smoothPileBins();

  while (spawnClock >= PERF.spawnBaseMs && fallingPetals.length < PERF.maxFalling) {
    spawnFallingPetal();
    spawnClock -= PERF.spawnBaseMs + Math.random() * PERF.spawnJitterMs;
  }

  ctx.clearRect(0, 0, width, height);

  drawSettledPetals();

  for (let i = fallingPetals.length - 1; i >= 0; i -= 1) {
    const p = fallingPetals[i];
    const age = ts - p.bornAt;
    const drift = Math.sin(age * p.swayFreq) * p.swayAmp;

    p.x += p.vx + wind * 0.28;
    p.y += p.vy;
    p.rot += p.spin;

    const landY = getPileSurfaceY(p.x + drift);
    if (p.y >= landY) {
      settlePetal(p, drift);
      fallingPetals.splice(i, 1);
      continue;
    }

    if (p.y > height + 20 || p.x < -40 || p.x > width + 40) {
      fallingPetals.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.translate(p.x + drift, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    drawHeart(ctx, p.size * 0.42, p.color);
    ctx.restore();
  }

  updateFinalNotePosition();
  animationFrameId = requestAnimationFrame(animate);
}

if (!timerEl || !sinceEl || !finalNoteEl || !heartEl || !canvas || !ctx) {
  console.warn("Elementos obrigatorios nao encontrados. Verifique o HTML.");
} else {
  updateTimer();
  updateSinceText();
  timerIntervalId = window.setInterval(updateTimer, 1000);
  initAudio();

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    isPaused = document.hidden;
    if (isPaused) {
      cancelAnimationFrame(animationFrameId);
      return;
    }
    lastTs = 0;
    animationFrameId = requestAnimationFrame(animate);
  });
  window.addEventListener("beforeunload", () => {
    clearInterval(timerIntervalId);
    cancelAnimationFrame(animationFrameId);
  });
  window.addEventListener("load", () => {
    resize();
    if (!PREFERS_REDUCED_MOTION) {
      animationFrameId = requestAnimationFrame(animate);
    }
  });
}
