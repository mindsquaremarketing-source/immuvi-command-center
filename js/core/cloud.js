// ============================================================
//  15. BOOT
// ============================================================

// ============================================================
//  CLOUD STATE PERSISTENCE (Supabase)
// ============================================================
// localStorage no longer used for SHARED state. Only kept for:
//   - immuvi_api_key        (per-user secret, never synced)
//   - immuvi_active_product (per-user UI preference)
//   - immuvi_active_tab     (per-user UI preference)
//   - immuvi_field_maps_v1  (per-user cache of ClickUp field IDs)
//   - immuvi_field_options_v1 (per-user cache of dropdown options)

// saveState() stays sync for API compatibility with dozens of call sites —
// it kicks off a debounced async write to Supabase. The scheduled save
// captures activeProductId at schedule time so a product-switch during
// the debounce window can't write ads/cells to the wrong product.
// Shorter debounce (300ms) minimises the reload-race window; combined with
// the beforeunload force-flush (below) this makes persistence feel
// localStorage-instantaneous.
var _saveQueue = Promise.resolve();
var _saveScheduled = null;
var _pendingFlushProductId = null;
function saveState() {
  // Per-user UI prefs — synchronous, fast
  try {
    if (activeProductId) localStorage.setItem('immuvi_active_product', activeProductId);
    saveFieldOptions();
  } catch(e) {}
  // Shared state — debounced async write to Supabase
  if (_saveScheduled) clearTimeout(_saveScheduled);
  _pendingFlushProductId = activeProductId;
  _saveScheduled = setTimeout(function () {
    _saveScheduled = null;
    var pid = _pendingFlushProductId;
    _saveQueue = _saveQueue.then(function(){ return _flushStateToSupabase(pid); })
      .catch(function(e){
        console.error('[SB] save error', e);
        try { toast('Save failed — check connection', 'err'); } catch(_){}
      });
  }, 300);
}

// Force-flush any pending save immediately (bypasses the debounce). Called from
// beforeunload to persist edits before the tab closes/reloads.
function flushPendingSave() {
  if (_saveScheduled) {
    clearTimeout(_saveScheduled);
    _saveScheduled = null;
    var pid = _pendingFlushProductId;
    _saveQueue = _saveQueue.then(function(){ return _flushStateToSupabase(pid); })
      .catch(function(e){ console.error('[SB] flush error', e); });
  }
}

// When we're in the middle of our own save, we don't want realtime echoes of
// our own changes to re-fetch and replace the in-memory state with a transient
// partial-DB snapshot (causing the screen to flash blank). Gate the merge
// handler with this flag + a short grace period after save completes.
var _saveInFlight = false;
var _lastSaveCompletedAt = 0;

async function _flushStateToSupabase(productIdArg) {
  // Use the productId passed in (captured at schedule time). Fallback to
  // activeProductId only if called directly without an argument (e.g. switchProduct).
  var pid = productIdArg || activeProductId;
  if (!DB.ready || !pid) return;
  // Guard: if a switchProduct is mid-way through its fresh DB load (cached
  // data has been optimistically rendered but the authoritative fetch hasn't
  // applied yet), writing now would flush CACHED arrays back to Supabase —
  // potentially resurrecting rows the reconciler auto-deleted, or overwriting
  // changes another tab made. Bail; the next save after the fresh load
  // settles will write the correct state.
  if (_freshLoadInProgress) {
    console.log('[SB] skip flush — fresh load in progress for', pid);
    return;
  }
  // Hard invariant: the in-memory ADS must belong to the product we're about to
  // write. If they don't (we're mid-switch, or a sync raced ahead), abort rather
  // than persist the wrong data under the wrong product_id.
  if (_adsProductId && _adsProductId !== pid) {
    console.warn('[SB] abort save: in-memory data belongs to', _adsProductId, 'but tried to save as', pid);
    return;
  }
  _saveInFlight = true;
  try {
    await DB.saveProductData(pid, {
      ANGLES: ANGLES,
      PERSONAS: PERSONAS,
      ADS: ADS,
      MATRIX_CELL_META: MATRIX_CELL_META,
      CELL_CREATIVE_ASSIGNMENTS: CELL_CREATIVE_ASSIGNMENTS,
      MANUAL_ACTIONS: MANUAL_ACTIONS
    });
    // Keep products list in sync (catches rename / color / clickup list changes).
    // Skip any id in the recent-delete tombstone — otherwise if this tab still
    // has a product the user just deleted in another tab, upsert would
    // resurrect it.
    for (var pi = 0; pi < PRODUCTS.length; pi++) {
      if (_recentlyDeletedProductIds.has(PRODUCTS[pi].id)) continue;
      await DB.upsertProduct(PRODUCTS[pi]);
    }
  } finally {
    _lastSaveCompletedAt = Date.now();
    _saveInFlight = false;
  }
}

