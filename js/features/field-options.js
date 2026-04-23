// ============================================================
//  FIELD OPTIONS MANAGER
// ============================================================

function openFieldOptionsManager() {
  var body = '<div id="fomContainer">' + renderFieldOptionsHTML() + '</div>';
  var foot = '<button class="btn-ghost btn-sm" onclick="closeModal()">Close</button>';
  openModal('Manage Field Options', body, foot);
}

function renderFieldOptionsHTML() {
  var fields = [
    { key: 'creativeStructure', label: 'Creative Structure', subtitle: 'The skeleton/format of the ad' },
    { key: 'hookType', label: 'Hook Type', subtitle: 'What the first 2\u20133 seconds do' },
    { key: 'productionStyle', label: 'Production Style', subtitle: 'How it was made' }
  ];
  var html = '';
  for (var fi = 0; fi < fields.length; fi++) {
    var f = fields[fi];
    html += '<div class="fom-section">';
    html += '<div class="fom-section-header"><span class="fom-section-title">' + esc(f.label) + '</span><span class="fom-section-sub">' + esc(f.subtitle) + '</span></div>';
    html += '<div class="fom-options-list" id="fom_list_' + f.key + '">';
    var opts = FIELD_OPTIONS[f.key];
    for (var oi = 0; oi < opts.length; oi++) {
      html += renderFieldOptionRow(f.key, oi, opts[oi]);
    }
    html += '</div>';
    html += '<div class="fom-add-row">' +
      '<input type="text" class="f-inp fom-add-name" id="fom_new_name_' + f.key + '" placeholder="Option name" style="flex:1">' +
      '<input type="text" class="f-inp fom-add-desc" id="fom_new_desc_' + f.key + '" placeholder="Description (optional)" style="flex:2">' +
      '<button class="btn-primary btn-xs" onclick="addFieldOption(\'' + f.key + '\')">+ Add</button>' +
    '</div>';
    html += '</div>';
  }
  return html;
}

function renderFieldOptionRow(fieldKey, idx, opt) {
  return '<div class="fom-option-row" id="fom_row_' + fieldKey + '_' + idx + '">' +
    '<span class="fom-drag-handle">\u2807</span>' +
    '<div class="fom-option-texts">' +
      '<input type="text" class="fom-opt-name-inp" value="' + escAttr(opt.name) + '" onchange="updateFieldOption(\'' + fieldKey + '\',' + idx + ',\'name\',this.value)" placeholder="Name">' +
      '<input type="text" class="fom-opt-desc-inp" value="' + escAttr(opt.desc || '') + '" onchange="updateFieldOption(\'' + fieldKey + '\',' + idx + ',\'desc\',this.value)" placeholder="Description / example...">' +
    '</div>' +
    '<button class="fom-delete-btn" onclick="deleteFieldOption(\'' + fieldKey + '\',' + idx + ')" title="Delete">\u2715</button>' +
  '</div>';
}

function addFieldOption(fieldKey) {
  var nameEl = document.getElementById('fom_new_name_' + fieldKey);
  var descEl = document.getElementById('fom_new_desc_' + fieldKey);
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { toast('Enter an option name', 'warn'); return; }
  // Check duplicate
  var existing = getFieldNames(fieldKey);
  if (existing.indexOf(name) !== -1) { toast('Option already exists', 'warn'); return; }
  FIELD_OPTIONS[fieldKey].push({ name: name, desc: descEl ? descEl.value.trim() : '' });
  saveFieldOptions();
  applyFieldOptionsEverywhere();
  // Re-render the list in modal
  var listEl = document.getElementById('fom_list_' + fieldKey);
  if (listEl) {
    var opts = FIELD_OPTIONS[fieldKey];
    var idx = opts.length - 1;
    listEl.insertAdjacentHTML('beforeend', renderFieldOptionRow(fieldKey, idx, opts[idx]));
  }
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
  toast('Option added \u2014 sync ClickUp manually to add it there too', 'ok');
}

