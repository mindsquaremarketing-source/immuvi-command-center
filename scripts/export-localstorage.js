// Paste this ENTIRE block into the browser console while the dashboard is open
// at http://localhost:8098/immuvi-command-center.html
//
// It will:
//   1. Collect all immuvi_* keys from localStorage
//   2. Download them as a JSON file named immuvi_localstorage_export.json
//
// Then send that file back for import into Supabase.

(function exportImmuviLocalStorage() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('immuvi')) {
      try { out[k] = JSON.parse(localStorage.getItem(k)); }
      catch { out[k] = localStorage.getItem(k); }
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'immuvi_localstorage_export.json';
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`Exported ${Object.keys(out).length} immuvi_* keys to immuvi_localstorage_export.json`);
  console.log('Keys:', Object.keys(out));
})();
