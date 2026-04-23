// ============================================================
//  14. SYNC
// ============================================================

function setupClickUpFields() {
  // ClickUp API does not support creating custom fields programmatically.
  // Show a helper modal with the exact fields and options the user needs to create manually.
  var body =
    '<p style="font-size:0.78rem;color:var(--t2);margin-bottom:14px">ClickUp\'s API does not allow creating custom fields programmatically. Create these 3 fields <strong>once</strong> in your ClickUp list, then sync — the dashboard picks them up automatically by name.</p>' +
    '<div class="setup-field-block">' +
      '<div class="setup-field-name">1. Creative Structure <span class="setup-field-type">Dropdown</span></div>' +
      '<div class="setup-field-opts">' + CREATIVE_STRUCTURES.join(', ') + '</div>' +
    '</div>' +
    '<div class="setup-field-block">' +
      '<div class="setup-field-name">2. Hook Type <span class="setup-field-type">Dropdown</span></div>' +
      '<div class="setup-field-opts">' + HOOK_TYPES.join(', ') + '</div>' +
    '</div>' +
    '<div class="setup-field-block">' +
      '<div class="setup-field-name">3. Production Style <span class="setup-field-type">Dropdown</span></div>' +
      '<div class="setup-field-opts">' + PRODUCTION_STYLES.join(', ') + '</div>' +
    '</div>' +
    '<p style="font-size:0.72rem;color:var(--t3);margin-top:12px">In ClickUp: open any task → click <strong>+ Add Custom Field</strong> → choose Dropdown → paste the options above.</p>';
  var foot = '<button class="btn-primary btn-sm" onclick="closeModal()">Got it</button>';
  openModal('Setup ClickUp Fields', body, foot);
}

function fetchAndStoreFieldMap(listId) {
  if (!CFG.key || !listId || !activeProductId) return Promise.resolve();
  return apiFetch('/list/' + listId + '/field').then(function(data) {
    var fields = (data && data.fields) ? data.fields : [];
    var map = {};
    // Field name → app key mapping
    var nameToKey = {
      'creative structure': 'creativeStructure',
      'hook type': 'hookType',
      'production style': 'productionStyle',
      'angle tag': 'angle',           // short_text — primary sync field
      'persona tag': 'persona',       // short_text — primary sync field
      'angle': 'angle_dropdown',      // drop_down — secondary (matched when option exists)
      'persona': 'persona_dropdown',  // drop_down — secondary (matched when option exists)
      'funnel type': 'funnelStage',
      'photo/video': 'adType',
      'notes': 'notes_field',         // short_text — general notes field (separate from hypothesis)
      // Inspiration Link field (various possible names)
      'inspiration link': 'adLink',
      'inspo link': 'adLink',
      'ad link': 'adLink',
      'adlink': 'adLink',
      'ad url': 'adLink',
      'reference link': 'adLink',
      // Drive Link field (various possible names)
      'drive link': 'driveLink',
      'google drive link': 'driveLink',
      'google drive': 'driveLink',
      'gdrive': 'driveLink',
      'production link': 'driveLink',
      // Inspiration Brief / Doc link field (if user sets up a URL field for this)
      'brief link': 'briefLink',
      'inspiration brief': 'briefLink',
      'brief url': 'briefLink',
      'inspo doc': 'inspoDoc',
      'inspiration doc': 'inspoDoc',
      'doc link': 'inspoDoc'
    };
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var fname = (f.name || '').toLowerCase().trim();
      var appKey = nameToKey[fname];
      if (!appKey) continue;
      var options = [];
      if (f.type_config && f.type_config.options) {
        options = f.type_config.options.map(function(o) {
          return { name: o.name, orderindex: o.orderindex, id: o.id };
        });
      }
      var entry = { fieldId: f.id, fieldType: f.type, options: options };
      // For angle_dropdown/persona_dropdown: pick the one with the most real options
      if (appKey === 'angle_dropdown' || appKey === 'persona_dropdown') {
        var realOpts = options.filter(function(o) { return o.name !== '—'; });
        var existingRealOpts = map[appKey] ? (map[appKey].options || []).filter(function(o){ return o.name !== '—'; }) : [];
        if (realOpts.length >= existingRealOpts.length) map[appKey] = entry;
      } else {
        // For other fields, prefer more options (existing logic)
        if (map[appKey]) {
          var existingOpts = map[appKey].options || [];
          var newOpts = options.filter(function(o) { return o.name !== '—'; });
          if (newOpts.length <= existingOpts.filter(function(o) { return o.name !== '—'; }).length) continue;
        }
        map[appKey] = entry;
      }
    }
    PRODUCT_FIELD_MAPS[activeProductId] = map;
    saveFieldMaps();
    // Auto-push any values that were pending because options didn't exist before
    setTimeout(flushPendingFieldPushes, 500);
    return map;
  }).catch(function() { return null; });
}