function updateFieldOption(fieldKey, idx, prop, value) {
  if (!FIELD_OPTIONS[fieldKey] || !FIELD_OPTIONS[fieldKey][idx]) return;
  FIELD_OPTIONS[fieldKey][idx][prop] = value;
  saveFieldOptions();
  applyFieldOptionsEverywhere();
}

function deleteFieldOption(fieldKey, idx) {
  var opt = FIELD_OPTIONS[fieldKey][idx];
  if (!confirm('Delete "' + opt.name + '"? This won\'t affect existing ads that already have this value.')) return;
  FIELD_OPTIONS[fieldKey].splice(idx, 1);
  saveFieldOptions();
  applyFieldOptionsEverywhere();
  // Re-render the list section
  var listEl = document.getElementById('fom_list_' + fieldKey);
  if (listEl) {
    var opts = FIELD_OPTIONS[fieldKey];
    var html = '';
    for (var i = 0; i < opts.length; i++) { html += renderFieldOptionRow(fieldKey, i, opts[i]); }
    listEl.innerHTML = html;
  }
}

function applyFieldOptionsEverywhere() {
  // Updates filters, coverage, etc. without full re-render
  populateFilterOptions();
  if (P) renderHQ();
  saveState();
}

function renderProductProfile() {
  var el = document.getElementById('productProfileSection');
  if (!el) return;
  var html = '<div class="pp-header"><span class="pp-title">Product Profiles</span><button class="btn-ghost btn-sm" onclick="openAddProductModal()">+ Add Product</button></div>';
  html += '<div class="pp-chips">';
  for (var i = 0; i < PRODUCTS.length; i++) {
    var p = PRODUCTS[i];
    var isActive = p.id === activeProductId;
    html += '<div class="pp-chip' + (isActive ? ' active' : '') + '" onclick="switchProduct(\'' + escAttr(p.id) + '\')" style="--pp-color:' + escAttr(p.color) + '">';
    html += '<span class="pp-chip-dot"></span><span class="pp-chip-name">' + esc(p.name) + '</span>';
    html += p.clickupListId ? '<span class="pp-chip-linked">&#10003; ClickUp</span>' : '<span class="pp-chip-unlinked">No ClickUp</span>';
    html += '</div>';
  }
  if (PRODUCTS.length === 0) html += '<div style="color:var(--t3);font-size:0.72rem;padding:4px 0">No products yet. Add one to get started.</div>';
  html += '</div>';

  var activeProd = getActiveProduct();
  if (activeProd) {
    html += '<div class="pp-active-details">';
    html += '<span class="pp-active-name">' + esc(activeProd.name) + '</span>';

    if (activeProd.clickupListId) {
      html += '<span class="pp-linked-badge">&#10003; ' + esc(activeProd.clickupListName || activeProd.clickupListId) + '</span>';
      html += '<button class="btn-ghost btn-xs" onclick="openLinkClickUpModal(\'' + escAttr(activeProd.id) + '\')" style="margin-left:4px">Change</button>';
      // Sync button + last synced info
      html += '<button class="btn-primary btn-xs pp-sync-btn" onclick="syncClickUp()" style="margin-left:8px">&#8635; Sync Now</button>';
      html += '<button class="btn-ghost btn-xs" onclick="setupClickUpFields()" style="margin-left:4px">&#9881; Setup Fields</button>';
      if (activeProd.lastSyncedAt) {
        html += '<span class="pp-sync-time">Last synced ' + timeAgo(activeProd.lastSyncedAt);
        if (activeProd.lastSyncedCount) html += ' &middot; ' + activeProd.lastSyncedCount + ' tasks';
        html += '</span>';
      } else {
        html += '<span class="pp-sync-time pp-sync-never">Not synced yet — click Sync Now</span>';
      }
    } else {
      html += '<button class="btn-ghost btn-xs" onclick="openLinkClickUpModal(\'' + escAttr(activeProd.id) + '\')">Link ClickUp List</button>';
      html += '<span class="pp-sync-time pp-sync-never" style="margin-left:8px">Link a list to enable sync</span>';
    }

    html += '<button class="btn-ghost btn-xs" onclick="openFieldOptionsManager()" style="margin-left:4px">&#9881; Manage Fields</button>';
    html += '<button class="btn-ghost btn-xs" style="margin-left:auto;color:var(--lose)" onclick="confirmDeleteProduct(\'' + escAttr(activeProd.id) + '\')">Delete</button>';
    html += '</div>';
  }
  el.innerHTML = html;
  updateHeaderProductName();
}

