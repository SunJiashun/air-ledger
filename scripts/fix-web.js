const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

// Fix 1: add type="module" to script tags for import.meta support
html = html.replace(/<script src="(.*?)" defer><\/script>/g, '<script src="$1" type="module"></script>');

// Fix 2: GitHub Pages subpath support
// GitHub Pages deploys under /air-ledger/, so absolute paths like /_expo/... become 404
// Rewrite all absolute paths to be relative to the page
const BASE_PATH = process.env.BASE_PATH || '/air-ledger';
if (BASE_PATH && BASE_PATH !== '/') {
  html = html.replace(/src="\/_expo\//g, `src="${BASE_PATH}/_expo/`);
  html = html.replace(/href="\/favicon/g, `href="${BASE_PATH}/favicon`);
  html = html.replace(/src="\/assets\//g, `src="${BASE_PATH}/assets/`);
  html = html.replace(/href="\/assets\//g, `href="${BASE_PATH}/assets/`);
}

// Copy _redirects for Netlify SPA routing
const redirectsSrc = path.join(__dirname, '..', 'public', '_redirects');
const redirectsDst = path.join(distDir, '_redirects');
if (fs.existsSync(redirectsSrc)) {
  fs.copyFileSync(redirectsSrc, redirectsDst);
}

fs.writeFileSync(indexPath, html);

// Fix 3: GitHub Pages SPA routing via 404.html fallback
// GitHub Pages serves 404.html for any unmatched route. If it's identical to index.html,
// the SPA router will handle the route client-side.
fs.copyFileSync(indexPath, path.join(distDir, '404.html'));

// Fix 4: Disable Jekyll (prevents _expo/ folder from being ignored by GitHub Pages)
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

console.log('✅ Fixed index.html (module, GitHub Pages base path, SPA fallback, .nojekyll)');
