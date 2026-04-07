const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

const BASE_PATH = process.env.BASE_PATH || '/air-ledger';

// Fix 1: add type="module" to script tags for import.meta support
html = html.replace(/<script src="(.*?)" defer><\/script>/g, '<script src="$1" type="module"></script>');

// Fix 2: rewrite absolute asset paths to include base path
if (BASE_PATH && BASE_PATH !== '/') {
  html = html.replace(/src="\/_expo\//g, `src="${BASE_PATH}/_expo/`);
  html = html.replace(/href="\/favicon/g, `href="${BASE_PATH}/favicon`);
  html = html.replace(/src="\/assets\//g, `src="${BASE_PATH}/assets/`);
  html = html.replace(/href="\/assets\//g, `href="${BASE_PATH}/assets/`);

  // Fix 3: use a script to rewrite history.pushState/replaceState so that
  // Expo Router thinks it's at root. This trick strips the base path from
  // the pathname seen by React, so the router matches routes correctly.
  const basePathScript = `
  <script>
    (function() {
      var basePath = ${JSON.stringify(BASE_PATH)};
      // Rewrite the URL so Expo Router sees the path without the base
      if (location.pathname.indexOf(basePath) === 0) {
        var newPath = location.pathname.slice(basePath.length) || '/';
        history.replaceState(null, '', newPath + location.search + location.hash);
      }
      // Patch pushState/replaceState so navigation stays within base path
      var origPush = history.pushState;
      var origReplace = history.replaceState;
      history.pushState = function(state, title, url) {
        if (typeof url === 'string' && url.indexOf(basePath) !== 0 && url.indexOf('http') !== 0) {
          url = basePath + (url.startsWith('/') ? url : '/' + url);
        }
        return origPush.call(this, state, title, url);
      };
      history.replaceState = function(state, title, url) {
        if (typeof url === 'string' && url.indexOf(basePath) !== 0 && url.indexOf('http') !== 0) {
          url = basePath + (url.startsWith('/') ? url : '/' + url);
        }
        return origReplace.call(this, state, title, url);
      };
    })();
  </script>
  `;
  html = html.replace('</head>', basePathScript + '</head>');
}

// Copy _redirects for Netlify SPA routing
const redirectsSrc = path.join(__dirname, '..', 'public', '_redirects');
const redirectsDst = path.join(distDir, '_redirects');
if (fs.existsSync(redirectsSrc)) {
  fs.copyFileSync(redirectsSrc, redirectsDst);
}

fs.writeFileSync(indexPath, html);

// Fix 4: rewrite asset paths inside JS bundles (fonts, images loaded at runtime)
if (BASE_PATH && BASE_PATH !== '/') {
  function rewriteBundle(file) {
    let content = fs.readFileSync(file, 'utf-8');
    // Rewrite "/assets/..." paths inside strings to include base path
    content = content.replace(/"\/assets\//g, `"${BASE_PATH}/assets/`);
    content = content.replace(/'\/assets\//g, `'${BASE_PATH}/assets/`);
    fs.writeFileSync(file, content);
  }
  const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir)) {
      if (f.endsWith('.js')) rewriteBundle(path.join(jsDir, f));
    }
  }
}

// Fix 5: 404.html fallback for GitHub Pages SPA routing
fs.copyFileSync(indexPath, path.join(distDir, '404.html'));

// Fix 6: .nojekyll prevents GitHub Pages from ignoring _expo/ folder
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

console.log('✅ Fixed index.html + JS bundles (module, base path rewrite, fonts, SPA fallback, .nojekyll)');