function getActiveProduct() {
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === activeProductId) return PRODUCTS[i];
  }
  return null;
}

function timeAgo(ts) {
  var diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// Unified inline field editor for Creative Tracker — handles ALL editable columns
function updateCreativeFieldInline(adId, field, val) {
  var ad = null;
  for (var i = 0; i < ADS.length; i++) { if (ADS[i].id === adId) { ad = ADS[i]; break; } }
  if (!ad) return;

  // When angle or persona changes, remove task from its OLD cell in CELL_CREATIVE_ASSIGNMENTS
  // before the new value is set — otherwise the old entry lingers and creates a ghost cell
  if (field === 'angle' && ad.angle && ad.angle !== val && ad.persona) {
    var oldKey = ad.angle + '||' + ad.persona;
    if (CELL_CREATIVE_ASSIGNMENTS[oldKey]) {
      CELL_CREATIVE_ASSIGNMENTS[oldKey] = CELL_CREATIVE_ASSIGNMENTS[oldKey].filter(function(id) { return id !== adId; });
      if (CELL_CREATIVE_ASSIGNMENTS[oldKey].length === 0) delete CELL_CREATIVE_ASSIGNMENTS[oldKey];
    }
    delete MATRIX_CELL_META[adId + '||' + ad.angle + '||' + ad.persona];
  }
  if (field === 'persona' && ad.persona && ad.persona !== val && ad.angle) {
    var oldKey = ad.angle + '||' + ad.persona;
    if (CELL_CREATIVE_ASSIGNMENTS[oldKey]) {
      CELL_CREATIVE_ASSIGNMENTS[oldKey] = CELL_CREATIVE_ASSIGNMENTS[oldKey].filter(function(id) { return id !== adId; });
      if (CELL_CREATIVE_ASSIGNMENTS[oldKey].length === 0) delete CELL_CREATIVE_ASSIGNMENTS[oldKey];
    }
    delete MATRIX_CELL_META[adId + '||' + ad.angle + '||' + ad.persona];
  }

  ad[field] = val;

  // Auto-add to ANGLES/PERSONAS arrays if new value not seen before
  var addedNew = false;
  if (field === 'angle' && val && !ANGLES.some(function(a) { return a.name === val; })) {
    ANGLES.push({ id: 'ang-' + Date.now(), name: val, status: 'Untested', sourceLink: '', notes: '', _localNew: true });
    addedNew = true;
  }
  if (field === 'persona' && val && !PERSONAS.some(function(p) { return p.name === val; })) {
    PERSONAS.push({ id: 'per-' + Date.now(), name: val, status: 'Untested', sourceLink: '', notes: '', _localNew: true });
    addedNew = true;
  }

  // Push to ClickUp immediately — auto-creates dropdown option if it doesn't exist yet
  pushFieldToClickUp(ad, field, val);

  // Recalc stats + save
  P = process(ADS);
  buildCreativeUsageIndex();
  deriveWinners();
  genActions();
  saveState();

  // Show syncing indicator on the row immediately
  var row = document.getElementById('ad_row_' + adId);
  if (row) {
    var ind = row.querySelector('.cu-push-indicator');
    if (ind) {
      ind.textContent = '↑ ClickUp';
      ind.style.color = 'var(--inprog)';
      setTimeout(function() { ind.textContent = ''; }, 3000);
    }
    // Style the changed select as filled
    var selects = row.querySelectorAll('.fs-dim');
    for (var si = 0; si < selects.length; si++) {
      var sel = selects[si];
      if (sel.value && sel.value !== '') {
        sel.classList.add('fs-filled');
      } else {
        sel.classList.remove('fs-filled');
      }
    }
  }

  // If a new angle/persona was created, re-render those tabs + update all row dropdowns with new option
  if (addedNew) {
    if (typeof renderAngles === 'function') renderAngles();
    if (typeof renderPersonas === 'function') renderPersonas();
    // Re-render the creatives table so all rows get the new option in their dropdown
    if (typeof renderCreatives === 'function') renderCreatives();
  }
}

// Keep old name as alias for any legacy calls
function updateCreativeAnglePersona(adId, field, val) { updateCreativeFieldInline(adId, field, val); }

function updateHeaderProductName() {
  // Update pill button
  var dot = document.getElementById('hdrProdDot');
  var nameEl = document.getElementById('hdrProdName');
  var activeProd = getActiveProduct();
  if (dot) dot.style.background = activeProd ? (activeProd.color || '#4F46E5') : '#94A3B8';
  if (nameEl) nameEl.textContent = activeProd ? activeProd.name : 'No Product';
  // Also re-render dropdown if it's open
  var dd = document.getElementById('hdrProdDd');
  if (dd && dd.classList.contains('open')) renderHdrProdDropdown();
}

function renderHdrProdDropdown() {
  var dd = document.getElementById('hdrProdDd');
  if (!dd) return;
  var html = '';
  for (var i = 0; i < PRODUCTS.length; i++) {
    var p = PRODUCTS[i];
    var isActive = p.id === activeProductId;
    html += '<div class="hdr-prod-dd-item' + (isActive ? ' active' : '') + '" onclick="hdrSwitchProduct(\'' + escAttr(p.id) + '\')">';
    html += '<span class="hdr-prod-dd-dot" style="background:' + escAttr(p.color || '#4F46E5') + '"></span>';
    html += '<span class="hdr-prod-dd-name">' + esc(p.name) + '</span>';
    if (p.clickupListId) html += '<span class="hdr-prod-dd-badge">&#10003; ClickUp</span>';
    if (isActive) html += '<svg width="10" height="8" viewBox="0 0 10 8" fill="none" style="color:var(--win)"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    html += '</div>';
  }
  html += '<div class="hdr-prod-dd-item" onclick="openAddProductModal();closeHdrProdSwitcher()">';
  html += '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="color:var(--inprog)"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  html += '<span class="hdr-prod-dd-add">Add Product</span>';
  html += '</div>';
  dd.innerHTML = html;
}

function toggleHdrProdSwitcher(e) {
  if (e) e.stopPropagation();
  var dd = document.getElementById('hdrProdDd');
  if (!dd) return;
  if (dd.classList.contains('open')) {
    dd.classList.remove('open');
  } else {
    renderHdrProdDropdown();
    dd.classList.add('open');
  }
}

function closeHdrProdSwitcher() {
  var dd = document.getElementById('hdrProdDd');
  if (dd) dd.classList.remove('open');
}

function hdrSwitchProduct(productId) {
  closeHdrProdSwitcher();
  switchProduct(productId);
  // Also scroll to Command HQ so product profile is visible
}

// Close header product dropdown on outside click
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('hdrProdWrap');
  if (wrap && !wrap.contains(e.target)) closeHdrProdSwitcher();
});