function syncClickUp() {
  var keyInput = document.getElementById('apiKeyInput');
  CFG.key = (keyInput ? keyInput.value.trim() : CFG.key);

  if (!CFG.key) {
    toast('Enter your ClickUp API key first', 'err');
    return;
  }

  // Save the API key for persistence
  localStorage.setItem('immuvi_api_key', CFG.key);

  var activeProd = getActiveProduct();
  if (!activeProd || !activeProd.clickupListId) {
    toast('Link a ClickUp list to this product first (Command HQ → Product Profiles)', 'err');
    return;
  }

  var listId = activeProd.clickupListId;
  showLoading('Syncing ' + activeProd.name + ' from ClickUp...');
  var dot = document.getElementById('statusDot');
  var lbl = document.getElementById('statusLbl');
  if (dot) { dot.classList.remove('ok', 'err'); }
  if (lbl) lbl.textContent = 'Syncing...';

  // Fetch tasks (paginated — ClickUp returns max 100 per page)
  fetchAllTasks(listId)
    .then(function(tasks) {
      if (!tasks || tasks.length === 0) {
        toast('No tasks found in this list', 'warn');
        hideLoading();
        if (lbl) lbl.textContent = 'List is empty';
        return;
      }

      // Import tasks into ADS, ANGLES, PERSONAS
      importTasksFromClickUp(tasks);

      // Record sync time on the product
      var _syncedProd = null;
      for (var i = 0; i < PRODUCTS.length; i++) {
        if (PRODUCTS[i].id === activeProductId) {
          PRODUCTS[i].lastSyncedAt = Date.now();
          PRODUCTS[i].lastSyncedCount = tasks.length;
          _syncedProd = PRODUCTS[i];
          break;
        }
      }
      // Persist the product metadata update to Supabase (fire-and-forget)
      if (_syncedProd && DB.ready) DB.upsertProduct(_syncedProd).catch(function(e){ console.error('[SB] sync meta', e); });

      P = process(ADS);
      buildCreativeUsageIndex();
      deriveWinners();
      genActions();
      populateFilterOptions();
      renderAll();
      renderProductProfile();
      hideLoading();
      saveState();

      _lastSyncedAt = Date.now();
      if (dot) dot.className = 'live-dot active';
      if (lbl) lbl.textContent = 'Live · just now';
      toast('Synced ' + tasks.length + ' tasks from ClickUp', 'ok');
      startAutoSync();
      fetchAndStoreFieldMap(listId);
    })
    .catch(function(err) {
      hideLoading();
      if (dot) { dot.classList.add('err'); dot.classList.remove('ok'); }
      if (lbl) lbl.textContent = 'Sync failed';
      toast('Sync error: ' + (err.message || String(err)), 'err');
    });
}

function fetchAllTasks(listId) {
  // Fetch up to 5 pages (500 tasks max)
  var allTasks = [];
  function fetchPage(page) {
    return apiFetch('/list/' + listId + '/task?include_closed=true&subtasks=true&page=' + page)
      .then(function(resp) {
        var tasks = (resp && resp.tasks) ? resp.tasks : [];
        allTasks = allTasks.concat(tasks);
        if (tasks.length === 100 && page < 4) {
          return fetchPage(page + 1);
        }
        return allTasks;
      });
  }
  return fetchPage(0);
}

// Low-level: set a single ClickUp custom field on a task.
function _setTaskField(adClickupId, fieldId, payload, adId) {
  return apiFetch('/task/' + adClickupId + '/field/' + fieldId, {
    method: 'POST', body: payload
  }).then(function() {
    var row = document.getElementById('ad_row_' + adId);
    if (row) {
      var ind = row.querySelector('.cu-push-indicator');
      if (ind) { ind.textContent = '✓ ClickUp'; ind.style.color = 'var(--win)'; setTimeout(function(){ ind.textContent = ''; }, 2500); }
    }
  });
}

// Push a field value to ClickUp for a specific task.
// For angle/persona: DUAL PUSH —
//   1. Always push to short_text "Angle Tag" / "Persona Tag" field (instant, any value)
//   2. Also try dropdown "Angle" / "Persona" field — if option already exists, match it
// Returns a promise.
function pushFieldToClickUp(ad, fieldKey, value) {
  if (!ad || !ad._clickupId || !CFG.key) return Promise.resolve();
  if (!value || value === '—') return Promise.resolve();
  var fieldMap = getActiveFieldMap();
  if (!fieldMap) return Promise.resolve();

  // DUAL PUSH for angle and persona
  if (fieldKey === 'angle' || fieldKey === 'persona') {
    var promises = [];

    // Track 1: short_text field (Angle Tag / Persona Tag) — always pushes
    var textDef = fieldMap[fieldKey]; // 'angle' → Angle Tag, 'persona' → Persona Tag
    if (textDef && (textDef.fieldType === 'short_text' || textDef.fieldType === 'text')) {
      promises.push(
        _setTaskField(ad._clickupId, textDef.fieldId, { value: value }, ad.id)
          .catch(function(e) { console.warn('Text field push failed:', e.message); })
      );
    }

    // Track 2: dropdown field — push only if option already exists (no API to create options)
    var ddKey = fieldKey + '_dropdown'; // 'angle_dropdown' / 'persona_dropdown'
    var ddDef = fieldMap[ddKey];
    if (ddDef && ddDef.fieldType === 'drop_down') {
      var orderindex = -1;
      for (var i = 0; i < ddDef.options.length; i++) {
        if (ddDef.options[i].name === value) {
          orderindex = ddDef.options[i].orderindex;
          break;
        }
      }
      if (orderindex !== -1) {
        // Option exists in ClickUp dropdown — also set it there
        promises.push(
          _setTaskField(ad._clickupId, ddDef.fieldId, { value: orderindex }, ad.id)
            .catch(function(e) { console.warn('Dropdown push failed:', e.message); })
        );
      }
      // If option doesn't exist in dropdown yet: the short_text field already has it.
      // When the user manually adds the option to the ClickUp dropdown and syncs,
      // flushPendingFieldPushes() will auto-match and push it.
      if (orderindex === -1) {
        if (!ad._pendingCUFields) ad._pendingCUFields = {};
        ad._pendingCUFields[ddKey] = value;
      }
    }

    return Promise.all(promises);
  }

  // Special: creative hypothesis → update task description (prepend before ━━━ separator)
  if (fieldKey === 'creativeHypothesis') {
    return apiFetch('/task/' + ad._clickupId, {
      method: 'PUT',
      body: {
        description: '🧠 Creative Hypothesis: ' + value + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━'
      }
    }).then(function() {
      var row = document.getElementById('ad_row_' + ad.id);
      if (row) {
        var ind = row.querySelector('.cu-push-indicator');
        if (ind) { ind.textContent = '✓ ClickUp'; ind.style.color = 'var(--win)'; setTimeout(function(){ ind.textContent = ''; }, 2500); }
      }
    }).catch(function(err) { toast('Hypothesis sync failed: ' + (err.message || String(err)), 'err'); });
  }

  // Standard push for all other fields
  var fieldDef = fieldMap[fieldKey];
  if (!fieldDef) return Promise.resolve();
  var fieldId = fieldDef.fieldId;

  if (fieldDef.fieldType === 'short_text' || fieldDef.fieldType === 'text' || fieldDef.fieldType === 'url') {
    return _setTaskField(ad._clickupId, fieldId, { value: value }, ad.id)
      .catch(function(err) { toast('ClickUp sync failed: ' + (err.message || String(err)), 'err'); });
  } else if (fieldDef.fieldType === 'drop_down') {
    var oi = -1;
    for (var j = 0; j < fieldDef.options.length; j++) {
      if (fieldDef.options[j].name === value) { oi = fieldDef.options[j].orderindex; break; }
    }
    if (oi !== -1) {
      return _setTaskField(ad._clickupId, fieldId, { value: oi }, ad.id)
        .catch(function(err) { toast('ClickUp sync failed: ' + (err.message || String(err)), 'err'); });
    }
    if (!ad._pendingCUFields) ad._pendingCUFields = {};
    ad._pendingCUFields[fieldKey] = value;
    return Promise.resolve();
  } else {
    return _setTaskField(ad._clickupId, fieldId, { value: value }, ad.id)
      .catch(function(err) { toast('ClickUp sync failed: ' + (err.message || String(err)), 'err'); });
  }
}