// Async load from Supabase. Called once during boot.
async function loadState() {
  if (!DB.ready) {
    console.error('[SB] DB not ready — cannot load state');
    return false;
  }
  // 1. Load products from Supabase
  try {
    PRODUCTS = await DB.listProducts();
  } catch (e) {
    console.error('[SB] listProducts failed', e);
    PRODUCTS = [];
  }

  // 2. Resolve active product: last saved UI preference → first product → none
  var savedActiveId = localStorage.getItem('immuvi_active_product');
  if (savedActiveId && PRODUCTS.some(function (p) { return p.id === savedActiveId; })) {
    activeProductId = savedActiveId;
  } else if (PRODUCTS.length > 0) {
    activeProductId = PRODUCTS[0].id;
    try { localStorage.setItem('immuvi_active_product', activeProductId); } catch(e) {}
  }

  if (!activeProductId) return false;

  // 3. Load the active product's data
  var state = null;
  try {
    state = await DB.loadProductData(activeProductId);
  } catch (e) {
    console.error('[SB] loadProductData failed', e);
    return false;
  }
  if (!state) return false;

  ANGLES = state.ANGLES || [];
  PERSONAS = state.PERSONAS || [];
  ADS = state.ADS || [];
  PROD = state.PROD || [];
  ANGLE_PERSONAS = state.ANGLE_PERSONAS || {};
  MATRIX_CELL_META = state.MATRIX_CELL_META || {};
  CELL_CREATIVE_ASSIGNMENTS = state.CELL_CREATIVE_ASSIGNMENTS || {};
  MANUAL_ACTIONS = state.MANUAL_ACTIONS || [];
  PRODUCTION_CLICKUP_IDS = {}; // rebuilt from ADS: { [clickupTaskId]: sourceFormatAdId }
  for (var pi = 0; pi < ADS.length; pi++) {
    var _a = ADS[pi];
    if (_a.taskType === 'production' && _a._clickupId && _a.sourceFormatId) {
      PRODUCTION_CLICKUP_IDS[_a._clickupId] = _a.sourceFormatId;
    }
  }
  // Migration: fix null liveStatus on old manual actions
  for (var lsi = 0; lsi < MANUAL_ACTIONS.length; lsi++) {
    if (!MANUAL_ACTIONS[lsi].liveStatus) MANUAL_ACTIONS[lsi].liveStatus = 'Untested';
  }
  nextAdSerial = (ADS.length || 0) + 1;
  return true;
}

async function resetToSeedData() {
  if (!confirm('Reset this product to empty state? All ads, angles, personas, and matrix data will be deleted from the cloud database. This cannot be undone.')) return;
  if (!DB.ready || !activeProductId) return;
  try {
    // Delete all product-scoped rows (cascade via FK)
    await Promise.all([
      SB.from('ads').delete().eq('product_id', activeProductId),
      SB.from('matrix_cells').delete().eq('product_id', activeProductId),
      SB.from('manual_actions').delete().eq('product_id', activeProductId),
      SB.from('angles').delete().eq('product_id', activeProductId),
      SB.from('personas').delete().eq('product_id', activeProductId)
    ]);
    toast('Product reset', 'ok');
    location.reload();
  } catch (e) {
    console.error('[SB] resetToSeedData failed', e);
    toast('Reset failed — see console', 'err');
  }
}

