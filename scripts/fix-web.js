const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

// Fix: add type="module" to script tags for import.meta support
html = html.replace(/<script src="(.*?)" defer><\/script>/g, '<script src="$1" type="module"></script>');

// Copy _redirects for Netlify SPA routing
const redirectsSrc = path.join(__dirname, '..', 'public', '_redirects');
const redirectsDst = path.join(__dirname, '..', 'dist', '_redirects');
if (fs.existsSync(redirectsSrc)) {
  fs.copyFileSync(redirectsSrc, redirectsDst);
}

fs.writeFileSync(indexPath, html);
console.log('✅ Fixed index.html (type="module") and copied _redirects');