// After a ClickUp sync refreshes the field map, auto-push any locally-saved values
// that were previously pending because the option didn't exist in ClickUp yet.
function flushPendingFieldPushes() {
  var fieldMap = getActiveFieldMap();
  if (!fieldMap || !CFG.key) return;
  var pushed = 0;
  for (var i = 0; i < ADS.length; i++) {
    var ad = ADS[i];
    if (!ad._pendingCUFields || !ad._clickupId) continue;
    var keys = Object.keys(ad._pendingCUFields);
    for (var k = 0; k < keys.length; k++) {
      var fk = keys[k];
      var val = ad._pendingCUFields[fk];
      var fieldDef = fieldMap[fk];
      if (!fieldDef || fieldDef.fieldType !== 'drop_down') continue;
      // Check if option now exists after sync
      for (var oi = 0; oi < fieldDef.options.length; oi++) {
        if (fieldDef.options[oi].name === val) {
          // Found it — push now
          (function(a, key, v, idx) {
            apiFetch('/task/' + a._clickupId + '/field/' + fieldDef.fieldId, {
              method: 'POST', body: { value: idx }
            }).then(function() {
              delete a._pendingCUFields[key];
              pushed++;
            }).catch(function() {});
          })(ad, fk, val, fieldDef.options[oi].orderindex);
          break;
        }
      }
    }
  }
  if (pushed > 0) toast(pushed + ' pending field value(s) pushed to ClickUp', 'ok');
}