async function switchProduct(productId) {
  var prod = null;
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === productId) { prod = PRODUCTS[i]; break; }
  }
  if (!prod || productId === activeProductId) return;

  // Flush pending saves for the current product before switching
  if (_saveScheduled) { clearTimeout(_saveScheduled); _saveScheduled = null; }
  await _flushStateToSupabase().catch(function(e){ console.error('[SB] flush on switch failed', e); });
  // Also flush any pending inspirations write to the CURRENT product so they
  // don't land on the destination product.
  if (_insSaveTimer) {
    clearTimeout(_insSaveTimer);
    _insSaveTimer = null;
    if (DB.ready) {
      await DB.saveInspirations(activeProductId, INSPIRATIONS.slice()).catch(function(e){ console.error('[SB] ins flush', e); });
    }
  }

  // Stash current product's data into the cross-product cache so when the
  // user switches back, render is instant (no 200-500ms DB round-trip wait).
  if (activeProductId) {
    _inspoByProductCache[activeProductId] = (INSPIRATIONS || []).slice();
    // Snapshot ADS + taxonomy + matrix state for instant-restore on switch-back.
    _productDataCache[activeProductId] = {
      ANGLES: ANGLES.slice(),
      PERSONAS: PERSONAS.slice(),
      ADS: ADS.slice(),
      PROD: PROD.slice(),
      ANGLE_PERSONAS: Object.assign({}, ANGLE_PERSONAS),
      MATRIX_CELL_META: Object.assign({}, MATRIX_CELL_META),
      CELL_CREATIVE_ASSIGNMENTS: Object.assign({}, CELL_CREATIVE_ASSIGNMENTS),
      MANUAL_ACTIONS: MANUAL_ACTIONS.slice(),
      ts: Date.now()
    };
  }

  activeProductId = productId;
  // CRITICAL: clear the guard BEFORE loadProductData completes. Any sync / save /
  // realtime merge that fires during the load window will now bail (because
  // _adsProductId !== activeProductId), preventing product-data corruption.
  _adsProductId = null;
  try { localStorage.setItem('immuvi_active_product', activeProductId); } catch(e) {}

  // OPTIMISTIC FAST RENDER: if we have a recent cache for the target product,
  // hydrate in-memory arrays from it IMMEDIATELY and render. The DB fetch
  // below still runs — it will correct any drift — but the UI no longer has
  // to wait for the network round-trip to show numbers.
  var _cachedPD = _productDataCache[productId];
  var _rendered = false;
  if (_cachedPD && (Date.now() - _cachedPD.ts) < _PRODUCT_CACHE_MAX_MS) {
    ANGLES = _cachedPD.ANGLES.slice();
    PERSONAS = _cachedPD.PERSONAS.slice();
    ADS = _cachedPD.ADS.slice();
    PROD = _cachedPD.PROD.slice();
    ANGLE_PERSONAS = Object.assign({}, _cachedPD.ANGLE_PERSONAS || {});
    MATRIX_CELL_META = Object.assign({}, _cachedPD.MATRIX_CELL_META || {});
    CELL_CREATIVE_ASSIGNMENTS = Object.assign({}, _cachedPD.CELL_CREATIVE_ASSIGNMENTS || {});
    MANUAL_ACTIONS = (_cachedPD.MANUAL_ACTIONS || []).slice();
    nextAdSerial = (ADS.length || 0) + 1;
    _adsProductId = activeProductId;       // mark guard so sync/save can proceed against cached state
    P = process(ADS);
    if (typeof deriveWinners === 'function') deriveWinners();
    if (typeof genActions === 'function') genActions();
    if (typeof buildCreativeUsageIndex === 'function') buildCreativeUsageIndex();
    renderAll();
    _rendered = true;
  }

  // Load fresh from Supabase (background if we already rendered from cache).
  // Gate saves during this window: _freshLoadInProgress prevents the debounced
  // flush from writing CACHED-but-possibly-stale state to Supabase while the
  // authoritative fetch is in flight. Cleared once st is applied (or the
  // switch is aborted).
  _freshLoadInProgress = true;
  var st = null;
  try { st = await DB.loadProductData(productId); } catch (e) { console.error('[SB] switchProduct load', e); }
  // Abort fresh-apply if the user switched AGAIN during this load.
  if (productId !== activeProductId) { _freshLoadInProgress = false; return; }
  if (st) {
    ANGLES = st.ANGLES || []; PERSONAS = st.PERSONAS || []; ADS = st.ADS || [];
    PROD = st.PROD || []; ANGLE_PERSONAS = st.ANGLE_PERSONAS || {};
    MATRIX_CELL_META = st.MATRIX_CELL_META || {};
    CELL_CREATIVE_ASSIGNMENTS = st.CELL_CREATIVE_ASSIGNMENTS || {};
    MANUAL_ACTIONS = st.MANUAL_ACTIONS || [];
    PRODUCTION_CLICKUP_IDS = {}; // { [clickupTaskId]: sourceFormatAdId }
    for (var ai = 0; ai < ADS.length; ai++) {
      var _sa = ADS[ai];
      if (_sa.taskType === 'production' && _sa._clickupId && _sa.sourceFormatId) {
        PRODUCTION_CLICKUP_IDS[_sa._clickupId] = _sa.sourceFormatId;
      }
    }
    nextAdSerial = (ADS.length || 0) + 1;
    for (var lsi = 0; lsi < MANUAL_ACTIONS.length; lsi++) {
      if (!MANUAL_ACTIONS[lsi].liveStatus) MANUAL_ACTIONS[lsi].liveStatus = 'Untested';
    }
  } else {
    // New product with no data yet — start empty
    ANGLES = []; PERSONAS = []; ADS = []; PROD = []; ANGLE_PERSONAS = {};
    MATRIX_CELL_META = {}; CELL_CREATIVE_ASSIGNMENTS = {}; MANUAL_ACTIONS = []; PRODUCTION_CLICKUP_IDS = {};
    nextAdSerial = 1;
  }
  // Fresh state applied — saves can now fire safely.
  _freshLoadInProgress = false;
  // Data is now aligned with the active product — safe for saves/syncs to proceed.
  _adsProductId = activeProductId;
  P = process(ADS);
  if (typeof deriveWinners === 'function') deriveWinners();
  if (typeof genActions === 'function') genActions();
  if (typeof buildCreativeUsageIndex === 'function') buildCreativeUsageIndex();
  // Reset tracker filters to the new product's saved set (per-product key).
  // Clear all first so stale filters from the old product don't carry over.
  Object.keys(trackerFilters).forEach(function (k) { trackerFilters[k] = ''; });
  _loadTrackerFilters();

  // Inspirations: show from cache INSTANTLY, then refresh from Supabase in the
  // background. Avoids the 200-500ms round-trip blocking the product-switch render.
  var _cached = _inspoByProductCache[productId];
  if (_cached && _cached.length) {
    INSPIRATIONS = _cached.slice();
    INS_NEXT_ID = _cached.length + 1;
    migrateInspirationDocUrls();
    if (ADS && ADS.length > 0) refreshAllDupeChecks(false);
  } else {
    INSPIRATIONS = [];
    INS_NEXT_ID = 1;
  }

  refreshAllDupeChecks(false);
  populateFilterOptions();
  _syncTrackerFilterDom();
  renderAll();
  renderProductProfile();
  updateHeaderProductName();

  // Kick off the authoritative inspiration load in the background.
  // When it returns, update the cache + re-render only the inspirations surfaces.
  (function backgroundRefreshInspos(expectedProductId){
    loadInspirations().then(function(){
      if (activeProductId !== expectedProductId) return;  // user moved on
      _inspoByProductCache[expectedProductId] = INSPIRATIONS.slice();
      if (typeof renderInspirations === 'function') renderInspirations();
    }).catch(function(e){ console.error('[SB] switchProduct inspo refresh', e); });
  })(productId);

  // Re-wire realtime subscription for the new product
  _resubscribeRealtime();
  // Auto-fetch field map for new product if API key is set
  if (CFG.key && prod.clickupListId && !getActiveFieldMap()) {
    fetchAndStoreFieldMap(prod.clickupListId);
  }
  toast('Switched to ' + prod.name, 'ok');
}

