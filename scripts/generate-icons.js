const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// ── Color palette ──
const COLORS = {
  bg: "#F5F0EB",
  primary: "#C4A882",
  primaryDark: "#A8896A",
  primaryLight: "#D4BFA0",
  accent: "#B8977A",
};

/**
 * Build an SVG string for the app icon.
 *
 * Design: A rounded-square background in warm cream (#F5F0EB) with a
 * minimalist wallet shape in Morandi gold (#C4A882). The wallet is a
 * simple geometric form — a rounded rectangle body with a flap on top
 * and a small coin circle peeking out.
 *
 * @param {number} size        – canvas width & height in px
 * @param {boolean} transparent – true for adaptive-icon (no background)
 */
function buildIconSVG(size, { transparent = false } = {}) {
  const s = size; // shorthand
  const cx = s / 2; // center x
  const cy = s / 2; // center y

  // Scale all measurements relative to canvas size
  const unit = s / 1024;

  // ── Background ──
  const bgRadius = 220 * unit;
  const bg = transparent
    ? ""
    : `<rect width="${s}" height="${s}" rx="${bgRadius}" ry="${bgRadius}" fill="${COLORS.bg}"/>`;

  // ── Wallet body ──
  // Main wallet rectangle — centered, slightly taller than wide
  const walletW = 420 * unit;
  const walletH = 340 * unit;
  const walletX = cx - walletW / 2;
  const walletY = cy - walletH / 2 + 40 * unit; // nudge down a bit to leave room for coin
  const walletR = 36 * unit; // corner radius

  // ── Wallet flap (top fold) ──
  // A slightly wider shape on top that gives the "folded wallet" look
  const flapW = 440 * unit;
  const flapH = 100 * unit;
  const flapX = cx - flapW / 2;
  const flapY = walletY - 8 * unit;
  const flapR = 32 * unit;

  // ── Wallet card slot line ──
  // A subtle horizontal line inside the wallet body
  const slotY = walletY + walletH * 0.45;
  const slotX1 = walletX + 50 * unit;
  const slotX2 = walletX + walletW - 50 * unit;

  // ── Wallet clasp / button ──
  const claspCx = cx;
  const claspCy = flapY + flapH - 10 * unit;
  const claspR = 18 * unit;

  // ── Coin peeking from top-right ──
  const coinR = 62 * unit;
  const coinCx = cx + walletW / 2 - 30 * unit;
  const coinCy = flapY - coinR * 0.35;

  // ── Coin inner detail (yen symbol hint — just a smaller circle) ──
  const coinInnerR = 42 * unit;

  // ── Shadow under wallet (subtle depth) ──
  const shadowOffsetY = 12 * unit;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <!-- Subtle shadow filter -->
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="${4 * unit}" stdDeviation="${12 * unit}" flood-color="#000" flood-opacity="0.08"/>
    </filter>
    <!-- Coin gradient for a bit of dimension -->
    <radialGradient id="coinGrad" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${COLORS.primaryLight}"/>
      <stop offset="100%" stop-color="${COLORS.primary}"/>
    </radialGradient>
    <!-- Wallet gradient — top slightly lighter -->
    <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.primaryLight}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${COLORS.primary}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  ${bg}

  <!-- Wallet shadow -->
  <rect x="${walletX + 6 * unit}" y="${walletY + shadowOffsetY}" width="${walletW}" height="${walletH}"
        rx="${walletR}" ry="${walletR}" fill="#000" opacity="0.06"
        ${transparent ? "" : ""}/>

  <!-- Wallet body -->
  <rect x="${walletX}" y="${walletY}" width="${walletW}" height="${walletH}"
        rx="${walletR}" ry="${walletR}" fill="${COLORS.primary}"/>

  <!-- Wallet flap -->
  <rect x="${flapX}" y="${flapY}" width="${flapW}" height="${flapH}"
        rx="${flapR}" ry="${flapR}" fill="${COLORS.primaryDark}"/>

  <!-- Flap bottom edge (overlap to blend flap with body) -->
  <rect x="${flapX}" y="${flapY + flapH - flapR}" width="${flapW}" height="${flapR}"
        fill="${COLORS.primaryDark}"/>

  <!-- Card slot line -->
  <line x1="${slotX1}" y1="${slotY}" x2="${slotX2}" y2="${slotY}"
        stroke="${COLORS.primaryLight}" stroke-width="${3 * unit}" stroke-linecap="round" opacity="0.6"/>

  <!-- Second card slot line -->
  <line x1="${slotX1}" y1="${slotY + 40 * unit}" x2="${slotX2 - 60 * unit}" y2="${slotY + 40 * unit}"
        stroke="${COLORS.primaryLight}" stroke-width="${3 * unit}" stroke-linecap="round" opacity="0.4"/>

  <!-- Clasp / button on flap -->
  <circle cx="${claspCx}" cy="${claspCy}" r="${claspR}" fill="${COLORS.bg}" opacity="0.85"/>
  <circle cx="${claspCx}" cy="${claspCy}" r="${claspR * 0.55}" fill="${COLORS.primaryDark}" opacity="0.4"/>

  <!-- Coin -->
  <circle cx="${coinCx}" cy="${coinCy}" r="${coinR}" fill="url(#coinGrad)" filter="url(#shadow)"/>
  <circle cx="${coinCx}" cy="${coinCy}" r="${coinInnerR}" fill="none"
          stroke="${COLORS.primaryDark}" stroke-width="${2.5 * unit}" opacity="0.45"/>

  <!-- Yen symbol on coin — simple strokes -->
  <text x="${coinCx}" y="${coinCy + 16 * unit}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="600"
        font-size="${50 * unit}px" fill="${COLORS.primaryDark}" opacity="0.55">&#xa5;</text>
</svg>`;

  return svg.trim();
}

async function generateIcon(svgString, outputPath, size) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await sharp(Buffer.from(svgString))
    .resize(size, size)
    .png()
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`  -> ${outputPath}  (${size}x${size}, ${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  const assetsDir = path.join(__dirname, "..", "assets");

  console.log("Generating app icons for 极简账单 (Minimalist Ledger)...\n");

  // 1. Main app icon — 1024x1024, with background
  console.log("[1/3] icon.png (1024x1024, with background)");
  const iconSVG = buildIconSVG(1024, { transparent: false });
  await generateIcon(iconSVG, path.join(assetsDir, "icon.png"), 1024);

  // 2. Adaptive icon — 1024x1024, transparent background (Android foreground layer)
  console.log("[2/3] adaptive-icon.png (1024x1024, transparent bg)");
  const adaptiveSVG = buildIconSVG(1024, { transparent: true });
  await generateIcon(adaptiveSVG, path.join(assetsDir, "adaptive-icon.png"), 1024);

  // 3. Splash icon — 200x200, with background
  console.log("[3/3] splash-icon.png (200x200, with background)");
  const splashSVG = buildIconSVG(200, { transparent: false });
  await generateIcon(splashSVG, path.join(assetsDir, "splash-icon.png"), 200);

  console.log("\nAll icons generated successfully.");
}

main().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