function pushAllToClickUp() {
  var fieldMap = getActiveFieldMap();
  if (!fieldMap) { toast('Sync first to load field map', 'warn'); return; }
  if (!CFG.key) { toast('Enter API key first', 'err'); return; }
  var fields = ['creativeStructure', 'hookType', 'productionStyle', 'angle', 'persona', 'funnelStage'];
  var pushed = 0;
  var skipped = 0;
  for (var i = 0; i < ADS.length; i++) {
    var ad = ADS[i];
    if (!ad._clickupId) { skipped++; continue; }
    for (var fi = 0; fi < fields.length; fi++) {
      var fk = fields[fi];
      var val = ad[fk];
      if (val && val !== '—' && val !== '') {
        pushFieldToClickUp(ad, fk, val);
        pushed++;
      }
    }
  }
  toast('Pushing ' + pushed + ' field values to ClickUp...', 'ok');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped auto-discover for angles & personas.
//
// Context: earlier versions of this sync code auto-pushed new angle/persona
// values into global arrays without a product guard, which leaked KLS
// taxonomy into Astro Rekha and vice-versa. That behavior was removed and
// replaced with fully-manual curation. The manual path is safe but painful:
// every time a new product is added, the team has to type its angles + personas
// into the Angles / Personas tabs before the Creative Matrix and Coverage
// Intelligence cards populate.
//
// This helper brings auto-discover back, but SCOPED:
//   • It only ever writes to the current in-memory ANGLES / PERSONAS (which
//     are swapped on every switchProduct), so it cannot cross products.
//   • Both call sites (importTasksFromClickUp, pollFullSync Pass 2) are
//     already guarded by the `_adsProductId === activeProductId` invariant,
//     so the sync that triggered this is itself scoped to one product.
//   • Match is case-insensitive so typos like "stressed women 25-45" vs
//     "Stressed Women 25-45" don't add duplicate entries.
//   • New entries get `_localNew: true` so the existing filter logic in
//     switchProduct keeps them on refresh until a save completes.
//
// Returns { addedAngles: [...], addedPersonas: [...] } for diagnostic output.
//
// Rollback: `git reset --hard pre-scoped-autodiscover-2026-04-21`
// ─────────────────────────────────────────────────────────────────────────────
function autoDiscoverTaxonomy(sourceAds) {
  // Guard: if the global ANGLES/PERSONAS arrays are not yet bound to the active
  // product (mid product-switch), do nothing. The next sync tick will pick it up.
  if (_adsProductId && activeProductId && _adsProductId !== activeProductId) {
    return { addedAngles: [], addedPersonas: [] };
  }

  var existingAngleNamesLC   = {};
  var existingPersonaNamesLC = {};
  for (var ai = 0; ai < ANGLES.length; ai++) {
    var aname = (ANGLES[ai] && ANGLES[ai].name) ? ANGLES[ai].name : '';
    if (aname) existingAngleNamesLC[aname.toLowerCase().trim()] = true;
  }
  for (var pi = 0; pi < PERSONAS.length; pi++) {
    var pname = (PERSONAS[pi] && PERSONAS[pi].name) ? PERSONAS[pi].name : '';
    if (pname) existingPersonaNamesLC[pname.toLowerCase().trim()] = true;
  }

  var angleSeen   = {}; // preserve first-seen casing
  var personaSeen = {};
  var addedAngles   = [];
  var addedPersonas = [];

  for (var i = 0; i < (sourceAds || []).length; i++) {
    var ad = sourceAds[i];
    if (!ad) continue;

    var ang = (ad.angle || '').trim();
    if (ang && !angleSeen[ang.toLowerCase()] && !existingAngleNamesLC[ang.toLowerCase()]) {
      angleSeen[ang.toLowerCase()] = true;
      ANGLES.push({
        id: 'ang-auto-' + Date.now() + '-' + addedAngles.length,
        name: ang,
        status: 'Untested',
        sourceLink: '',
        notes: '',
        _localNew: true,
        _autoDiscovered: true
      });
      existingAngleNamesLC[ang.toLowerCase()] = true;
      addedAngles.push(ang);
    }

    var per = (ad.persona || '').trim();
    if (per && !personaSeen[per.toLowerCase()] && !existingPersonaNamesLC[per.toLowerCase()]) {
      personaSeen[per.toLowerCase()] = true;
      PERSONAS.push({
        id: 'per-auto-' + Date.now() + '-' + addedPersonas.length,
        name: per,
        status: 'Untested',
        sourceLink: '',
        notes: '',
        _localNew: true,
        _autoDiscovered: true
      });
      existingPersonaNamesLC[per.toLowerCase()] = true;
      addedPersonas.push(per);
    }
  }

  if (addedAngles.length || addedPersonas.length) {
    console.log('[autoDiscover] product', activeProductId,
      '+', addedAngles.length, 'angles:', addedAngles,
      '+', addedPersonas.length, 'personas:', addedPersonas);
  }
  return { addedAngles: addedAngles, addedPersonas: addedPersonas };
}

function importTasksFromClickUp(tasks) {
  // ── MERGE STRATEGY (not full replace) ──────────────────────────────────────
  // Matching existing local ADs by _clickupId and updating only the fields that
  // ClickUp owns prevents two critical bugs:
  //   1. Local serial IDs are preserved → MANUAL_ACTIONS.sourceAdId keeps working
  //      (if IDs change, the action plan loses its link to the AD and the matrix
  //       shows "→ Action Plan" again, causing duplicate ClickUp tasks to be created)
  //   2. Local metadata (_fromInspoId, taskType, sourceFormatId, etc.) is not wiped
  //      after every sync (which caused Production badges / Inspiration links to vanish)
  //
  // Fields ClickUp controls (overwrite local if non-empty). Note: adOrigin and
  // taskType are deliberately excluded so production/inspiration provenance
  // survives live sync.
  var CLICKUP_FIELDS = [
    'formatName', 'status', 'adLink', 'driveLink', 'adType', 'funnelStage',
    'angle', 'persona', 'parentAdId', 'variationNumber',
    'creativeStructure', 'hookType', 'productionStyle', 'creativeHypothesis',
    '_clickupUrl', '_clickupStatus'
  ];
  // Local provenance fields that must NEVER be overwritten by a ClickUp sync:
  var _PRESERVE_LOCAL = ['taskType', 'adOrigin', 'sourceFormatId', '_fromInspoId',
    '_sourceAdId', '_sourceProductId', '_sourceClickupId', '_sourceFormatDriveLink',
    '_sourceFormatName', '_sourceFormatAdLink', '_sourceFormatAdType'];

  // Index existing local ADS by _clickupId for O(1) lookup
  var localByClickupId = {};
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i]._clickupId) localByClickupId[ADS[i]._clickupId] = ADS[i];
  }

  // Secondary index: MANUAL_ACTIONS → sourceAd. When the user pushes an
  // action-plan item to ClickUp, the MANUAL_ACTION gets _clickupId but the
  // sourceAd's _clickupId may be lost across a browser refresh before the
  // next sync. Without this fallback index, the fetched task comes back
  // "unknown" and gets imported as a brand-new ad — creating a duplicate
  // (e.g. AD-198 local + 86d2qa5tx ClickUp-synced, both pointing at the
  // same underlying task). Here we look up the sourceAd through the
  // MANUAL_ACTION and promote it into localByClickupId + fix the link.
  for (var mi = 0; mi < MANUAL_ACTIONS.length; mi++) {
    var _act = MANUAL_ACTIONS[mi];
    if (!_act || !_act._clickupId || !_act._sourceAdId) continue;
    if (localByClickupId[_act._clickupId]) continue; // already linked
    for (var si = 0; si < ADS.length; si++) {
      if (ADS[si].id === _act._sourceAdId) {
        // Repair the link in memory so future syncs don't re-create duplicates
        ADS[si]._clickupId   = _act._clickupId;
        ADS[si].clickupTaskId = _act._clickupId;
        localByClickupId[_act._clickupId] = ADS[si];
        break;
      }
    }
  }

  // Set of ClickUp task IDs in this fetch (to detect tasks removed from ClickUp)
  var fetchedClickupIds = {};
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id) fetchedClickupIds[tasks[i].id] = true;
  }

  var newAds = [];
  var seenAngles = {};
  var seenPersonas = {};

  for (var i = 0; i < tasks.length; i++) {
    var parsed = parseClickUpTask(tasks[i]);
    var existing = parsed._clickupId ? localByClickupId[parsed._clickupId] : null;
    var ad;

    if (existing) {
      // UPDATE in-place: overwrite ClickUp-controlled fields, keep local metadata
      for (var f = 0; f < CLICKUP_FIELDS.length; f++) {
        var fk = CLICKUP_FIELDS[f];
        var freshVal = parsed[fk];
        // Only overwrite if ClickUp returned a real value (don't blank out local data)
        if (freshVal !== undefined && freshVal !== null && freshVal !== '') {
          existing[fk] = freshVal;
        }
      }
      // Always sync status regardless (reflects ClickUp state changes)
      if (parsed.status) existing.status = parsed.status;
      ad = existing;
    } else {
      // NEW task (not in local state — imported fresh from ClickUp)
      ad = parsed;
    }

    newAds.push(ad);

    if (ad.angle && !seenAngles[ad.angle])   seenAngles[ad.angle]   = true;
    if (ad.persona && !seenPersonas[ad.persona]) seenPersonas[ad.persona] = true;
  }

  // Keep local-only ADS (no _clickupId) — not yet pushed to ClickUp
  for (var i = 0; i < ADS.length; i++) {
    var localAd = ADS[i];
    if (!localAd._clickupId) {
      newAds.push(localAd);
      if (localAd.angle && !seenAngles[localAd.angle])     seenAngles[localAd.angle]   = true;
      if (localAd.persona && !seenPersonas[localAd.persona]) seenPersonas[localAd.persona] = true;
    }
    // ADS with a _clickupId that wasn't in the fetched set: silently keep to avoid
    // accidental data loss (the task may be outside the current fetch page or archived)
  }

  // Also sync MANUAL_ACTIONS liveStatus from the freshly-fetched tasks
  var taskStatusMap = {};
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (t.id && t.status && t.status.status) taskStatusMap[t.id] = t.status.status;
  }
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i]._clickupId && taskStatusMap[MANUAL_ACTIONS[i]._clickupId]) {
      var mapped = mapClickUpStatus(taskStatusMap[MANUAL_ACTIONS[i]._clickupId]);
      if (mapped) MANUAL_ACTIONS[i].liveStatus = mapped;
    }
  }

  ADS = newAds;
  // Don't reset nextAdSerial — local serial IDs must remain unique and continuous

  // Scoped auto-discover: push any new angle/persona values found in ADS into
  // the active product's ANGLES / PERSONAS master lists. Scoped by the active
  // product (the `_adsProductId === activeProductId` guard at the sync entry
  // point ensures ADS belongs to this product; autoDiscoverTaxonomy writes
  // only to the globals which are swapped on switchProduct, so no leak).
  // Restored 2026-04-21 (option 3). Rollback tag: pre-scoped-autodiscover-2026-04-21.
  autoDiscoverTaxonomy(ADS);

  // Auto-discover new taxonomy values from imported tasks
  var fieldKeyMap = {
    creativeStructure: 'creativeStructure',
    hookType: 'hookType',
    productionStyle: 'productionStyle'
  };
  for (var fk in fieldKeyMap) {
    var existingNames = getFieldNames(fk);
    for (var ti = 0; ti < newAds.length; ti++) {
      var taskVal = newAds[ti][fk];
      if (taskVal && existingNames.indexOf(taskVal) === -1) {
        FIELD_OPTIONS[fk].push({ name: taskVal, desc: '' });
        existingNames.push(taskVal);
      }
    }
  }
  saveFieldOptions();

  // Rebuild ANGLE_PERSONAS from ADS
  initAnglePersonas();
}