async function addProduct(name, color, listId, listName) {
  if (!name || !name.trim()) { toast('Product name required', 'warn'); return; }
  // Auto-derive prefix from name (e.g. "Astro Rekha" → "AR")
  var words = name.trim().split(/\s+/).filter(Boolean);
  var autoPrefix = words.map(function(w){ return (w[0]||'').toUpperCase(); }).join('').substring(0, 3) || 'INS';
  var prod = { id: 'prod-' + Date.now(), name: name.trim(), insPrefix: autoPrefix, clickupListId: listId || '', clickupListName: listName || '', color: color || '#4F46E5', createdAt: Date.now() };
  PRODUCTS.push(prod);
  try { await DB.upsertProduct(prod); } catch (e) { console.error('[SB] addProduct upsert', e); }
  await switchProduct(prod.id);
  closeModal();
  toast('Product "' + prod.name + '" created', 'ok');
}

async function saveProductClickUpLink(productId, listId, listName) {
  var targetProd = null;
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === productId) {
      PRODUCTS[i].clickupListId = (listId || '').trim();
      PRODUCTS[i].clickupListName = (listName || '').trim();
      targetProd = PRODUCTS[i];
      break;
    }
  }
  if (targetProd) {
    try { await DB.upsertProduct(targetProd); } catch (e) { console.error('[SB] saveProductClickUpLink', e); }
  }
  renderProductProfile();
  closeModal();
  toast('ClickUp list linked — click Sync to import data', 'ok');

  // Auto-trigger sync if API key is available and this is the active product
  if (productId === activeProductId && CFG.key && listId) {
    setTimeout(syncClickUp, 300);
  }
}