// Force-flush pending saves before the tab reloads / closes. Uses both
// beforeunload (synchronous callback) and pagehide (fires on mobile bfcache).
// The fire-and-forget save still runs; fetch(..., { keepalive:true }) under
// Supabase JS keeps the request alive past document unload.
window.addEventListener('beforeunload', function () { try { flushPendingSave(); } catch(e){} });
window.addEventListener('pagehide',     function () { try { flushPendingSave(); } catch(e){} });
// Also flush when the tab becomes hidden (user switches tabs / app) — catches
// the case where the OS kills the tab before beforeunload fires.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') { try { flushPendingSave(); } catch(e){} }
});

window.addEventListener('load', async function () {
  initFieldOptions();
  loadFieldMaps();

  // Show a minimal loading state while we fetch from Supabase
  try {
    var statusLblEl = document.getElementById('statusLbl');
    if (statusLblEl) statusLblEl.textContent = 'Loading from cloud…';
  } catch(e) {}

  var loaded = false;
  try { loaded = await loadState(); } catch (e) { console.error('[SB] loadState threw', e); }
  await loadInspirations(); // now loads with correct productId from Supabase

  if (!loaded) {
    // No product data yet — start empty, user should link a ClickUp list and sync
    ANGLES = [];
    PERSONAS = [];
    ADS = [];
    PROD = [];
    ANGLE_PERSONAS = {};
  }
  // Mark whose data is currently in memory — guards writes/syncs from misattributing.
  _adsProductId = activeProductId || null;

  // Restore saved API key
  var savedKey = localStorage.getItem('immuvi_api_key');
  if (savedKey) {
    CFG.key = savedKey;
    var keyInput = document.getElementById('apiKeyInput');
    if (keyInput) keyInput.value = savedKey;
  }

  // Clean up stale CELL_CREATIVE_ASSIGNMENTS / MATRIX_CELL_META keys from past renames
  var _purged = purgeOrphanedMatrixKeys();
  P = process(ADS);
  buildCreativeUsageIndex();
  deriveWinners();
  genActions();
  // Restore saved tracker filters for this product (per-product key) BEFORE
  // populateFilterOptions so the selects get the right initial state.
  _loadTrackerFilters();
  populateFilterOptions();
  _syncTrackerFilterDom();
  renderAll(); // includes renderInspirations()
  renderProductProfile();
  updateHeaderProductName();
  // Subscribe to realtime changes for the active product
  _resubscribeRealtime();
  // Kick off cross-product caches so the product picker shows counts (non-blocking)
  refreshWinnersCache().catch(function(){});
  refreshInspoCache().catch(function(){});
  // (boot loader removed per user request)

  // Restore the last active tab (so refresh lands on the same page, not always Command HQ)
  (function() {
    try {
      var savedTab = localStorage.getItem('immuvi_active_tab');
      if (savedTab && savedTab !== 'hq') {
        var tabBtn = document.querySelector('.tab[onclick*="showTab(\'' + savedTab + '\'"]');
        if (tabBtn) showTab(savedTab, tabBtn);
      }
    } catch(e) {}
  })();

  // Auto-fetch field map if we have API key + list but no stored map
  (function() {
    var ap = getActiveProduct();
    if (CFG.key && ap && ap.clickupListId && !getActiveFieldMap()) {
      fetchAndStoreFieldMap(ap.clickupListId);
    }
  })();

  // Set status indicator
  var dot = document.getElementById('statusDot');
  var lbl = document.getElementById('statusLbl');
  var activeProd = getActiveProduct();

  if (CFG.key && activeProd && activeProd.clickupListId) {
    // API key + list configured → boot into live mode
    if (activeProd.lastSyncedAt) {
      _lastSyncedAt = activeProd.lastSyncedAt;
    }
    if (dot) dot.className = 'live-dot active';
    if (lbl) lbl.textContent = activeProd.lastSyncedAt ? ('Live · ' + timeAgo(activeProd.lastSyncedAt)) : 'Ready';
    // Start auto-sync after 2s so page renders fully first
    setTimeout(function() {
      startAutoSync();
    }, 2000);
  } else if (loaded) {
    if (dot) dot.className = 'live-dot';
    if (lbl) lbl.textContent = ADS.length + ' ads loaded — add API key to go live';
  } else {
    if (dot) dot.className = 'live-dot';
    if (lbl) lbl.textContent = 'Link a ClickUp list to sync';
  }
});


// ===== CREATIVE MATRIX GRID (v2 — Stacked Angle Sections) =====
/* ================================================================
   Creative Matrix — Stacked Angle Sections with per-angle persona grids
   Renders into #matrixGrid. Uses ANGLE_PERSONAS for persona assignment.
   ================================================================ */