function parseClickUpTask(t) {
  // Map ClickUp task to ADS format.
  // Match custom fields by name (case-insensitive) so no pre-configuration needed.
  var cfByName = {};
  if (t.custom_fields) {
    for (var i = 0; i < t.custom_fields.length; i++) {
      var f = t.custom_fields[i];
      cfByName[(f.name || '').toLowerCase().trim()] = f;
    }
  }

  function getFieldValue(names) {
    // names is an array of possible field name variants to try
    for (var ni = 0; ni < names.length; ni++) {
      var field = cfByName[names[ni].toLowerCase()];
      if (!field) continue;
      // dropdown: ClickUp returns value as orderindex (new_drop_down) or array index (old style)
      if ((field.type === 'drop_down' || field.type === 'labels') && field.type_config && field.type_config.options && field.value != null) {
        var opts = field.type_config.options;
        var val = typeof field.value === 'number' ? field.value : parseInt(field.value, 10);
        if (!isNaN(val)) {
          // Try matching by orderindex first (new_drop_down style)
          for (var oi = 0; oi < opts.length; oi++) {
            if (opts[oi].orderindex === val) return opts[oi].name;
          }
          // Fall back to array index (old style)
          if (opts[val]) return opts[val].name;
        }
        // Fallback: value might already be the option name string
        if (typeof field.value === 'string' && field.value) return field.value;
      }
      // url / text / short_text / number
      if (field.value != null && field.value !== '') return String(field.value);
    }
    return '';
  }

  // Extract tags as a fallback for angle/persona
  var tags = (t.tags || []).map(function(tg) { return tg.name || ''; }).filter(Boolean);

  // angle tag / persona tag (short_text) take priority over dropdown angle/persona
  var angleTag   = getFieldValue(['angle tag']);
  var personaTag = getFieldValue(['persona tag']);
  var angle   = angleTag   || getFieldValue(['angle', 'angles', 'ad angle']);
  var persona = personaTag || getFieldValue(['persona', 'personas', 'target persona', 'audience']);
  var adLink   = getFieldValue(['inspiration link', 'inspo link', 'ad link', 'adlink', 'ad url', 'adurl', 'creative link', 'reference link']);
  var driveLink = getFieldValue(['drive link', 'google drive', 'gdrive', 'production link', 'google drive link', 'drive']);
  var adType = getFieldValue(['photo/video', 'ad type', 'adtype', 'format type', 'type']);
  var funnelStage = getFieldValue(['funnel type', 'funnel', 'funnel stage', 'funnelstage', 'stage', 'funnel_stage']);
  var parentAd = getFieldValue(['parent ad', 'parentad', 'parent', 'parent task']);
  var variationNum = getFieldValue(['variation number', 'variationnumber', 'variation #', 'variation']);

  // Creative Hypothesis: stored at start of description before the ━━━ separator
  var creativeHypothesis = '';
  var desc = t.description || '';
  if (desc) {
    var sepIdx = desc.indexOf('━━━');
    if (sepIdx !== -1) {
      creativeHypothesis = desc.slice(0, sepIdx).trim();
    } else {
      // If no separator, whole description is the hypothesis
      creativeHypothesis = desc.trim();
    }
    // Strip "🧠 Creative Hypothesis: " label prefix if present (exact match on our push format)
    creativeHypothesis = creativeHypothesis.replace(/^[\s\S]*?creative\s+hypothesis\s*:\s*/i, function(m) {
      // Only strip if the label is in the first 80 chars (guard against hypothesis text matching)
      return m.length <= 80 ? '' : m;
    }).trim();
  }

  // Fallback: parse "Angle × Persona" pattern from task name
  if (!angle && !persona && t.name && t.name.indexOf(' × ') !== -1) {
    var parts = t.name.split(' × ');
    if (parts.length >= 2) { angle = parts[0].trim(); persona = parts[1].trim(); }
  }

  // Check if this is a production task (created via action-plan push from our app).
  // Priority of truth:
  //  1. PRODUCTION_CLICKUP_IDS (in-memory map rebuilt from ADs' own taskType)
  //  2. MANUAL_ACTIONS — if any action owns this ClickUp task id, it was pushed
  //     from our Action Plan and is therefore a production task. This fallback
  //     plugs the race window where the 30s auto-sync fetches a just-created
  //     task before the create-promise has marked its sourceAd taskType.
  var isProduction = false;
  var sourceFormatId = null;
  if (t.id) {
    if (PRODUCTION_CLICKUP_IDS[t.id]) {
      isProduction = true;
      sourceFormatId = PRODUCTION_CLICKUP_IDS[t.id];
    } else if (Array.isArray(MANUAL_ACTIONS)) {
      for (var _mai = 0; _mai < MANUAL_ACTIONS.length; _mai++) {
        var _ma = MANUAL_ACTIONS[_mai];
        if (_ma && _ma._clickupId === t.id) {
          isProduction = true;
          sourceFormatId = _ma.sourceAdId || _ma.adId || null;
          // Backfill the in-memory map so later lookups are O(1) again.
          PRODUCTION_CLICKUP_IDS[t.id] = sourceFormatId || '';
          break;
        }
      }
    }
  }

  return {
    id: t.id || ('ad-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)),
    _clickupId: t.id,
    _clickupUrl: t.url || '',
    formatName: t.name || '',
    adLink: adLink,
    driveLink: driveLink || '',
    adType: adType || 'Video',
    funnelStage: funnelStage || 'TOF',
    status: mapClickUpStatus(t.status && t.status.status),
    angle: angle,
    persona: persona,
    parentAdId: parentAd || null,
    variationNumber: variationNum || null,
    creativeStructure: getFieldValue(['creative structure', 'structure', 'creative format', 'format category']),
    hookType: getFieldValue(['hook type', 'hooktype', 'hook style', 'hook']),
    productionStyle: getFieldValue(['production style', 'productionstyle', 'production type', 'style']),
    creativeHypothesis: creativeHypothesis,
    adOrigin: 'ClickUp',
    taskType: isProduction ? 'production' : 'format',
    sourceFormatId: sourceFormatId,
    dateCreated: t.date_created ? parseInt(t.date_created, 10) : null
  };
}

function parseClickUpProdTask(t) {
  return {
    id: t.id || ('prod-' + Date.now()),
    name: t.name || '',
    status: mapProdStatus(t.status && t.status.status),
    angle: '',
    persona: '',
    format: '',
    dueDate: t.due_date ? new Date(parseInt(t.due_date, 10)).toISOString().split('T')[0] : ''
  };
}

function mapClickUpStatus(s) {
  if (!s) return 'Untested';
  var lower = s.toLowerCase();
  if (lower === 'winner') return 'Winner';
  if (lower === 'scale') return 'Scale';
  if (lower === 'complete') return 'Complete';
  if (lower === 'testing' || lower === 'in review') return 'Testing';
  if (lower === 'in production' || lower === 'in progress') return 'In Production';
  if (lower === 'ready to launch' || lower === 'ready') return 'Ready to Launch';
  if (lower === 'approved') return 'Approved';
  if (lower === 'loser' || lower === 'closed') return 'Loser';
  return 'Untested';
}

function mapProdStatus(s) {
  if (!s) return 'to do';
  var lower = s.toLowerCase();
  if (lower === 'complete' || lower === 'done' || lower === 'closed') return 'complete';
  if (lower === 'in progress' || lower === 'in review') return 'in progress';
  return 'to do';
}

// ── Smart diff poll — compares ALL fields, only re-renders if something changed ──
var _SYNC_DIFF_FIELDS = ['status','angle','persona','formatName','adLink','driveLink',
  'adType','funnelStage','hookType','creativeStructure','productionStyle','creativeHypothesis'];

// Live poll: now BOTH updates changed fields on existing ads AND imports newly-
// created tasks (e.g. ones you just pushed from the Action Plan, or tasks your
// teammate added directly in ClickUp). Silent by default — toasts only when
// significant changes happen (new tasks or field updates).
function pollFullSync() {
  var activeProd = getActiveProduct();
  if (!CFG.key || !activeProd || !activeProd.clickupListId) return;
  // Don't touch ADS if the in-memory data isn't aligned with the active product
  // (we're mid-switch). A later tick will run when the switch completes.
  if (_adsProductId && _adsProductId !== activeProductId) return;
  if (!_adsProductId) return; // no load has completed yet

  // CAPTURE the product identity at function entry. Below we await a network
  // round-trip to ClickUp (~500ms+); during that window the user may switch
  // products. If we don't re-check, Pass 2 would happily push Product A's
  // tasks into Product B's ADS array — doubling counts on every switch. See
  // the guard inside the .then() below.
  var _startProductId = activeProductId;
  var _startListId = activeProd.clickupListId;

  var dot = document.getElementById('statusDot');
  if (dot) dot.className = 'live-dot syncing';

  // Fetch ALL pages (up to 500 tasks) — same as manual Sync, so we don't miss new tasks beyond page 0
  fetchAllTasks(_startListId)
    .then(function(tasks) {
      // RACE-CONDITION GUARD: verify we're still on the same product before
      // mutating ADS. If the user switched products during the fetch, the
      // fetched tasks belong to a DIFFERENT product's list and must NOT be
      // merged into the current ADS (would create cross-product duplicates).
      if (activeProductId !== _startProductId) {
        if (dot) dot.className = 'live-dot';
        return;
      }
      if (_adsProductId !== _startProductId) {
        if (dot) dot.className = 'live-dot';
        return;
      }
      if (!tasks || !tasks.length) { _onSyncSuccess(dot, 0, false); return; }

      // Build lookup: _clickupId → freshly-parsed task
      var taskMap = {};
      for (var i = 0; i < tasks.length; i++) {
        var parsed = parseClickUpTask(tasks[i]);
        if (parsed._clickupId) taskMap[parsed._clickupId] = parsed;
      }

      // ── Pass 0: repair missing ad._clickupId from MANUAL_ACTIONS ──────
      // When the user pushes an action-plan item to ClickUp, the MANUAL_ACTION
      // is the authoritative source of truth for the ClickUp task ID. The
      // source ad SHOULD have its _clickupId mirrored but can drift (across
      // refresh / stale load). If we don't repair before Pass 1, the task
      // looks "new" and Pass 2 imports it as a duplicate.
      var changed = false;
      for (var mai = 0; mai < MANUAL_ACTIONS.length; mai++) {
        var _ma = MANUAL_ACTIONS[mai];
        if (!_ma || !_ma._clickupId || !_ma._sourceAdId) continue;
        for (var aidx = 0; aidx < ADS.length; aidx++) {
          if (ADS[aidx].id === _ma._sourceAdId && !ADS[aidx]._clickupId) {
            ADS[aidx]._clickupId   = _ma._clickupId;
            ADS[aidx].clickupTaskId = _ma._clickupId;
            changed = true;
            break;
          }
        }
      }

      // ── Pass 1: update existing ads (diff check) ─────────────────────
      var fieldUpdates = 0;
      var existingClickupIds = {};
      for (var i = 0; i < ADS.length; i++) {
        var ad = ADS[i];
        if (!ad._clickupId) continue;
        existingClickupIds[ad._clickupId] = true;
        var fresh = taskMap[ad._clickupId];
        if (!fresh) continue;
        for (var f = 0; f < _SYNC_DIFF_FIELDS.length; f++) {
          var field = _SYNC_DIFF_FIELDS[f];
          var freshVal = fresh[field];
          if (freshVal !== undefined && freshVal !== null && freshVal !== '' && freshVal !== ad[field]) {
            ADS[i][field] = freshVal;
            changed = true;
            fieldUpdates++;
          }
        }
      }

      // ── Pass 2: import NEW tasks (tasks in ClickUp not yet in local ADS) ─────────────
      // Build a set of ClickUp task ids already owned by a MANUAL_ACTION. These were
      // pushed from our Action Plan — the corresponding local AD already exists under
      // its own local serial id (not the ClickUp id), so we must NOT insert a second
      // AD here or we get the duplicate-in-tracker + vanishing-production-flag bug.
      var ownedByManualAction = {};
      for (var _mai2 = 0; _mai2 < MANUAL_ACTIONS.length; _mai2++) {
        var _ma2 = MANUAL_ACTIONS[_mai2];
        if (_ma2 && _ma2._clickupId) ownedByManualAction[_ma2._clickupId] = true;
      }
      var newTaskCount = 0;
      for (var cuid in taskMap) {
        if (!existingClickupIds[cuid]) {
          // Skip duplicates that are already represented by a MANUAL_ACTION.
          // The originating sourceAd is in ADS under its local serial id; the
          // merge-by-_clickupId in Pass 1 will handle any future field updates.
          if (ownedByManualAction[cuid]) {
            existingClickupIds[cuid] = true;
            continue;
          }
          var freshAd = taskMap[cuid];
          // Ensure the id is stable — use the ClickUp task id as the local id,
          // matching the convention used in importTasksFromClickUp.
          if (!freshAd.id) freshAd.id = cuid;
          ADS.push(freshAd);
          // Scoped auto-discover is called once after Pass 2 + Pass 1 below,
          // so it picks up angle/persona changes from existing-ad diffs too.
          newTaskCount++;
          changed = true;
        }
      }

      // Scoped auto-discover runs AFTER Pass 1 (field-updates on existing ads)
      // and Pass 2 (newly-imported tasks) — catches both sources of new
      // taxonomy. Guarded by `_adsProductId === _startProductId` at the top
      // of this .then() block, so ADS is confirmed product-scoped here.
      // Restored 2026-04-21 (option 3). Rollback tag: pre-scoped-autodiscover-2026-04-21.
      var _discovered = autoDiscoverTaxonomy(ADS);
      var _newTaxonomy = _discovered.addedAngles.length + _discovered.addedPersonas.length;
      if (_newTaxonomy > 0) changed = true;

      // ── Pass 2.5: reconcile deletes from ClickUp ──────────────────────────
      // If a local ad has a _clickupId that isn't in the fresh taskMap, the
      // task was likely deleted or archived in ClickUp. Drop it locally so
      // the dashboard stays in sync. Three safety guards so we never
      // accidentally nuke good data:
      //   (a) Skip if the fetch returned suspiciously few tasks — could be a
      //       partial fetch or network issue. Refuse to drop if < 5 tasks.
      //   (b) Skip if the delta would remove more than 40% of local ads in
      //       one shot — that's almost certainly a pagination / fetch bug,
      //       not genuine mass deletion. Warn the user instead.
      //   (c) Never drop ads without _clickupId (local-only, not yet pushed).
      var _fetchedCount = Object.keys(taskMap).length;
      if (_fetchedCount >= 5) {
        var _localWithCid = 0;
        for (var _li2 = 0; _li2 < ADS.length; _li2++) {
          if (ADS[_li2]._clickupId) _localWithCid++;
        }
        var _wouldDrop = [];
        for (var _li3 = 0; _li3 < ADS.length; _li3++) {
          var _ad = ADS[_li3];
          if (_ad._clickupId && !taskMap[_ad._clickupId]) {
            _wouldDrop.push(_ad.id);
          }
        }
        var _dropPct = _localWithCid > 0 ? (_wouldDrop.length / _localWithCid) : 0;
        if (_wouldDrop.length > 0 && _dropPct <= 0.4) {
          var _dropSet = {};
          for (var _dsi = 0; _dsi < _wouldDrop.length; _dsi++) _dropSet[_wouldDrop[_dsi]] = true;
          ADS = ADS.filter(function (a) { return !_dropSet[a.id]; });
          changed = true;
          console.log('[poll] reconciled — dropped', _wouldDrop.length, 'stale ads deleted from ClickUp');
        } else if (_wouldDrop.length > 0 && _dropPct > 0.4) {
          console.warn('[poll] reconcile SKIPPED — would drop', _wouldDrop.length, 'of', _localWithCid,
            '(' + Math.round(_dropPct * 100) + '%) which exceeds 40% safety threshold. Click Sync Now to force reconcile.');
        }
      }

      // ── Pass 3: sync MANUAL_ACTIONS liveStatus ───────────────────────
      for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
        if (MANUAL_ACTIONS[i]._clickupId && taskMap[MANUAL_ACTIONS[i]._clickupId]) {
          var newLive = taskMap[MANUAL_ACTIONS[i]._clickupId].status;
          if (newLive && MANUAL_ACTIONS[i].liveStatus !== newLive) {
            MANUAL_ACTIONS[i].liveStatus = newLive;
            changed = true;
          }
        }
      }

      _onSyncSuccess(dot, fieldUpdates, changed);

      if (changed) {
        // Rebuild matrix if new tasks arrived OR auto-discover added new
        // master-list entries (even without new tasks, e.g. when Pass 1
        // detected that an existing task's angle was changed in ClickUp).
        if (newTaskCount > 0 || _newTaxonomy > 0) initAnglePersonas();
        P = process(ADS);
        buildCreativeUsageIndex();
        deriveWinners();
        genActions();
        populateFilterOptions();
        renderAll();
        saveState();
        // Lightweight toast so the user knows background sync did something
        if (newTaskCount > 0) {
          toast(newTaskCount + ' new task' + (newTaskCount !== 1 ? 's' : '') + ' imported from ClickUp' + (fieldUpdates > 0 ? ' · ' + fieldUpdates + ' field updates' : ''), 'ok');
        } else if (fieldUpdates > 0) {
          toast(fieldUpdates + ' field' + (fieldUpdates !== 1 ? 's' : '') + ' updated from ClickUp', 'ok');
        }
      }
    })
    .catch(function() {
      if (dot) dot.className = 'live-dot err';
      var lbl = document.getElementById('statusLbl');
      if (lbl) lbl.textContent = 'Sync error';
    });
}