async function confirmDeleteProduct(productId) {
  if (!confirm('Delete this product and all its data from the cloud database? This cannot be undone.')) return;
  // Tombstone BEFORE filter so any concurrent _flushStateToSupabase can't
  // re-upsert the product via its PRODUCTS loop. Also protects against
  // another tab that still has this product in its in-memory PRODUCTS.
  _rememberProductDeletion(productId);
  PRODUCTS = PRODUCTS.filter(function(p) { return p.id !== productId; });
  try { await DB.deleteProduct(productId); } catch (e) { console.error('[SB] deleteProduct', e); }
  if (PRODUCTS.length > 0) {
    await switchProduct(PRODUCTS[0].id);
  } else {
    activeProductId = null;
    renderProductProfile();
  }
  toast('Product deleted', 'ok');
}

// Wrap renderAll to auto-save after every render that involves data
var _renderAllOrig = null; // set after renderAll is defined
function renderAllAndSave() {
  renderAll();
  saveState();
}

function openAddProductModal() {
  var colors = ['#4F46E5','#059669','#DC2626','#D97706','#2563EB','#7C3AED'];
  var swatches = '';
  for (var i = 0; i < colors.length; i++) {
    swatches += '<span class="pp-color-swatch" style="background:' + colors[i] + '" onclick="selectProductColor(this, \'' + colors[i] + '\')" data-color="' + colors[i] + '"></span>';
  }
  var body = '<div class="form-group"><label>Product Name</label><input type="text" class="f-inp" id="newProdName" placeholder="e.g. Kids Mental Health"></div>' +
    '<div class="form-group"><label>Color</label><div class="pp-color-swatches" id="prodColorPicker">' + swatches + '</div><input type="hidden" id="newProdColor" value="' + colors[0] + '"></div>' +
    '<div class="form-group"><label>ClickUp List ID <span style="color:var(--t3)">(optional — can link later)</span></label><input type="text" class="f-inp" id="newProdListId" placeholder="901234567890"></div>' +
    '<div class="form-group"><label>ClickUp List Name <span style="color:var(--t3)">(optional)</span></label><input type="text" class="f-inp" id="newProdListName" placeholder="Kids Mental Health"></div>';
  var foot = '<button class="btn-ghost btn-sm" onclick="closeModal()">Cancel</button>' +
    '<button class="btn-primary btn-sm" onclick="addProduct(document.getElementById(\'newProdName\').value, document.getElementById(\'newProdColor\').value, document.getElementById(\'newProdListId\').value, document.getElementById(\'newProdListName\').value)">Create Product</button>';
  openModal('Add Product', body, foot);
  // Select first swatch by default
  var firstSwatch = document.querySelector('.pp-color-swatch');
  if (firstSwatch) firstSwatch.classList.add('selected');
}

function selectProductColor(el, color) {
  document.querySelectorAll('.pp-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
  el.classList.add('selected');
  document.getElementById('newProdColor').value = color;
}

function openLinkClickUpModal(productId) {
  var prod = null;
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === productId) { prod = PRODUCTS[i]; break; }
  }

  var body = '<div id="cuHierarchyContainer">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
    '<span style="font-size:0.8rem;color:var(--t2)">Select a list from your workspace, or enter ID manually.</span>' +
    '</div>' +
    '<div id="cuHierarchyTree" style="max-height:340px;overflow-y:auto;border:1px solid var(--b);border-radius:8px;padding:8px;background:var(--el);margin-bottom:14px">' +
    '<div style="display:flex;align-items:center;gap:8px;padding:12px;color:var(--t3);font-size:0.8rem" id="cuLoadingMsg">' +
    '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--b);border-top-color:var(--test);border-radius:50%;animation:spin 0.7s linear infinite"></span>' +
    'Loading workspace lists...</div>' +
    '</div>' +
    '<details style="margin-bottom:0">' +
    '<summary style="font-size:0.75rem;color:var(--t3);cursor:pointer;user-select:none;padding:4px 0">Manual entry (fallback)</summary>' +
    '<div style="margin-top:10px;display:flex;gap:8px">' +
    '<input type="text" class="f-inp" id="linkListId" value="' + escAttr(prod ? prod.clickupListId : '') + '" placeholder="List ID" style="flex:1">' +
    '<input type="text" class="f-inp" id="linkListName" value="' + escAttr(prod ? prod.clickupListName : '') + '" placeholder="List Name" style="flex:1.5">' +
    '<button class="btn-primary btn-sm" onclick="saveProductClickUpLink(\'' + escAttr(productId) + '\', document.getElementById(\'linkListId\').value, document.getElementById(\'linkListName\').value)">Save</button>' +
    '</div></details>' +
    '</div>';

  var foot = '<button class="btn-ghost btn-sm" onclick="closeModal()">Cancel</button>';
  openModal('Link ClickUp List', body, foot);

  // Fetch hierarchy after modal renders
  setTimeout(function() { fetchAndRenderCUHierarchy(productId); }, 50);
}