function _onSyncSuccess(dot, changedCount, changed) {
  _lastSyncedAt = Date.now();
  if (dot) dot.className = 'live-dot active';
  updateSyncLabel();
}

function updateSyncLabel() {
  var lbl = document.getElementById('statusLbl');
  if (!lbl) return;
  if (!_lastSyncedAt) { lbl.textContent = 'Not synced'; return; }
  var sec = Math.floor((Date.now() - _lastSyncedAt) / 1000);
  if (sec < 5)  { lbl.textContent = 'Live · just now'; return; }
  if (sec < 60) { lbl.textContent = 'Live · ' + sec + 's ago'; return; }
  lbl.textContent = 'Live · ' + Math.floor(sec / 60) + 'm ago';
}

function startAutoSync() {
  // Clear any old intervals (including legacy pollLiveStatus)
  if (_pollingInterval)      { clearInterval(_pollingInterval);      _pollingInterval      = null; }
  if (_autoSyncInterval)     { clearInterval(_autoSyncInterval);     _autoSyncInterval     = null; }
  if (_syncCounterInterval)  { clearInterval(_syncCounterInterval);  _syncCounterInterval  = null; }

  // 30s full diff sync
  _autoSyncInterval = setInterval(pollFullSync, 30000);
  // 1s label counter — ultra-lightweight, just updates a text node
  _syncCounterInterval = setInterval(updateSyncLabel, 1000);

  _autoSyncActive = true;

  var dot = document.getElementById('statusDot');
  if (dot) dot.className = 'live-dot active';
}

function stopAutoSync() {
  if (_autoSyncInterval)    { clearInterval(_autoSyncInterval);    _autoSyncInterval    = null; }
  if (_syncCounterInterval) { clearInterval(_syncCounterInterval); _syncCounterInterval = null; }
  _autoSyncActive = false;
}

// Manual "Sync Now" button — runs full sync + spins the button icon
function triggerManualSync() {
  var btn = document.getElementById('syncNowBtn');
  if (btn) { btn.classList.add('spinning'); setTimeout(function(){ btn.classList.remove('spinning'); }, 500); }
  syncClickUp();
}

// Legacy alias — keeps any old call sites working
function pollLiveStatus() { pollFullSync(); }
function startPolling()    { startAutoSync(); }