function fetchAndRenderCUHierarchy(productId) {
  var key = CFG.key || (document.getElementById('apiKeyInput') ? document.getElementById('apiKeyInput').value.trim() : '');
  var treeEl = document.getElementById('cuHierarchyTree');
  if (!treeEl) return;

  if (!key) {
    treeEl.innerHTML = '<div style="padding:12px;font-size:0.8rem;color:var(--t3)">Enter your ClickUp API key first, then reopen this dialog.</div>';
    return;
  }

  // Temporarily set key if not already set
  if (!CFG.key) CFG.key = key;

  apiFetch('/team').then(function(data) {
    var teams = (data && data.teams) ? data.teams : [];
    if (!teams.length) {
      treeEl.innerHTML = '<div style="padding:12px;font-size:0.8rem;color:var(--t3)">No workspaces found. Check your API key.</div>';
      return;
    }

    // Fetch all spaces in parallel
    var spacePromises = teams.map(function(team) {
      return apiFetch('/team/' + team.id + '/space?archived=false').then(function(sd) {
        return { team: team, spaces: (sd && sd.spaces) ? sd.spaces : [] };
      });
    });

    return Promise.all(spacePromises);
  }).then(function(teamsWithSpaces) {
    if (!teamsWithSpaces) return;

    // Flatten spaces
    var allSpaces = [];
    teamsWithSpaces.forEach(function(tws) {
      tws.spaces.forEach(function(sp) { allSpaces.push(sp); });
    });

    // For each space fetch folders + folderless lists in parallel
    var spaceDetailPromises = allSpaces.map(function(space) {
      return Promise.all([
        apiFetch('/space/' + space.id + '/folder?archived=false').then(function(fd) {
          return (fd && fd.folders) ? fd.folders : [];
        }),
        apiFetch('/space/' + space.id + '/list?archived=false').then(function(ld) {
          return (ld && ld.lists) ? ld.lists : [];
        })
      ]).then(function(results) {
        return { space: space, folders: results[0], folderlessLists: results[1] };
      });
    });

    return Promise.all(spaceDetailPromises);
  }).then(function(spaceDetails) {
    if (!spaceDetails) return;

    // For each folder, fetch its lists
    var folderListPromises = [];
    spaceDetails.forEach(function(sd) {
      sd.folders.forEach(function(folder) {
        folderListPromises.push(
          apiFetch('/folder/' + folder.id + '/list?archived=false').then(function(ld) {
            return { spaceId: sd.space.id, folder: folder, lists: (ld && ld.lists) ? ld.lists : [] };
          })
        );
      });
    });

    return Promise.all(folderListPromises).then(function(folderData) {
      return { spaceDetails: spaceDetails, folderData: folderData };
    });
  }).then(function(result) {
    if (!result) return;
    var treeEl2 = document.getElementById('cuHierarchyTree');
    if (!treeEl2) return;

    var spaceDetails = result.spaceDetails;
    var folderDataBySpace = {};
    result.folderData.forEach(function(fd) {
      if (!folderDataBySpace[fd.spaceId]) folderDataBySpace[fd.spaceId] = [];
      folderDataBySpace[fd.spaceId].push(fd);
    });

    var html = '';
    spaceDetails.forEach(function(sd) {
      html += '<div class="cu-space-row">' +
        '<span class="cu-space-icon">&#9632;</span>' +
        '<span class="cu-space-name">' + esc(sd.space.name) + '</span>' +
        '</div>';

      // Folders with their lists
      var spaceFolders = folderDataBySpace[sd.space.id] || [];
      spaceFolders.forEach(function(fd) {
        html += '<div class="cu-folder-row">' +
          '<span class="cu-folder-icon">&#9654;</span>' +
          '<span class="cu-folder-name">' + esc(fd.folder.name) + '</span>' +
          '</div>';
        fd.lists.forEach(function(list) {
          html += renderCUListRow(list, productId);
        });
      });

      // Folderless lists
      sd.folderlessLists.forEach(function(list) {
        html += renderCUListRow(list, productId);
      });
    });

    if (!html) html = '<div style="padding:12px;font-size:0.8rem;color:var(--t3)">No lists found in workspace.</div>';
    treeEl2.innerHTML = html;
  }).catch(function(err) {
    var treeEl3 = document.getElementById('cuHierarchyTree');
    if (treeEl3) treeEl3.innerHTML = '<div style="padding:12px;font-size:0.8rem;color:var(--lose)">Failed to load workspace: ' + esc(String(err)) + '</div>';
  });
}

function renderCUListRow(list, productId) {
  return '<div class="cu-list-row" onclick="selectCUList(\'' + escJs(productId) + '\',\'' + escJs(list.id) + '\',\'' + escJs(list.name) + '\')">' +
    '<span class="cu-list-icon">&#9679;</span>' +
    '<span class="cu-list-name">' + esc(list.name) + '</span>' +
    '<span class="cu-list-id">' + esc(list.id) + '</span>' +
    '<button class="btn-primary btn-xs cu-list-select-btn">Select</button>' +
    '</div>';
}

function selectCUList(productId, listId, listName) {
  saveProductClickUpLink(productId, listId, listName);
}

