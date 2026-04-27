// ================================================
// deriveInspoStatuses — auto-update inspo status from linked tasks
// ================================================
function deriveInspoStatuses() {
  if (!INSPIRATIONS || !INSPIRATIONS.length || !ADS) return;
  var changed = false;
  INSPIRATIONS.forEach(function(ins) {
    var linked = ADS.filter(function(a) { return a._fromInspoId === ins.id; });
    if (linked.length === 0) return; // no tasks yet — don't change status

    var statuses = linked.map(function(a) { return a.status; });
    var allWinner = statuses.every(function(s) { return s === 'Winner'; });
    var allLoser  = statuses.every(function(s) { return s === 'Loser'; });

    var newStatus = ins.status;
    if (allWinner) {
      newStatus = 'Winner';
    } else if (allLoser) {
      newStatus = 'Loser';
    } else {
      // Mixed or any testing — set to Testing unless already Winner/Loser from a manual override
      if (ins.status !== 'Winner' && ins.status !== 'Loser') {
        newStatus = 'Testing';
      }
    }

    if (newStatus !== ins.status) {
      ins.status = newStatus;
      changed = true;
    }
  });
  if (changed && typeof saveInspirations === 'function') saveInspirations();
}


// ====================================================================
// [split.py] next slice from source file begins below
// ====================================================================

// ── INSPIRATIONS ─────────────────────────────────
var INSPIRATIONS = [];
var INS_NEXT_ID = 1;
var INS_POLL_TIMER = null;
// Legacy bridge URL kept only for backwards compatibility strings;
// all reads/writes now go through DB (Supabase).
var INS_BRIDGE = null;

// Derive a short prefix from the active product name (e.g. "Astro Rekha" → "AR", "Immuvi" → "IM")
function getProductInsPrefix() {
  var ap = getActiveProduct();
  if (!ap) return 'INS';
  if (ap.insPrefix) return ap.insPrefix;
  var words = (ap.name || '').split(/\s+/).filter(Boolean);
  var prefix = words.map(function(w){ return (w[0] || '').toUpperCase(); }).join('').substring(0, 3);
  return prefix || 'INS';
}

// Save: push the full INSPIRATIONS array for the active product to Supabase (debounced, fire-and-forget).
// Captures productId AND a snapshot of INSPIRATIONS at schedule time so a product-switch
// mid-debounce can't move rows to the wrong product.
var _insSaveTimer = null;
function saveInspirations() {
  if (!DB.ready || !activeProductId) return;
  if (_insSaveTimer) clearTimeout(_insSaveTimer);
  var capturedProductId = activeProductId;
  var capturedInspos = INSPIRATIONS.slice(); // shallow snapshot; items are upserted by id
  _insSaveTimer = setTimeout(function () {
    _insSaveTimer = null;
    // Extra guard: if the user switched products during the debounce window,
    // only write if we're still on the same product we scheduled for.
    if (activeProductId !== capturedProductId) return;
    DB.saveInspirations(capturedProductId, capturedInspos).catch(function (e) {
      console.error('[SB] saveInspirations', e);
    });
  }, 600);
}

async function loadInspirations() {
  INSPIRATIONS = [];
  INS_NEXT_ID = 1;
  if (DB.ready && activeProductId) {
    try {
      var rows = await DB.listInspirations(activeProductId);
      INSPIRATIONS = rows || [];
      // Keep INS_NEXT_ID roughly in sync with highest numeric suffix we've seen
      var maxN = 0;
      for (var i = 0; i < INSPIRATIONS.length; i++) {
        var idStr = INSPIRATIONS[i].id || '';
        var m = idStr.match(/(\d+)$/);
        if (m) { var n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
      }
      INS_NEXT_ID = maxN + 1;
    } catch (e) {
      console.error('[SB] loadInspirations', e);
    }
  }
  // Backfill _clickupDocId and _clickupDocPageUrl on existing inspirations that don't have them
  migrateInspirationDocUrls();
  // Re-check dupes against current ADS (silent — render happens in boot sequence)
  if (ADS && ADS.length > 0) refreshAllDupeChecks(false);
  startResultPolling();
  // Queue badge + filter chips + per-product realtime visual feedback. Each
  // function follows the existing "clear before restart" pattern so a product
  // switch cleanly reuses the same globals.
  _injectInspirationStyles();
  _ensureInspirationDom();
  _startInsQueueBadgePolling();
  _subscribeInspirationsRealtime();
}

// One-time migration: set ClickUp doc page URLs for inspirations created before this feature
// Keyed by sourceUrl so it works regardless of old/new ID format
var INS_DOC_URL_MAP = {
  'https://www.facebook.com/ads/library/?id=1958372968091869': {
    docId: '8cq1r3y-33316',
    pageUrl: 'https://app.clickup.com/9016762494/docs/8cq1r3y-33316/8cq1r3y-7896'
  },
  'https://www.instagram.com/p/DXFK3waAPXD/': {
    docId: '8cq1r3y-33316',
    pageUrl: 'https://app.clickup.com/9016762494/docs/8cq1r3y-33316/8cq1r3y-7916'
  }
};

function migrateInspirationDocUrls() {
  var changed = false;
  INSPIRATIONS.forEach(function(ins) {
    if (!ins._clickupDocPageUrl && INS_DOC_URL_MAP[ins.sourceUrl]) {
      ins._clickupDocId = INS_DOC_URL_MAP[ins.sourceUrl].docId;
      ins._clickupDocPageUrl = INS_DOC_URL_MAP[ins.sourceUrl].pageUrl;
      changed = true;
    }
  });
  if (changed) saveInspirations();
}

function detectPlatform(url) {
  if (!url) return 'Other';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'Facebook';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  return 'Other';
}

function platformClass(platform) {
  var map = {Facebook:'fb', Instagram:'ig', TikTok:'tt', YouTube:'yt', Other:'other'};
  return map[platform] || 'other';
}

// Add a single URL to the queue (instant, no processing)
function addToInsQueue() {
  var url = document.getElementById('insUrlInput').value.trim();
  if (!url) { showInsStatus('error', 'Please paste a URL first'); return; }
  if (!url.startsWith('http')) { showInsStatus('error', 'Invalid URL — must start with http'); return; }

  // Check for duplicate
  if (INSPIRATIONS.some(function(i){ return i.sourceUrl === url; })) {
    showInsStatus('error', 'This URL is already in your list');
    return;
  }

  var ins = {
    id: getProductInsPrefix() + '-INS-' + String(INS_NEXT_ID).padStart(3,'0'),
    sourceUrl: url,
    platform: detectPlatform(url),
    brand: '',
    formatName: '',
    creativeUSP: '',
    hookType: '',
    creativeStructure: '',
    productionStyle: '',
    angle: '',
    persona: '',
    funnelStage: 'TOF',
    adType: 'Video',
    status: 'Queued',
    creativeHypothesis: '',
    notes: '',
    bodyCopy: '',
    headline: '',
    ctaText: '',
    landingUrl: '',
    duration_seconds: 0,
    importTags: [],
    reusedIn: [],
    addedAt: Date.now(),
    classifiedAt: null,
    _clickupDocId: '',
    _clickupDocPageUrl: '',
    _anglePromptDone: false,
    _personaPromptDone: false
  };

  INS_NEXT_ID++;
  INSPIRATIONS.unshift(ins);
  saveInspirations();
  renderInspirations();
  document.getElementById('insUrlInput').value = '';
  updateQueueCounter();
  showInsStatus('success', ins.id + ' added to queue — ' + ins.platform);

  // Auto-push ALL queued items to bridge silently (no modal)
  autoPushToBridge();
}

async function autoPushToBridge() {
  // Renamed behavior: push queued items to Supabase `inspiration_queue` table.
  var queued = getQueuedItems();
  if (queued.length === 0) return;
  if (!DB.ready || !activeProductId) return;
  try {
    // Exclude items already classified (Supabase inspiration_results)
    var doneIds = new Set();
    try {
      var existing = await DB.getResults(activeProductId);
      (existing || []).forEach(function (r) { if (r.ins_id) doneIds.add(r.ins_id); });
    } catch (e) { console.error('[SB] getResults', e); }

    var toPush = queued.filter(function (i) { return !doneIds.has(i.id); });
    if (toPush.length === 0) return;

    await DB.enqueueInspirations(activeProductId, toPush.map(function (i) {
      return { id: i.id, url: i.sourceUrl, platform: i.platform };
    }));
  } catch (e) { console.error('[SB] autoPushToBridge', e); }
}

function getQueuedItems() {
  return INSPIRATIONS.filter(function(i){ return i.status === 'Queued'; });
}

function updateQueueCounter() {
  var queued = getQueuedItems().length;
  var countEl = document.getElementById('insQueueCount');
  if (!countEl) return;
  if (queued > 0) {
    countEl.textContent = queued;
    countEl.style.display = 'inline';
  } else {
    countEl.style.display = 'none';
  }
}

// Send queued URLs to bridge + show the "run skill" modal
async function processAllWithClaude() {
  var queued = getQueuedItems();
  if (queued.length === 0) {
    showInsStatus('error', 'No queued URLs. Add URLs first using "+ Add to Queue"');
    return;
  }

  // Re-push to Supabase (auto-push already ran on add; this is a safety-net sync)
  var cloudOk = false;
  try {
    if (DB.ready && activeProductId) {
      var res = await DB.enqueueInspirations(activeProductId, queued.map(function (i) {
        return { id: i.id, url: i.sourceUrl, platform: i.platform };
      }));
      cloudOk = !!(res && res.ok);
    }
  } catch (e) { console.error('[SB] processAllWithClaude', e); }

  // Show modal — user needs to run the skill in Claude
  showProcessModal(queued.length, cloudOk);
}

function showProcessModal(count, bridgeOk) {
  // Remove existing modal
  var old = document.getElementById('insProcessModalOverlay');
  if (old) old.remove();

  var bridgeNote = bridgeOk
    ? '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:0.73rem;color:#059669;">✓ Queue synced to cloud — results will auto-fill when done</div>'
    : '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:0.73rem;color:#92400e;">' +
        '<strong style="display:block;margin-bottom:4px">⚠ Cloud sync failed</strong>' +
        'Check your internet connection and try again. The Supabase project must be reachable.' +
      '</div>';

  var overlay = document.createElement('div');
  overlay.id = 'insProcessModalOverlay';
  overlay.className = 'ins-process-modal';
  overlay.innerHTML =
    '<div class="ins-process-modal-box">' +
      '<h3>Ready to classify ' + count + ' URL' + (count>1?'s':'') + (count>1?' (parallel agents — ~1–3 min total)':' (~1–3 min)') + '</h3>' +
      '<p>Claude will check your live queue, download videos, extract frames, and classify each creative. ' + (count>1?count+' parallel agents run simultaneously for speed.':'') + '</p>' +
      bridgeNote +
      '<div class="ins-cmd-box">' +
        '<span>/classify-inspiration</span>' +
        '<button class="ins-cmd-copy" onclick="copyInsCmd(this)">Copy</button>' +
      '</div>' +
      '<ol class="ins-modal-steps">' +
        '<li><span class="step-num">1</span><span>Copy the command above</span></li>' +
        '<li><span class="step-num">2</span><span>Switch to Claude Code (already open in background)</span></li>' +
        '<li><span class="step-num">3</span><span>Paste and press Enter — skill auto-reads your queue</span></li>' +
        '<li><span class="step-num">4</span><span>Come back here — rows fill in automatically</span></li>' +
      '</ol>' +
      '<div class="ins-modal-footer">' +
        '<button class="btn-ghost" onclick="document.getElementById(\'insProcessModalOverlay\').remove()">Close</button>' +
        '<button class="btn-primary btn-sm" onclick="copyInsCmd(this);document.getElementById(\'insProcessModalOverlay\').remove()">Copy Command &amp; Close</button>' +
      '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function copyInsCmd(btn) {
  navigator.clipboard.writeText('/classify-inspiration').then(function(){
    btn.textContent = 'Copied!';
    setTimeout(function(){ btn.textContent = 'Copy'; }, 2000);
  });
}

// Poll Supabase every 6s for new results and auto-fill rows.
// Realtime subscription handles most updates; this is the safety net.
function startResultPolling() {
  if (INS_POLL_TIMER) clearInterval(INS_POLL_TIMER);
  INS_POLL_TIMER = setInterval(pollCloudResults, 6000);
}

async function pollCloudResults() {
  if (!DB.ready || !activeProductId) return;
  try {
    var results = await DB.getResults(activeProductId);
    if (!results || !results.length) return;
    // Transform Supabase row → legacy result shape expected by applyClassificationResults
    var legacy = results.map(_resultRowToLegacy);
    applyClassificationResults(legacy, true);
  } catch (e) { /* transient network issue is fine */ }
}

// Map Supabase inspiration_results row → the shape applyClassificationResults expects
function _resultRowToLegacy(r) {
  var meta = r.metadata || {};
  var cls = r.classification || {};
  return Object.assign({
    ins_id: r.ins_id,
    source_url: r.source_url,
    platform: r.platform,
    duration_seconds: r.duration_seconds,
    frames_extracted: r.frames_extracted,
    clickup_doc_page_url: r.clickup_doc_page_url,
    clickup_doc_id: r.clickup_doc_id
  }, meta, cls);
}

// Manual "Import Results" button — force a pull from Supabase
async function importClassificationResults() {
  if (!DB.ready || !activeProductId) {
    showInsStatus('error', 'Not connected to cloud');
    return;
  }
  try {
    var results = await DB.getResults(activeProductId);
    if (results && results.length > 0) {
      var legacy = results.map(_resultRowToLegacy);
      var count = applyClassificationResults(legacy, false);
      if (count > 0) {
        showInsStatus('success', count + ' inspiration' + (count > 1 ? 's' : '') + ' classified and imported');
        return;
      }
    }
  } catch (e) { console.error('[SB] importClassificationResults', e); }
  showInsStatus('error', 'No results found. Run /classify-inspiration in Claude Code first.');
}

// ── Smart matching helpers ─────────────────────────
function matchToExisting(incoming, existingArray) {
  if (!incoming || !existingArray.length) return { match: null, score: 0 };

  function normalize(str) {
    return str.toLowerCase()
      .replace(/[\/\|\-\&\+]/g, ' ')   // split on separators
      .replace(/[^a-z0-9\s]/g, '')     // remove punctuation
      .replace(/\s+/g, ' ').trim();
  }
  function tokenize(str) {
    var STOP = new Set(['the','a','an','and','or','of','in','for','to','is','are','was','were','be','been','by','with','from','that','this','it','as','at','on']);
    return normalize(str).split(/\s+/).filter(function(w){ return w.length > 2 && !STOP.has(w); });
  }

  var incNorm   = normalize(incoming);
  var incTokens = tokenize(incoming);
  var best = null, bestScore = 0;

  existingArray.forEach(function(item) {
    var nameNorm   = normalize(item.name);
    var nameTokens = tokenize(item.name);
    var score = 0;

    // 1. Exact
    if (incNorm === nameNorm) { score = 1; }
    // 2. Substring either direction
    else if (incNorm.includes(nameNorm) || nameNorm.includes(incNorm)) { score = 0.85; }
    // 3. Token Jaccard
    if (incTokens.length && nameTokens.length) {
      var nameSet = new Set(nameTokens);
      var incSet  = new Set(incTokens);
      var inter   = incTokens.filter(function(t){ return nameSet.has(t); }).length;
      var allKeys = new Set(incTokens.concat(nameTokens));
      var jaccard = inter / allKeys.size;
      score = Math.max(score, jaccard);
      // Boost: all name tokens present in incoming (subset match)
      if (nameTokens.length >= 2 && nameTokens.every(function(t){ return incSet.has(t); }))
        score = Math.max(score, 0.75);
    }
    if (score > bestScore) { best = item; bestScore = score; }
  });

  return { match: best, score: bestScore };
}

// ── New entity prompt modal ─────────────────────────
function showNewEntityPrompt(type, detectedName, ins, callback) {
  var existing = type === 'Angle' ? ANGLES : PERSONAS;
  var old = document.getElementById('insMatchModalOverlay');
  if (old) old.remove();

  var accentColor = type === 'Angle' ? '#4F46E5' : '#059669';
  var options = existing.map(function(e, i) {
    var statusClass = (e.status||'untested').toLowerCase().replace(/\s+/g,'-');
    return '<label class="ins-match-opt"><input type="radio" name="ins_match_opt" value="' + i + '"> Map to existing: <strong>' + esc(e.name) + '</strong><span class="bdg ' + statusClass + '" style="margin-left:auto;font-size:0.62rem">' + esc(e.status||'Untested') + '</span></label>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'insMatchModalOverlay';
  overlay.className = 'ins-match-modal';
  overlay.innerHTML =
    '<div class="ins-match-box">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + accentColor + ';flex-shrink:0"></span>' +
        '<h4 style="margin:0;font-size:0.9rem;font-weight:700">New ' + type + ' Detected</h4>' +
      '</div>' +
      '<p style="font-size:0.75rem;color:var(--t2);margin-bottom:8px">Claude found a ' + type.toLowerCase() + ' that doesn\'t match any existing one:</p>' +
      '<div class="ins-match-detected" style="border-left:3px solid ' + accentColor + '">"' + esc(detectedName) + '"</div>' +
      '<p style="font-size:0.72rem;color:var(--t2);margin-top:12px;margin-bottom:6px">What would you like to do?</p>' +
      '<div class="ins-match-options">' +
        '<label class="ins-match-opt" style="border:1.5px solid ' + accentColor + ';background:rgba(79,70,229,0.04)">' +
          '<input type="radio" name="ins_match_opt" value="new" checked> ' +
          '<div><strong>Add as new ' + type + '</strong><div style="font-size:0.68rem;color:var(--t2);margin-top:2px">Appears in ' + type + 's tab as "Not Tested"</div></div>' +
        '</label>' +
        options +
        '<label class="ins-match-opt">' +
          '<input type="radio" name="ins_match_opt" value="custom"> ' +
          '<div><strong>Keep as custom label</strong><div style="font-size:0.68rem;color:var(--t2);margin-top:2px">Stays on this inspiration only — not added to ' + type + 's</div></div>' +
        '</label>' +
      '</div>' +
      '<div class="ins-match-footer">' +
        '<button class="btn-ghost" onclick="skipInsMatch(\'' + escAttr(type) + '\', \'' + escAttr(detectedName) + '\')">Skip</button>' +
        '<button class="btn-primary btn-sm" onclick="confirmInsMatch(\'' + escAttr(type) + '\', \'' + escAttr(detectedName) + '\')">Confirm</button>' +
      '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  window._insMatchCallback = callback;
  window._insMatchExisting = existing;
}

function confirmInsMatch(type, detectedName) {
  var selected = document.querySelector('input[name="ins_match_opt"]:checked');
  if (!selected) return;
  var val = selected.value;
  var existing = window._insMatchExisting || [];
  var chosenName, isNew;
  if (val === 'new') {
    chosenName = detectedName;
    isNew = true;
  } else if (val === 'custom') {
    chosenName = detectedName;
    isNew = false;
  } else {
    chosenName = existing[parseInt(val)].name;
    isNew = false;
  }
  document.getElementById('insMatchModalOverlay').remove();
  if (window._insMatchCallback) window._insMatchCallback(chosenName, isNew);
}

// Skip = keep raw label as-is, but mark as handled so popup never re-fires
function skipInsMatch(type, detectedName) {
  document.getElementById('insMatchModalOverlay').remove();
  // Call callback with raw label and isNew=false — marks _anglePromptDone/_personaPromptDone=true
  if (window._insMatchCallback) window._insMatchCallback(detectedName, false);
}

// ── Duplicate creative detection (4-level) ───────────────────────
// Returns true iff this call actually mutated `ins`, so callers can skip
// a persistence round-trip when the computed dupe state matches what's
// already on the object. Prevents a spurious `saveInspirations()` on every
// page load (refreshAllDupeChecks ran this on every classified row).
function checkDuplicateCreative(ins) {
  if (!ins.angle && !ins.persona) return false;

  var norm = function(s){ return (s||'').toLowerCase().trim(); };
  var wordOverlap = function(a, b) {
    if (!a || !b) return false;
    var wa = norm(a).split(/\s+/), wb = norm(b).split(/\s+/);
    return wa.some(function(w){ return w.length > 3 && wb.includes(w); });
  };

  var insAngle   = norm(ins.angle);
  var insPersona = norm(ins.persona);
  var insFunnel  = norm(ins.funnelStage);
  var insHook    = norm(ins.hookType);
  var insStruct  = norm(ins.creativeStructure);

  var exactMatches = [], comboMatches = [], formatMatches = [];

  ADS.forEach(function(ad) {
    var adAngle   = norm(ad.angle);
    var adPersona = norm(ad.persona);
    var adFunnel  = norm(ad.funnelStage);
    var adHook    = norm(ad.hookType);
    var adStruct  = norm(ad.creativeStructure);

    var sameAngle   = insAngle   && adAngle   && (insAngle === adAngle   || wordOverlap(insAngle, adAngle));
    var samePersona = insPersona && adPersona && (insPersona === adPersona || wordOverlap(insPersona, adPersona));
    var sameFunnel  = insFunnel  && adFunnel  && insFunnel === adFunnel;
    var sameHook    = insHook    && adHook    && insHook === adHook;
    var sameStruct  = insStruct  && adStruct  && insStruct === adStruct;

    var entry = { id: ad.id, name: ad.formatName || ad.id, status: ad.status };

    if (sameAngle && samePersona && sameFunnel) {
      exactMatches.push(Object.assign({}, entry, { matchType: 'exact' }));
    } else if (sameAngle && samePersona) {
      comboMatches.push(Object.assign({}, entry, { matchType: 'combo' }));
    } else if (sameHook && sameStruct && (sameAngle || samePersona)) {
      formatMatches.push(Object.assign({}, entry, { matchType: 'format' }));
    }
  });

  var allMatches = exactMatches.concat(comboMatches).concat(formatMatches);
  if (!allMatches.length) {
    // Clear any old dupe data — only count as "changed" if something was there to clear.
    var hadData = ins._dupeType !== undefined
               || ins._dupeSimilar !== undefined
               || ins._dupeDetail !== undefined;
    if (hadData) {
      delete ins._dupeType; delete ins._dupeSimilar; delete ins._dupeDetail;
      return true;
    }
    return false;
  }

  var hasWinner = allMatches.some(function(d){ return d.status === 'Winner' || d.status === 'Scale'; });
  var hasLoser  = allMatches.some(function(d){ return d.status === 'Loser'; });
  var dupeType  = hasWinner ? 'winner' : hasLoser ? 'loser' : 'tested';
  var dupeDetail;

  if (exactMatches.length) {
    dupeDetail = 'Exact match — same angle + persona + funnel stage already in Creative Tracker';
  } else if (comboMatches.length) {
    dupeDetail = 'This angle × persona combo has ' + comboMatches.length + ' existing creative' + (comboMatches.length > 1 ? 's' : '') + ' (different funnel stage)';
  } else {
    dupeDetail = 'Similar hook + structure format used in another creative for this angle/persona';
  }

  var newSimilar = allMatches.slice(0, 4);
  var changed = false;
  if (ins._dupeType !== dupeType) { ins._dupeType = dupeType; changed = true; }
  if (JSON.stringify(ins._dupeSimilar) !== JSON.stringify(newSimilar)) {
    ins._dupeSimilar = newSimilar;
    changed = true;
  }
  if (ins._dupeDetail !== dupeDetail) { ins._dupeDetail = dupeDetail; changed = true; }
  // Reset dismissed state when dupe data refreshes (new match found)
  if (ins._dupeBannerDismissed) { ins._dupeBannerDismissed = false; changed = true; }
  return changed;
}

// Run dupe check on ALL classified inspirations (called on load + product switch).
// Only persists if at least one row actually changed — prevents the pre-fix behavior
// where every page load fired a full `POST /rest/v1/inspirations` upsert.
function refreshAllDupeChecks(saveAndRender) {
  var anyChanged = false;
  INSPIRATIONS.forEach(function(ins) {
    if (ins.status === 'Classified' || ins.status === 'Approved') {
      if (checkDuplicateCreative(ins) === true) anyChanged = true;
    }
  });
  if (saveAndRender) {
    if (anyChanged) saveInspirations();
    renderInspirations();
  } else if (anyChanged) {
    saveInspirations();
  }
}

// ── Dismiss dupe banner ─────────────────────────────
function clearInsDupe(id) {
  // Dismiss banner only — keep dupe data so the dot indicator stays
  var ins = INSPIRATIONS.find(function(i){ return i.id === id; });
  if (!ins) return;
  ins._dupeBannerDismissed = true;
  saveInspirations(); renderInspirations();
}

function toggleDupeBanner(id) {
  var ins = INSPIRATIONS.find(function(i){ return i.id === id; });
  if (!ins || !ins._dupeType) return;
  ins._dupeBannerOpen = !ins._dupeBannerOpen; // collapsed by default, opens on click
  saveInspirations(); renderInspirations();
}

// ── Inline field update ─────────────────────────────
function updateInsField(id, field, value) {
  var ins = INSPIRATIONS.find(function(i){ return i.id === id; });
  if (!ins) return;
  ins[field] = value;
  saveInspirations();
  // Don't re-render to avoid losing focus — just update silently
}

// ── Approved inspirations helper ────────────────────
function getApprovedInspirations() {
  return INSPIRATIONS.filter(function(i){ return i.status === 'Approved'; });
}

function applyClassificationResults(results, isPolling) {
  var updated = 0;
  var pendingPrompts = [];

  results.forEach(function(data) {
    // Find by ins_id or sourceUrl
    var ins = INSPIRATIONS.find(function(i){
      return (data.ins_id && i.id === data.ins_id) || i.sourceUrl === data.source_url;
    });
    if (!ins) return;
    // Skip only if fully classified — allow re-processing if mapping was deferred
    if (ins.status === 'Classified' && !ins._needsAngleReview && !ins._needsPersonaReview) return;

    ins.brand             = data.page_name || ins.brand || '';
    ins.formatName        = extractFormatName(data.creative_usp || '');
    ins.creativeUSP       = data.creative_usp || '';
    ins.hookType          = normalizeToOption(data.hook_type || '', HOOK_TYPES);
    ins.creativeStructure = normalizeToOption(data.creative_structure || '', CREATIVE_STRUCTURES);
    ins.productionStyle   = normalizeToOption(data.production_style || '', PRODUCTION_STYLES);
    ins.funnelStage       = normalizeToOption(data.funnel_type || 'TOF', FUNNEL_STAGES);
    ins.adType            = normalizeToOption(data.photo_video || data.ad_type || 'Video', AD_TYPES);
    ins.creativeHypothesis= data.creative_hypothesis || '';
    ins.notes             = data.notes || '';
    ins.bodyCopy          = data.body_text || '';
    ins.headline          = data.title || '';
    ins.ctaText           = data.cta_text || '';
    ins.landingUrl        = data.landing_url || '';
    ins.duration_seconds  = data.duration_seconds || 0;
    ins.bodyCopy          = data.body_copy_from_frames || data.body_text || ins.bodyCopy || '';
    ins.status            = 'Classified';
    ins.classifiedAt      = Date.now();
    // Save ClickUp doc page URL if generated by skill (hidden — shows as Brief link)
    if (data.clickup_doc_page_url) {
      ins._clickupDocPageUrl  = data.clickup_doc_page_url;
      ins._clickupDocId       = data.clickup_doc_id || '';
      ins._inspoDocCreated    = true; // internal flag — not shown in UI
    }

    // Angle matching
    if (data.angle_matched) {
      ins.angle = data.angle || '';
      ins._anglePromptDone = true;
      ins._needsAngleReview = false;
    } else {
      var angleResult = matchToExisting(data.angle || '', ANGLES);
      if (angleResult.match && angleResult.score >= 0.4) {
        ins.angle = angleResult.match.name; // auto-map to confident match
        ins._anglePromptDone = true;
        ins._needsAngleReview = false;
      } else if (data.angle) {
        ins.angle = data.angle; // keep raw label
        ins._needsAngleReview = true; // flag for "Map Fields" button
        if (!isPolling && !ins._anglePromptDone) {
          pendingPrompts.push({ type: 'Angle', detectedName: data.angle, ins: ins });
        }
      }
    }

    // Persona matching
    if (data.persona_matched) {
      ins.persona = data.persona || '';
      ins._personaPromptDone = true;
      ins._needsPersonaReview = false;
    } else {
      var personaResult = matchToExisting(data.persona || '', PERSONAS);
      if (personaResult.match && personaResult.score >= 0.4) {
        ins.persona = personaResult.match.name; // auto-map to confident match
        ins._personaPromptDone = true;
        ins._needsPersonaReview = false;
      } else if (data.persona) {
        ins.persona = data.persona;
        ins._needsPersonaReview = true; // flag for "Map Fields" button
        if (!isPolling && !ins._personaPromptDone) {
          pendingPrompts.push({ type: 'Persona', detectedName: data.persona, ins: ins });
        }
      }
    }

    updated++;
  });

  if (updated > 0) {
    saveInspirations();
    renderInspirations();
    if (isPolling) {
      showInsStatus('success', updated + ' inspiration' + (updated>1?'s':'') + ' classified');
      // Clean up consumed results from Supabase so we don't re-apply them
      if (DB.ready && activeProductId) {
        DB.clearResults(activeProductId).catch(function(){});
      }
    }
    // Re-run dupe checks for all classified (picks up newly classified + existing)
    refreshAllDupeChecks(true);
  }

  // Show new-entity popups one by one (only fires when score=0, only once per field)
  if (pendingPrompts.length > 0) {
    (function showNext(idx) {
      if (idx >= pendingPrompts.length) return;
      var p = pendingPrompts[idx];
      showNewEntityPrompt(p.type, p.detectedName, p.ins, function(chosenName, isNew) {
        p.ins[p.type.toLowerCase()] = chosenName;
        // Mark as handled and clear review flags
        if (p.type === 'Angle')   { p.ins._anglePromptDone = true;   p.ins._needsAngleReview = false; }
        if (p.type === 'Persona') { p.ins._personaPromptDone = true; p.ins._needsPersonaReview = false; }
        if (isNew) addEntityFromInspiration(p.type, chosenName, p.ins);
        saveInspirations();
        renderInspirations();
        showNext(idx + 1);
      });
    })(0);
  }

  return updated;
}

// ── Auto-add new Angle or Persona from inspiration ──────────────
function addEntityFromInspiration(type, name, ins) {
  var isAngle = type === 'Angle';
  var arr = isAngle ? ANGLES : PERSONAS;
  // Avoid exact duplicates
  if (arr.some(function(e){ return e.name.toLowerCase().trim() === name.toLowerCase().trim(); })) return;
  var prefix = isAngle ? 'ang' : 'per';
  var newEntity = {
    id: prefix + '-' + (arr.length + 1),
    name: name,
    status: 'Untested',
    sourceLink: ins.sourceUrl || '',
    notes: 'Auto-added from inspiration ' + ins.id
  };
  arr.push(newEntity);
  P = process(ADS);
  renderAngles();
  renderPersonas();
  updateTabCounts();
  saveState();
  toast('Added new ' + type + ': ' + name + ' — check the ' + type + 's tab', 'ok');
}

// ── Re-trigger mapping popup for a specific inspiration ──────────
function remapInspirationFields(insId) {
  var ins = INSPIRATIONS.find(function(i){ return i.id === insId; });
  if (!ins) return;
  var prompts = [];
  if (ins._needsAngleReview || !ins.angle || !ANGLES.some(function(a){ return a.name === ins.angle; })) {
    prompts.push({ type: 'Angle', detectedName: ins.angle || '', ins: ins });
  }
  if (ins._needsPersonaReview || !ins.persona || !PERSONAS.some(function(p){ return p.name === ins.persona; })) {
    prompts.push({ type: 'Persona', detectedName: ins.persona || '', ins: ins });
  }
  if (!prompts.length) {
    toast('All fields already mapped for ' + insId, 'ok');
    return;
  }
  (function showNext(idx) {
    if (idx >= prompts.length) return;
    var p = prompts[idx];
    showNewEntityPrompt(p.type, p.detectedName, p.ins, function(chosenName, isNew) {
      p.ins[p.type.toLowerCase()] = chosenName;
      if (p.type === 'Angle')   { p.ins._anglePromptDone = true;   p.ins._needsAngleReview = false; }
      if (p.type === 'Persona') { p.ins._personaPromptDone = true; p.ins._needsPersonaReview = false; }
      if (isNew) addEntityFromInspiration(p.type, chosenName, p.ins);
      saveInspirations();
      renderInspirations();
      showNext(idx + 1);
    });
  })(0);
}

// ── Normalize classifier output to match exact dropdown values ──
function normalizeToOption(value, optionsArray) {
  if (!value) return '';
  var v = value.trim();
  // 1. Exact match
  if (optionsArray.indexOf(v) !== -1) return v;
  // 2. Case-insensitive exact
  var vLow = v.toLowerCase();
  for (var i = 0; i < optionsArray.length; i++) {
    if (optionsArray[i].toLowerCase() === vLow) return optionsArray[i];
  }
  // 3. Normalize slashes/pluses (remove surrounding spaces) and retry
  var vNorm = v.replace(/\s*\/\s*/g, '/').replace(/\s*\+\s*/g, '+').replace(/\s*-\s*/g, '-').toLowerCase();
  for (var j = 0; j < optionsArray.length; j++) {
    var oNorm = optionsArray[j].replace(/\s*\/\s*/g, '/').replace(/\s*\+\s*/g, '+').replace(/\s*-\s*/g, '-').toLowerCase();
    if (oNorm === vNorm) return optionsArray[j];
  }
  // 4. No match — return original (will render as custom text, user can fix)
  return v;
}

function extractFormatName(usp) {
  if (!usp) return '';
  var dash = usp.indexOf(' \u2014');
  return dash > 0 ? usp.substring(0, dash).trim() : usp;
}

function showInsStatus(type, msg) {
  var el = document.getElementById('insStatusIndicator');
  if (!el) return;
  el.className = 'ins-status-indicator ' + type;
  el.innerHTML = (type==='loading'?'<div class="spinner" style="display:block;border-color:rgba(29,78,216,0.3);border-top-color:#1d4ed8;width:14px;height:14px;"></div>':'') + '<span>' + msg + '</span>';
  el.style.display = '';
  if (type !== 'loading') setTimeout(function(){ el.style.display='none'; }, 5000);
}

async function checkBridgeStatus() {
  // Badge now reflects Supabase connectivity rather than the defunct local bridge.
  var badge = document.getElementById('insServerBadge');
  if (!badge) return;
  badge.className = 'ins-server-badge checking';
  badge.textContent = '● checking';
  if (!DB.ready) {
    badge.className = 'ins-server-badge offline';
    badge.textContent = '● cloud offline';
    return;
  }
  try {
    // Lightweight connectivity probe: count products
    var { error } = await SB.from('products').select('id', { count: 'exact', head: true });
    if (error) throw error;
    badge.className = 'ins-server-badge online';
    badge.textContent = '● cloud online';
  } catch (e) {
    badge.className = 'ins-server-badge offline';
    badge.textContent = '● cloud offline';
  }
}

// ── Inspiration cell tooltip ──────────────────────────────────
function showInsTooltip(el, text) {
  if (!text || text === '—' || !text.trim()) return;
  var tip = document.getElementById('insTooltip');
  if (!tip) return;
  tip.textContent = text;
  tip.style.display = 'block';
  var rect = el.getBoundingClientRect();
  var left = rect.left;
  if (left + 360 > window.innerWidth - 12) left = window.innerWidth - 372;
  if (left < 8) left = 8;
  var top = rect.bottom + 6;
  if (top + 180 > window.innerHeight) top = rect.top - 8 - (tip.offsetHeight || 80);
  tip.style.left = left + 'px';
  tip.style.top  = top + 'px';
}
// Reads text from data-tooltip attribute (avoids inline string escaping issues)
function showInsTip(el) {
  showInsTooltip(el, el.getAttribute('data-tooltip') || el.innerText || '');
}
function hideInsTooltip() {
  var tip = document.getElementById('insTooltip');
  if (tip) tip.style.display = 'none';
}

function renderInspirations() {
  // Idempotent: ensures style block + queue badge + filter chips exist
  _injectInspirationStyles();
  _ensureInspirationDom();

  var platform = (document.getElementById('insFiltPlatform')||{}).value || '';
  var format   = (document.getElementById('insFiltFormat')||{}).value || '';
  var status   = (document.getElementById('insFiltStatus')||{}).value || '';
  var hook     = (document.getElementById('insFiltHook')||{}).value || '';
  var search   = ((document.getElementById('insFiltSearch')||{}).value || '').toLowerCase();
  var chip     = _insChipFilter || 'all';

  var filtered = INSPIRATIONS.filter(function(ins) {
    if (platform && ins.platform !== platform) return false;
    if (format && ins.formatName !== format) return false;
    if (status && ins.status !== status) return false;
    if (hook && ins.hookType !== hook) return false;
    if (chip === 'TOF' || chip === 'MOF' || chip === 'BOF') {
      if (ins.funnelStage !== chip) return false;
    } else if (chip === 'review') {
      if (!ins._needsAngleReview && !ins._needsPersonaReview) return false;
    }
    if (search) {
      var hay = [ins.brand,ins.angle,ins.persona,ins.creativeUSP,ins.notes,ins.sourceUrl].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  var tbody = document.getElementById('insTbody');
  var empty = document.getElementById('insEmpty');
  if (!tbody) return;

  var countEl = document.getElementById('inspirationCount');
  if (countEl) countEl.textContent = INSPIRATIONS.length;
  updateQueueCounter();

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      // Truly-empty (no rows + no queued items) → animated card.
      // Filter-empty → simple muted "no matches" line.
      if (INSPIRATIONS.length === 0) {
        empty.className = 'ins-empty ins-empty-card';
        empty.innerHTML =
          '<div class="ins-empty-icon">🎬</div>' +
          '<div class="ins-empty-title">No inspirations yet</div>' +
          '<div class="ins-empty-body">Paste a competitor ad URL above and click + Add to Queue</div>';
      } else {
        empty.className = 'ins-empty';
        empty.innerHTML =
          '<div class="ins-empty-title">No matches for current filters</div>' +
          '<div class="ins-empty-sub">Try clearing platform / status / chip filters</div>';
      }
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = filtered.map(function(ins) {
    var fmtParts = (ins.creativeUSP || '').split(' \u2014 ');
    var fmtName   = fmtParts[0] || ins.formatName || '\u2014';
    var fmtDetail = fmtParts[1] || '';
    // Reuse count = local uses + products that imported this inspiration
    var localUses  = (ins.reusedIn || []).length;
    var crossImports = (ins._crossProductImports || []).length;
    var totalReuse = localUses + crossImports;
    var reuseTitle = crossImports > 0
      ? 'Used locally ' + localUses + 'x · imported by ' + crossImports + ' other product' + (crossImports>1?'s':'')
      : 'Used ' + localUses + ' time' + (localUses>1?'s':'');
    var reuseBadge = totalReuse > 0
      ? '<span class="ins-reuse-pill active" title="'+escAttr(reuseTitle)+'">'+totalReuse+' product'+(totalReuse>1?'s':'')+'</span>'
      : '<span class="ins-reuse-pill" title="Not yet used">0</span>';
    var funnelColor = ins.funnelStage==='TOF'?'#6366f1':ins.funnelStage==='MOF'?'#f59e0b':'#10b981';
    var isQueued = ins.status === 'Queued';
    var insId = ins.id;
    var insIdQ = '\'' + escAttr(insId) + '\'';

    // Build angle select — if ins.angle isn't in the product's taxonomy
    // (common for cross-niche inspiration ads), surface the raw value as
    // its own selected option so the cell is readable instead of "— custom —".
    var angleHasMatch = ANGLES.some(function(a){ return a.name === ins.angle; });
    var angleOpts = ANGLES.map(function(a){
      return '<option value="'+escAttr(a.name)+'"'+(ins.angle===a.name?' selected':'')+'>'+esc(a.name)+'</option>';
    }).join('');
    if (ins.angle && !angleHasMatch) {
      angleOpts += '<option value="'+escAttr(ins.angle)+'" selected>'+esc(ins.angle)+'</option>';
    }

    // Build persona select — same fallback as angle.
    var personaHasMatch = PERSONAS.some(function(p){ return p.name === ins.persona; });
    var personaOpts = PERSONAS.map(function(p){
      return '<option value="'+escAttr(p.name)+'"'+(ins.persona===p.name?' selected':'')+'>'+esc(p.name)+'</option>';
    }).join('');
    if (ins.persona && !personaHasMatch) {
      personaOpts += '<option value="'+escAttr(ins.persona)+'" selected>'+esc(ins.persona)+'</option>';
    }

    // Build structure select — same fallback for off-taxonomy values.
    var structureHasMatch = CREATIVE_STRUCTURES.indexOf(ins.creativeStructure) !== -1;
    var structureOpts = [''].concat(CREATIVE_STRUCTURES).map(function(s){
      return '<option value="'+escAttr(s)+'"'+(ins.creativeStructure===s?' selected':'')+'>'+esc(s||'—')+'</option>';
    }).join('');
    if (ins.creativeStructure && !structureHasMatch) {
      structureOpts += '<option value="'+escAttr(ins.creativeStructure)+'" selected>'+esc(ins.creativeStructure)+'</option>';
    }

    // Build hook select
    var hookOpts = [''].concat(HOOK_TYPES).map(function(h){
      return '<option value="'+escAttr(h)+'"'+(ins.hookType===h?' selected':'')+'>'+esc(h||'—')+'</option>';
    }).join('');

    // Build production style select
    var prodOpts = [''].concat(PRODUCTION_STYLES).map(function(s){
      return '<option value="'+escAttr(s)+'"'+(ins.productionStyle===s?' selected':'')+'>'+esc(s||'—')+'</option>';
    }).join('');

    // Build funnel select
    var funnelOpts = FUNNEL_STAGES.map(function(f){
      return '<option value="'+escAttr(f)+'"'+(ins.funnelStage===f?' selected':'')+'>'+esc(f)+'</option>';
    }).join('');

    // Build ad type select
    var adTypeOpts = AD_TYPES.map(function(t){
      return '<option value="'+escAttr(t)+'"'+(ins.adType===t?' selected':'')+'>'+esc(t)+'</option>';
    }).join('');

    // Build tags pills
    var tagPills = '';
    if (ins.importTags && ins.importTags.length > 0) {
      tagPills = ins.importTags.map(function(t){ return '<span class="ins-tag-pill imported">'+esc(t)+'</span>'; }).join('');
    } else {
      tagPills = '\u2014';
    }

    // Truncated ad copy
    var bodyCopyTrunc = ins.bodyCopy ? (ins.bodyCopy.length > 80 ? ins.bodyCopy.substring(0, 80) + '\u2026' : ins.bodyCopy) : '\u2014';

    // Source URL truncated
    var srcUrlDisp = ins.sourceUrl ? (ins.sourceUrl.length > 40 ? ins.sourceUrl.substring(0, 40) + '\u2026' : ins.sourceUrl) : '';

    var dupeDot = ins._dupeType
      ? '<button class="ins-dupe-dot ' + ins._dupeType + '" onclick="toggleDupeBanner(' + insIdQ + ')" title="' + ({ winner:'Similar ad WON — click to see', loser:'Similar ad LOST — click to see', tested:'Similar ad exists — click to see' }[ins._dupeType]||'Duplicate detected') + '">!</button>'
      : '';

    var mainRow = '<tr data-ins-id="'+escAttr(insId)+'">' +
      // 1. #
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.65rem;color:var(--t3);white-space:nowrap">'+esc(ins.id)+dupeDot+'</td>' +
      // 2. Format Name
      '<td class="ins-usp-cell">' +
        (isQueued
          ? '<span class="ins-usp-detail" style="color:var(--t3);font-style:italic">Pending classification...</span>' +
            '<a href="'+escAttr(ins.sourceUrl)+'" target="_blank" class="ins-link" style="font-size:0.65rem;display:block;margin-top:2px">'+esc(ins.sourceUrl.length>50?ins.sourceUrl.substring(0,50)+'...':ins.sourceUrl)+'</a>'
          : '<span class="ins-usp-format" contenteditable="true" onblur="updateInsField('+insIdQ+',\'formatName\',this.textContent.trim())">'+esc(fmtName)+'</span>' +
            (fmtDetail ? '<span class="ins-usp-detail ins-txt-clamp" data-tooltip="'+escAttr(fmtDetail)+'" onmouseenter="showInsTip(this)" onmouseleave="hideInsTooltip()">'+esc(fmtDetail)+'</span>' : '')
        ) +
      '</td>' +
      // 3-16: show dashes for queued rows, editable fields for classified rows
      (isQueued
        ? '<td>\u2014</td><td>\u2014</td><td>\u2014</td><td>\u2014</td><td>\u2014</td><td>\u2014</td><td>\u2014</td><td>\u2014</td>' +
          '<td><span class="ins-platform-badge '+platformClass(ins.platform)+'">'+esc(ins.platform||'Other')+'</span></td>' +
          '<td>\u2014</td><td>\u2014</td><td>\u2014</td><td><a href="'+escAttr(ins.sourceUrl)+'" target="_blank" class="ins-link">'+esc(srcUrlDisp)+'&#8599;</a></td><td>\u2014</td>'
        :
      // 3. Brand
      '<td style="font-size:0.73rem;font-weight:500;white-space:nowrap">'+esc(ins.brand||'\u2014')+'</td>' +
      // 4. Angle
      '<td>' +
        (ins._needsAngleReview ? '<span title="Needs mapping" style="color:#f59e0b;font-size:0.6rem;margin-right:2px;cursor:pointer" onclick="remapInspirationFields('+insIdQ+')">⚠</span>' : '') +
        '<select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'angle\',this.value)">'+angleOpts+'</select>' +
      '</td>' +
      // 5. Persona
      '<td>' +
        (ins._needsPersonaReview ? '<span title="Needs mapping" style="color:#f59e0b;font-size:0.6rem;margin-right:2px;cursor:pointer" onclick="remapInspirationFields('+insIdQ+')">⚠</span>' : '') +
        '<select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'persona\',this.value)">'+personaOpts+'</select>' +
      '</td>' +
      // 6. Structure
      '<td><select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'creativeStructure\',this.value)">'+structureOpts+'</select></td>' +
      // 7. Hook
      '<td><select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'hookType\',this.value)">'+hookOpts+'</select></td>' +
      // 8. Production
      '<td><select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'productionStyle\',this.value)">'+prodOpts+'</select></td>' +
      // 9. Funnel
      '<td><select class="ins-inline-select" style="color:'+funnelColor+'" onchange="updateInsField('+insIdQ+',\'funnelStage\',this.value)">'+funnelOpts+'</select></td>' +
      // 10. Ad Type
      '<td><select class="ins-inline-select" onchange="updateInsField('+insIdQ+',\'adType\',this.value)">'+adTypeOpts+'</select></td>' +
      // 11. Platform
      '<td><span class="ins-platform-badge '+platformClass(ins.platform)+'">'+esc(ins.platform||'Other')+'</span></td>' +
      // 12. Hypothesis
      '<td class="ins-hypothesis">' +
        '<span class="ins-txt-clamp" contenteditable="true"' +
          ' onmouseenter="showInsTooltip(this,this.innerText)" onmouseleave="hideInsTooltip()"' +
          ' onfocus="this.classList.remove(\'ins-txt-clamp\');hideInsTooltip()"' +
          ' onblur="this.classList.add(\'ins-txt-clamp\');updateInsField('+insIdQ+',\'creativeHypothesis\',this.textContent.trim())"' +
        '>'+esc(ins.creativeHypothesis||'')+'</span>' +
      '</td>' +
      // 13. Notes
      '<td style="font-size:0.68rem;color:var(--t2);max-width:160px">' +
        '<span class="ins-txt-clamp" contenteditable="true"' +
          ' onmouseenter="showInsTooltip(this,this.innerText)" onmouseleave="hideInsTooltip()"' +
          ' onfocus="this.classList.remove(\'ins-txt-clamp\');hideInsTooltip()"' +
          ' onblur="this.classList.add(\'ins-txt-clamp\');updateInsField('+insIdQ+',\'notes\',this.textContent.trim())"' +
        '>'+esc(ins.notes||'\u2014')+'</span>' +
      '</td>' +
      // 14. Ad Copy (read-only — clamp + hover tooltip)
      '<td style="font-size:0.68rem;color:var(--t2);max-width:180px">' +
        '<span class="ins-txt-clamp" data-tooltip="'+escAttr(ins.bodyCopy||'')+'"' +
          ' onmouseenter="showInsTip(this)" onmouseleave="hideInsTooltip()"' +
        '>'+esc(bodyCopyTrunc)+'</span>' +
      '</td>' +
      // 15. Source Link
      '<td><a href="'+escAttr(ins.sourceUrl)+'" target="_blank" class="ins-link">'+esc(srcUrlDisp)+'&#8599;</a></td>' +
      // 16. Duration
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.68rem;color:var(--t3);white-space:nowrap">'+(ins.duration_seconds ? esc(String(ins.duration_seconds))+'s' : '\u2014')+'</td>'
      ) +
      // 17. Status — styled pill + classifiedAt relative timestamp
      (function(){
        var raw = ins.status || 'Saved';
        var key = String(raw).toLowerCase();
        var pillCls = 'saved';
        if (key === 'processing') pillCls = 'processing';
        else if (key === 'classified' || key === 'approved' || key === 'winner' || key === 'scale') pillCls = 'classified';
        else if (key === 'error' || key === 'failed' || key === 'loser') pillCls = (key === 'error' || key === 'failed') ? 'error' : 'classified';
        var rel = ins.classifiedAt ? '<div class="ins-rel-ts">'+esc(_insRelTime(ins.classifiedAt))+'</div>' : '';
        return '<td><span class="ins-status-pill '+pillCls+'">'+esc(raw)+'</span>'+rel+'</td>';
      })() +
      // 18. Cells Used
      (function(){
        var cellTasks = ADS.filter(function(a){ return a._fromInspoId === ins.id; });
        var cnt = cellTasks.length;
        if (cnt === 0) {
          return '<td><span class="ins-cells-badge no-cells">\u2014</span></td>';
        }
        return '<td><button class="ins-cells-badge has-cells" onclick="showInspoCellsPopup(\''+escAttr(ins.id)+'\')" title="View '+cnt+' task'+(cnt>1?'s':'')+' created from this inspo">'+cnt+' task'+(cnt>1?'s':'')+'</button></td>';
      })() +
      // 19. Brief (ClickUp Doc link — resolves cross-product sources)
      (function(){
        var brief = resolveInspoBriefUrl(ins);
        if (brief) {
          var isTask = brief.label.indexOf('Task') !== -1;
          var bg  = isTask ? '#fef3c7' : '#ede9fe';
          var clr = isTask ? '#92400e' : '#4F46E5';
          var bdr = isTask ? '#fde68a' : '#c4b5fd';
          return '<td style="white-space:nowrap"><a href="'+escAttr(brief.url)+'" target="_blank" title="'+escAttr(brief.title)+'" '+
            'style="display:inline-flex;align-items:center;gap:3px;font-size:0.68rem;color:'+clr+';font-weight:600;text-decoration:none;padding:3px 7px;background:'+bg+';border-radius:5px;border:1px solid '+bdr+'">'+
            esc(brief.label)+' &#8599;</a></td>';
        }
        // No brief yet — show fetch button if we have a source ClickUp task ID
        if (ins._sourceClickupId && CFG.key) {
          return '<td style="white-space:nowrap"><button id="fetchBriefBtn_'+escAttr(ins.id)+'" class="ins-icon-btn" '+
            'onclick="fetchAndSaveInspoBrief(\''+escAttr(ins.id)+'\')" '+
            'title="Fetch creative brief from ClickUp task" '+
            'style="font-size:0.65rem;padding:3px 7px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;border-radius:5px;cursor:pointer;font-weight:600">'+
            '📄? Fetch Brief</button></td>';
        }
        return '<td style="white-space:nowrap"><span class="ins-brief-pending">⏳ Pending</span></td>';
      })() +
      // 19. Tags
      '<td style="white-space:nowrap">'+tagPills+'</td>' +
      // 20. Reuse
      '<td>'+reuseBadge+'</td>' +
      // 21. Actions
      '<td class="ins-actions">' +
        '<a href="'+escAttr(ins.sourceUrl)+'" target="_blank" class="ins-icon-btn" title="Open source">&#8599;</a>' +
        (isQueued ? '' : '<button class="ins-icon-btn" onclick="useInspirationFormat('+insIdQ+')" title="Use this format">+</button>') +
        ((ins._needsAngleReview || ins._needsPersonaReview || (ins.status==='Classified' && (!ins.angle || !ins.persona)))
          ? '<button class="ins-icon-btn ins-map-btn" onclick="remapInspirationFields('+insIdQ+')" title="Map angle &amp; persona">🗺</button>'
          : '') +
        '<button class="ins-icon-btn" onclick="deleteInspiration('+insIdQ+')" title="Delete" style="color:#ef4444">&#215;</button>' +
      '</td>' +
    '</tr>';

    // Dupe banner row — hidden by default, opens when user clicks the ! dot
    var dupeRow = '';
    if (ins._dupeType && ins._dupeBannerOpen) {
      var dupeColorMap = { winner: '#059669', loser: '#DC2626', tested: '#D97706' };
      var dIcon = { winner: '🏆', loser: '❌', tested: '⚠️' }[ins._dupeType] || '⚠️';
      var dTitle = { winner: 'Similar concept already WON', loser: 'Concept tested — it LOST', tested: 'Similar concept exists' }[ins._dupeType];
      var dDetail = ins._dupeDetail || '';
      var dColor = dupeColorMap[ins._dupeType] || '#D97706';
      var dupeSimilar = ins._dupeSimilar || [];
      var dupeTaskPills = dupeSimilar.map(function(d) {
        var taskId = typeof d === 'object' ? d.id : d;
        var taskName = typeof d === 'object' ? d.name : d;
        var taskStatus = typeof d === 'object' ? d.status : '';
        var matchType = typeof d === 'object' ? d.matchType : '';
        var matchLabel = { exact: '🔴 Exact', combo: '🟡 Same combo', format: '🟠 Similar format' }[matchType] || '';
        var statusCls = STATUS_CLS[taskStatus] || 'notstart';
        return '<div class="ins-dupe-task-pill">' +
          (matchLabel ? '<span style="font-size:0.6rem;font-weight:600;margin-right:4px;opacity:0.85">' + matchLabel + '</span>' : '') +
          '<span class="mono" style="font-size:0.65rem;color:inherit;opacity:0.7">' + esc(taskId) + '</span>' +
          '<span class="ins-dupe-task-name">' + esc(taskName) + '</span>' +
          '<span class="bdg ' + statusCls + '" style="font-size:0.6rem;padding:1px 6px">' + esc(taskStatus) + '</span>' +
          '<button class="ins-dupe-btn" onclick="navigateToCreative(\'' + escAttr(taskId) + '\')">View →</button>' +
        '</div>';
      }).join('');
      dupeRow = '<tr><td colspan="22" style="padding:0 12px 8px">' +
        '<div class="ins-dupe-banner ' + ins._dupeType + '">' +
          '<span class="ins-dupe-icon">' + dIcon + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="ins-dupe-title">' + dTitle + (dDetail ? ' <span style="font-weight:400;font-size:0.7rem;opacity:0.8;margin-left:6px">— ' + esc(dDetail) + '</span>' : '') + '</div>' +
            '<div class="ins-dupe-tasks">' + dupeTaskPills + '</div>' +
            '<div class="ins-dupe-actions">' +
              '<button class="ins-dupe-btn" onclick="toggleDupeBanner(' + insIdQ + ')">Close</button>' +
              (ins._dupeType === 'loser' ? '<button class="ins-dupe-btn" onclick="deleteInspiration(' + insIdQ + ')">Remove Inspiration</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</td></tr>';
    }

    return mainRow + dupeRow;
  }).join('');
}

async function deleteInspiration(id) {
  // Capture product_id before we strip the row from local state
  var victim = INSPIRATIONS.find(function(ins){ return ins.id === id; });
  var pid = (victim && victim.product_id) || activeProductId;

  // 1. Remove from local in-memory state + re-render immediately (optimistic)
  INSPIRATIONS = INSPIRATIONS.filter(function(ins){ return ins.id !== id; });
  renderInspirations();

  // 2. Explicitly DELETE from Supabase. saveInspirations() only upserts the
  //    remaining rows — it never removes deleted ones, so without this call
  //    the row resurrects on next refresh / realtime refetch.
  if (SB && id) {
    try {
      var delIns = await SB.from('inspirations').delete().eq('id', id);
      if (delIns && delIns.error) console.error('[SB] deleteInspiration inspirations', delIns.error);
      // Also drop any queue entry so it doesn't get picked up by the classifier later
      var delQ = await SB.from('inspiration_queue').delete().eq('ins_id', id);
      if (delQ && delQ.error) console.error('[SB] deleteInspiration queue', delQ.error);
      // And any prior classification result (safe if nothing matches)
      if (pid) {
        var delR = await SB.from('inspiration_results').delete().eq('ins_id', id).eq('product_id', pid);
        if (delR && delR.error) console.error('[SB] deleteInspiration results', delR.error);
      }
    } catch (e) { console.error('[SB] deleteInspiration exception', e); }
  }

  // 3. Persist the remaining rows (unchanged rows get no-op upserts, harmless)
  saveInspirations();
}

function useInspirationFormat(id) {
  var ins = INSPIRATIONS.find(function(i){ return i.id === id; });
  if (!ins) return;
  ins.status = 'Approved';
  if (!ins.reusedIn.includes('Immuvi')) ins.reusedIn.push('Immuvi');
  saveInspirations();
  renderInspirations();
  // Flag for matrix to pick up
  if (!window.INS_APPROVED_FORMATS) window.INS_APPROVED_FORMATS = [];
  if (!window.INS_APPROVED_FORMATS.includes(id)) window.INS_APPROVED_FORMATS.push(id);
  if (typeof toast === 'function') toast('Marked as Approved — available in Creative Matrix', 'ok');
}

function showAddInspirationModal() {
  var url = prompt('Source URL:');
  if (!url) return;
  var ins = {
    id: 'INS-' + String(INS_NEXT_ID).padStart(3,'0'),
    sourceUrl: url,
    platform: detectPlatform(url),
    brand: prompt('Brand name:') || '',
    formatName: prompt('Format name (e.g. Airplane Window Text):') || '',
    creativeUSP: '',
    hookType: '',
    creativeStructure: '',
    productionStyle: '',
    angle: prompt('Angle (what promise is being made):') || '',
    persona: '',
    funnelStage: 'TOF',
    adType: 'Video',
    status: 'Saved',
    creativeHypothesis: '',
    notes: '',
    reusedIn: [],
    addedAt: Date.now(),
    classifiedAt: null
  };
  INS_NEXT_ID++;
  INSPIRATIONS.unshift(ins);
  saveInspirations();
  renderInspirations();
}

// ── CROSS-PRODUCT IMPORT ─────────────────────────────────

// Product registry — stored in localStorage
function getProductRegistry() {
  // Always derive from the live PRODUCTS array so storageKeys stay in sync
  return PRODUCTS.map(function(p) {
    return {
      id:         p.id,
      name:       p.name,
      storageKey: 'immuvi_inspirations_' + p.id,
      isCurrent:  p.id === activeProductId
    };
  });
}

function saveProductRegistry(registry) {
  // No-op — registry is now derived from PRODUCTS, not persisted separately
}

// Cross-product inspiration cache (populated alongside _winnersByProductCache).
var _inspoByProductCache = {};

// Cross-product snapshot cache for instant product-switch rendering.
// Populated in switchProduct() right before we leave a product; restored at
// the top of switchProduct() for the destination. Each entry is a shallow
// clone of { ANGLES, PERSONAS, ADS, PROD, ANGLE_PERSONAS, MATRIX_CELL_META,
// CELL_CREATIVE_ASSIGNMENTS, MANUAL_ACTIONS, ts }. The DB fetch still runs
// and overwrites — this is pure perceived-latency optimisation. Entries
// older than _PRODUCT_CACHE_MAX_MS are ignored (fall back to DB wait).
var _productDataCache = {};
var _PRODUCT_CACHE_MAX_MS = 5 * 60 * 1000; // 5 minutes
async function refreshInspoCache() {
  if (!DB.ready) return;
  for (var i = 0; i < PRODUCTS.length; i++) {
    var pid = PRODUCTS[i].id;
    if (pid === activeProductId) continue;
    try {
      _inspoByProductCache[pid] = await DB.listInspirations(pid);
    } catch (e) { _inspoByProductCache[pid] = []; }
  }
}
function getProductInspirations(storageKey) {
  // Legacy signature: storageKey looks like 'immuvi_inspirations_<productId>'
  var pid = (storageKey || '').replace(/^immuvi_inspirations_/, '');
  if (pid === activeProductId) return INSPIRATIONS || [];
  return _inspoByProductCache[pid] || [];
}

function openProductPicker() {
  var old = document.getElementById('insProductPickerOverlay');
  if (old) old.remove();

  var registry = getProductRegistry();
  var otherProducts = registry.filter(function(p){ return !p.isCurrent; });

  // Build sidebar rows — show both inspo count and winning format count
  var sidebarRows = otherProducts.map(function(p) {
    var insCount  = getProductInspirations(p.storageKey).length;
    var winCount  = getProductWinningFormats(p.id).length;
    return '<label class="ins-product-item" data-product-id="'+escAttr(p.id)+'">' +
      '<input type="checkbox" value="'+escAttr(p.id)+'" onchange="refreshPickerPreview()"> ' +
      esc(p.name) +
      '<span class="ins-product-count" title="'+insCount+' inspos · '+winCount+' winners">'+insCount+' / 🏆'+winCount+'</span>' +
    '</label>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'insProductPickerOverlay';
  overlay.className = 'ins-product-picker';
  overlay.innerHTML =
    '<div class="ins-product-picker-box">' +
      '<div class="ins-picker-head">' +
        '<h3>Browse Other Products</h3>' +
        '<button class="modal-close" onclick="document.getElementById(\'insProductPickerOverlay\').remove()">&times;</button>' +
      '</div>' +
      // Tab bar
      '<div class="ins-picker-tabs">' +
        '<button class="ins-picker-tab active" id="insPickTabInspo" onclick="switchPickerTab(\'inspo\')">💡 Inspirations</button>' +
        '<button class="ins-picker-tab" id="insPickTabWin"  onclick="switchPickerTab(\'win\')">🏆 Winning Formats</button>' +
      '</div>' +
      '<div class="ins-picker-body">' +
        '<div class="ins-picker-sidebar">' +
          '<div class="ins-picker-sidebar-title">Products <span style="font-weight:400;color:var(--t3)">(inspos / winners)</span></div>' +
          '<div id="insPickerProductList">' + sidebarRows + '</div>' +
        '</div>' +
        '<div class="ins-picker-preview">' +
          '<div class="ins-picker-preview-toolbar">' +
            '<span class="ins-picker-preview-count" id="insPickerPreviewCount">Select products on the left to preview</span>' +
            '<button class="btn-ghost btn-sm" onclick="selectAllPickerRows()">Select All</button>' +
          '</div>' +
          '<div class="ins-picker-table-wrap">' +
            '<table class="ins-picker-table" id="insPickerTable">' +
              '<thead id="insPickerThead"><tr>' +
                '<th style="width:30px"><input type="checkbox" id="insPickerSelectAll" onchange="toggleAllPickerRows(this.checked)"></th>' +
                '<th>Format Name</th><th>Brand</th><th>Angle</th><th>Persona</th>' +
                '<th>Hook</th><th>Structure</th><th>Funnel</th><th>Status</th><th>From</th>' +
              '</tr></thead>' +
              '<tbody id="insPickerTbody"><tr><td colspan="10" style="text-align:center;padding:24px;color:var(--t3);font-size:0.75rem">Select one or more products to preview</td></tr></tbody>' +
            '</table>' +
          '</div>' +
          '<div class="ins-picker-foot">' +
            '<span class="ins-picker-selected-count" id="insPickerSelectedCount">0 selected</span>' +
            '<button class="btn-ghost" onclick="document.getElementById(\'insProductPickerOverlay\').remove()">Cancel</button>' +
            '<button class="btn-primary btn-sm" id="insPickerImportBtn" onclick="importFromPicker()">↓ Import Selected</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // State
  window._pickerRows = [];
  window._pickerTab  = 'inspo'; // 'inspo' | 'win'
}

function addProductToRegistry() {
  var nameEl = document.getElementById('insNewProductName');
  var name = (nameEl ? nameEl.value.trim() : '');
  if (!name) return;
  var registry = getProductRegistry();
  var id = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  if (registry.some(function(p){ return p.id === id; })) {
    alert('Product already exists'); return;
  }
  registry.push({ id: id, name: name, storageKey: id + '_inspirations', isCurrent: false });
  saveProductRegistry(registry);
  if (nameEl) nameEl.value = '';
  // Reopen to refresh
  document.getElementById('insProductPickerOverlay').remove();
  openProductPicker();
}

// ── Tab switch — only filters visibility, never re-renders (preserves checkboxes) ──
function switchPickerTab(tab) {
  window._pickerTab = tab;
  document.getElementById('insPickTabInspo').classList.toggle('active', tab === 'inspo');
  document.getElementById('insPickTabWin').classList.toggle('active', tab === 'win');

  // Show/hide rows by type without touching checkboxes
  document.querySelectorAll('#insPickerTbody tr[data-row-type]').forEach(function(tr) {
    tr.style.display = (tab === 'all' || tr.dataset.rowType === tab) ? '' : 'none';
  });

  // Update count label
  _updatePickerCountLabel();

  // Update import button label (reflects mixed selection)
  _updatePickerImportLabel();
}

function _updatePickerCountLabel() {
  var tab      = window._pickerTab || 'inspo';
  var rows     = window._pickerRows || [];
  var visible  = tab === 'all' ? rows : rows.filter(function(r){ return r.type === tab; });
  var countEl  = document.getElementById('insPickerPreviewCount');
  var noun     = tab === 'win' ? 'winning format' : tab === 'all' ? 'item' : 'inspiration';
  if (countEl) countEl.textContent = visible.length + ' ' + noun + (visible.length !== 1 ? 's' : '') + ' available';
}

function _updatePickerImportLabel() {
  var btn = document.getElementById('insPickerImportBtn');
  if (!btn) return;
  var selectedRows = Array.from(document.querySelectorAll('.ins-picker-row-cb:checked'))
    .map(function(cb){ return (window._pickerRows||[])[parseInt(cb.dataset.idx)]; })
    .filter(Boolean);
  var hasInspo = selectedRows.some(function(r){ return r.type === 'inspo'; });
  var hasWin   = selectedRows.some(function(r){ return r.type === 'win'; });
  if (hasInspo && hasWin) btn.textContent = '↓ Import All Selected';
  else if (hasWin)        btn.textContent = '↓ Import as Inspiration';
  else                    btn.textContent = '↓ Import Selected';
}

// ── Read winning formats from another product (cached from Supabase) ────
var _winnersByProductCache = {};
async function refreshWinnersCache() {
  if (!DB.ready) return;
  for (var i = 0; i < PRODUCTS.length; i++) {
    var pid = PRODUCTS[i].id;
    if (pid === activeProductId) continue;
    try {
      var res = await SB.from('ads').select('*').eq('product_id', pid).in('status', ['Winner', 'Scale']).is('parent_ad_id', null);
      _winnersByProductCache[pid] = (res.data || []).map(_rowToAd);
    } catch (e) { _winnersByProductCache[pid] = []; }
  }
}
function getProductWinningFormats(productId) {
  if (productId === activeProductId) {
    return (ADS || []).filter(function (a) { return !a.parentAdId && (a.status === 'Winner' || a.status === 'Scale'); });
  }
  return _winnersByProductCache[productId] || [];
}
// Also expose a forced refresh for the cross-product picker UI
window.refreshWinnersCache = refreshWinnersCache;

// ── Unified import — handles both types from selected rows ───────
function importFromPicker() {
  var selectedIdxs = Array.from(document.querySelectorAll('.ins-picker-row-cb:checked'))
    .map(function(cb){ return parseInt(cb.dataset.idx); });
  if (!selectedIdxs.length) { alert('Select at least one item to import'); return; }

  var rows     = window._pickerRows || [];
  var inspoIdxs = selectedIdxs.filter(function(i){ return rows[i] && rows[i].type === 'inspo'; });
  var winIdxs   = selectedIdxs.filter(function(i){ return rows[i] && rows[i].type === 'win'; });

  var totalImported = 0;
  if (inspoIdxs.length) totalImported += _doImportInspos(inspoIdxs, rows);
  if (winIdxs.length)   totalImported += _doImportWins(winIdxs, rows);

  if (totalImported > 0) {
    saveInspirations();
    renderInspirations();
    document.getElementById('insProductPickerOverlay').remove();
    if (typeof toast === 'function') toast(totalImported + ' item' + (totalImported>1?'s':'') + ' imported', 'ok');
  } else {
    alert('All selected items are already imported (duplicates skipped)');
  }
}

function refreshPickerPreview() {
  var registry = getProductRegistry();
  var checked  = Array.from(document.querySelectorAll('#insPickerProductList input[type=checkbox]:checked')).map(function(el){ return el.value; });

  // Load ALL rows (both types) — tabs only filter visibility
  var rows = [];
  checked.forEach(function(productId) {
    var product = registry.find(function(p){ return p.id === productId; });
    if (!product) return;
    getProductInspirations(product.storageKey).forEach(function(ins) {
      rows.push({ type: 'inspo', ins: ins, productName: product.name, productId: product.id });
    });
    getProductWinningFormats(productId).forEach(function(ad) {
      rows.push({ type: 'win', ad: ad, productName: product.name, productId: product.id });
    });
  });

  window._pickerRows = rows;

  var tbody = document.getElementById('insPickerTbody');
  if (!tbody) return;

  if (rows.length === 0) {
    var msg = checked.length > 0 ? 'No items found for selected products' : 'Select one or more products to preview';
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--t3);font-size:0.75rem">' + msg + '</td></tr>';
    _updatePickerCountLabel();
    return;
  }

  var tab          = window._pickerTab || 'inspo';
  var funnelColor  = function(fs) { return fs==='TOF'?'#6366f1':fs==='MOF'?'#f59e0b':'#10b981'; };

  tbody.innerHTML = rows.map(function(row, i) {
    var hidden = (tab !== 'all' && row.type !== tab) ? ' style="display:none"' : '';
    if (row.type === 'win') {
      var ad        = row.ad;
      var crossUses = (ad._crossProductUses || []).length;
      var usedBadge = crossUses > 0
        ? '<span class="ins-cross-reuse-pill active">'+crossUses+' product'+(crossUses>1?'s':'')+'</span>'
        : '<span style="color:var(--t3);font-size:0.7rem">—</span>';
      var statusCls = (ad.status||'').toLowerCase().replace(/\s+/g,'-');
      return '<tr data-row-type="win"'+hidden+'>' +
        '<td><input type="checkbox" class="ins-picker-row-cb" data-idx="'+i+'" onchange="updatePickerSelectedCount();_updatePickerImportLabel()"></td>' +
        '<td style="font-weight:500;max-width:160px"><span class="ins-win-badge">🏆 '+esc(ad.status)+'</span> '+esc(ad.formatName||ad.id)+'</td>' +
        '<td style="font-size:0.7rem;max-width:100px">'+esc(ad.angle||'—')+'</td>' +
        '<td style="font-size:0.7rem;max-width:100px">'+esc(ad.persona||'—')+'</td>' +
        '<td style="font-size:0.7rem;white-space:nowrap">'+esc(ad.hookType||'—')+'</td>' +
        '<td style="font-size:0.7rem"><span style="font-weight:700;color:'+funnelColor(ad.funnelStage)+'">'+esc(ad.funnelStage||'—')+'</span></td>' +
        '<td><span class="ins-status-badge '+statusCls+'">'+esc(ad.status)+'</span></td>' +
        '<td>'+usedBadge+'</td>' +
        '<td><span class="ins-tag-pill imported">'+esc(row.productName)+'</span></td>' +
      '</tr>';
    } else {
      var ins = row.ins;
      return '<tr data-row-type="inspo"'+hidden+'>' +
        '<td><input type="checkbox" class="ins-picker-row-cb" data-idx="'+i+'" onchange="updatePickerSelectedCount();_updatePickerImportLabel()"></td>' +
        '<td style="font-weight:500;max-width:160px">'+esc(ins.formatName || ins.creativeUSP || '—')+'</td>' +
        '<td style="font-size:0.7rem">'+esc(ins.brand||'—')+'</td>' +
        '<td style="font-size:0.7rem;max-width:100px">'+esc(ins.angle||'—')+'</td>' +
        '<td style="font-size:0.7rem;max-width:100px">'+esc(ins.persona||'—')+'</td>' +
        '<td style="font-size:0.7rem;white-space:nowrap">'+esc(ins.hookType||'—')+'</td>' +
        '<td style="font-size:0.7rem;white-space:nowrap">'+esc(ins.creativeStructure||'—')+'</td>' +
        '<td style="font-size:0.7rem"><span style="font-weight:700;color:'+funnelColor(ins.funnelStage)+'">'+esc(ins.funnelStage||'—')+'</span></td>' +
        '<td><span class="ins-status-badge '+(ins.status||'saved').toLowerCase()+'">'+esc(ins.status||'Saved')+'</span></td>' +
        '<td><span class="ins-tag-pill imported">'+esc(row.productName)+'</span></td>' +
      '</tr>';
    }
  }).join('');

  _updatePickerCountLabel();
  updatePickerSelectedCount();
}

function updatePickerSelectedCount() {
  var selected = document.querySelectorAll('.ins-picker-row-cb:checked').length;
  var el = document.getElementById('insPickerSelectedCount');
  if (el) el.textContent = selected + ' selected';
}

function toggleAllPickerRows(checked) {
  // Only toggle VISIBLE rows (respects current tab filter)
  document.querySelectorAll('#insPickerTbody tr[data-row-type]').forEach(function(tr) {
    if (tr.style.display !== 'none') {
      var cb = tr.querySelector('.ins-picker-row-cb');
      if (cb) cb.checked = checked;
    }
  });
  updatePickerSelectedCount();
  _updatePickerImportLabel();
}

function selectAllPickerRows() {
  var allCb = document.getElementById('insPickerSelectAll');
  if (allCb) allCb.checked = true;
  toggleAllPickerRows(true);
}

// ── Internal: import inspo rows by index array, returns count ────
function _doImportInspos(idxs, rows) {
  var imported = 0;
  var CLASSIFIED_STATUSES = ['Classified', 'Testing', 'Winner', 'Scale', 'Loser'];
  idxs.forEach(function(idx) {
    var row = rows[idx];
    if (!row || row.type !== 'inspo') return;
    var sourceIns = row.ins;
    if (INSPIRATIONS.some(function(i){ return i.sourceUrl && i.sourceUrl === sourceIns.sourceUrl; })) return;
    var preservedStatus = (CLASSIFIED_STATUSES.indexOf(sourceIns.status) !== -1) ? sourceIns.status : 'Saved';
    var newIns = Object.assign({}, sourceIns, {
      id:               'INS-' + String(INS_NEXT_ID).padStart(3,'0'),
      status:           preservedStatus,
      importTags:       ['Imported', 'From: ' + row.productName],
      reusedIn:         [],
      _sourceProductId: row.productId,
      _sourceInsId:     sourceIns.id,
      addedAt:          Date.now(),
      classifiedAt:     sourceIns.classifiedAt || null,
      _clickupDocPageUrl: '',
      _clickupDocId:    '',
      _inspoDocCreated: false
    });
    INS_NEXT_ID++;
    INSPIRATIONS.unshift(newIns);
    crossProductMarkInspoImported(row.productId, sourceIns.id, activeProductId);
    imported++;
  });
  return imported;
}

// ── Internal: import winning format rows by index array, returns count ──
function _doImportWins(idxs, rows) {
  var imported = 0;
  idxs.forEach(function(idx) {
    var row = rows[idx];
    if (!row || row.type !== 'win') return;
    var ad = row.ad;
    if (INSPIRATIONS.some(function(i){ return i._sourceAdId === ad.id && i._sourceProductId === row.productId; })) return;
    var newIns = {
      id:               'INS-' + String(INS_NEXT_ID).padStart(3,'0'),
      sourceUrl:        ad.adLink || '',
      platform:         ad.platform || 'Other',
      brand:            row.productName,
      status:           'Classified',
      formatName:       ad.formatName || ad.id,
      creativeUSP:      ad.formatName || '',
      hookType:         ad.hookType || '',
      creativeStructure:'',
      productionStyle:  '',
      funnelStage:      ad.funnelStage || 'TOF',
      adType:           'Video',
      angle:            ad.angle || '',
      persona:          ad.persona || '',
      creativeHypothesis: '',
      notes:            'Winning format imported from ' + row.productName,
      bodyCopy:         '',
      headline:         '',
      ctaText:          '',
      landingUrl:       ad.adLink || '',
      duration_seconds: 0,
      importTags:       ['Winning Format', 'From: ' + row.productName],
      reusedIn:         [],
      _sourceProductId:  row.productId,
      _sourceAdId:       ad.id,
      _sourceClickupId:  ad._clickupId || '',   // stored for brief auto-fetch
      addedAt:           Date.now(),
      classifiedAt:      Date.now(),
      _clickupDocPageUrl: '',
      _clickupDocId:     '',
      _inspoDocCreated:  false
    };
    INS_NEXT_ID++;
    INSPIRATIONS.unshift(newIns);
    crossProductMarkAdImported(row.productId, ad.id, activeProductId);

    // Auto-fetch brief from ClickUp in background (if API key available)
    if (ad._clickupId && CFG.key) {
      (function(insId, taskId) {
        fetchClickUpBriefUrl(taskId).then(function(url) {
          if (!url) return;
          var found = INSPIRATIONS.find(function(i){ return i.id === insId; });
          if (found && !found._clickupDocPageUrl) {
            found._clickupDocPageUrl = url;
            saveInspirations();
            renderInspirations();
            toast('Brief auto-fetched for imported format 📄', 'ok');
          }
        });
      })(newIns.id, ad._clickupId);
    }

    imported++;
  });
  return imported;
}

// ── Resolve brief URL for an inspiration (handles cross-product imports) ──
// Priority: 1) own _clickupDocPageUrl  2) source inspo's brief  3) source AD's ClickUp task link
function resolveInspoBriefUrl(ins) {
  if (ins._clickupDocPageUrl) return { url: ins._clickupDocPageUrl, label: '📄 Brief', title: 'Open Creative Brief in ClickUp' };

  // Imported from another product's inspiration
  if (ins._sourceInsId && ins._sourceProductId) {
    try {
      var raw = localStorage.getItem('immuvi_inspirations_' + ins._sourceProductId);
      if (raw) {
        var d = JSON.parse(raw);
        var srcIns = (d.inspirations || []).find(function(i){ return i.id === ins._sourceInsId; });
        if (srcIns && srcIns._clickupDocPageUrl) {
          var pName = (PRODUCTS.find(function(p){ return p.id === ins._sourceProductId; }) || {}).name || ins._sourceProductId;
          return { url: srcIns._clickupDocPageUrl, label: '📄 Brief', title: 'Creative Brief from ' + pName };
        }
      }
    } catch(e) {}
  }

  // Imported from another product's winning AD
  if (ins._sourceAdId && ins._sourceProductId) {
    try {
      var pName2   = (PRODUCTS.find(function(p){ return p.id === ins._sourceProductId; }) || {}).name || ins._sourceProductId;
      // Pull from the winners cache populated at boot (async). If miss, fall back silently.
      var cachedSrc = _winnersByProductCache[ins._sourceProductId] || [];
      var srcAd    = cachedSrc.find(function(a){ return a.id === ins._sourceAdId; }) || null;
      var taskUrl  = (srcAd && (srcAd._clickupUrl || srcAd.adLink)) || '';
      if (false) {  // unreachable legacy code kept for minimal diff — replaced by cache lookup above
        var state  = null;
        srcAd      = (state && state.ADS || []).find(function(a){ return a.id === ins._sourceAdId; });
        taskUrl    = (srcAd && (srcAd._clickupUrl || srcAd.adLink)) || '';
      }

      // 1. Does the source AD trace back to an inspiration with a brief?
      if (srcAd && srcAd._fromInspoId) {
        var insRaw = localStorage.getItem('immuvi_inspirations_' + ins._sourceProductId);
        if (insRaw) {
          var insData  = JSON.parse(insRaw);
          var srcInspo = (insData.inspirations || []).find(function(i){ return i.id === srcAd._fromInspoId; });
          if (srcInspo && srcInspo._clickupDocPageUrl) {
            return { url: srcInspo._clickupDocPageUrl, label: '📄 Brief', title: 'Creative Brief from ' + pName2 + ' · ' + (srcAd.formatName || srcAd.id) };
          }
        }
      }

      // 2. Fall back to the ClickUp task link
      if (taskUrl) {
        return { url: taskUrl, label: '🔗 ' + pName2 + ' Task', title: 'ClickUp task from ' + pName2 + ' — ' + ((srcAd && srcAd.formatName) || ins._sourceAdId) };
      }
    } catch(e) {}
  }

  return null;
}

// ── ClickUp brief auto-fetch ──────────────────────────────────────

var _CU_DOC_RE = /https:\/\/app\.clickup\.com\/\d+\/v\/dc\/[^\s"'<>)]+|https:\/\/app\.clickup\.com\/[^\s"'<>)#]+\/docs\/[^\s"'<>)#]+/gi;

function _extractDocUrl(text) {
  if (!text) return null;
  _CU_DOC_RE.lastIndex = 0;
  var m = String(text).match(_CU_DOC_RE);
  return (m && m[0]) ? m[0] : null;
}

// Search task description + comments for a ClickUp doc URL.
// Returns Promise<string|null>.
function fetchClickUpBriefUrl(taskId) {
  if (!CFG.key || !taskId) return Promise.resolve(null);
  return apiFetch('/task/' + taskId)
    .then(function(task) {
      var fromDesc = _extractDocUrl(task.description);
      if (fromDesc) return fromDesc;
      var fields = task.custom_fields || [];
      for (var fi = 0; fi < fields.length; fi++) {
        var fv = fields[fi].value;
        if (typeof fv === 'string') {
          var ff = _extractDocUrl(fv);
          if (ff) return ff;
        }
      }
      return null;
    })
    .catch(function(){ return null; })
    .then(function(fromTask) {
      if (fromTask) return fromTask;
      return apiFetch('/task/' + taskId + '/comment')
        .then(function(data) {
          var comments = data.comments || [];
          for (var ci = 0; ci < comments.length; ci++) {
            var txt = comments[ci].comment_text || '';
            if (!txt && comments[ci].comment && comments[ci].comment[0]) {
              txt = comments[ci].comment[0].text || '';
            }
            var fc = _extractDocUrl(txt);
            if (fc) return fc;
          }
          return null;
        })
        .catch(function(){ return null; });
    });
}

// Fetch brief for inspiration by ID — called by the "📄?" button
function fetchAndSaveInspoBrief(insId) {
  var ins = INSPIRATIONS.find(function(i){ return i.id === insId; });
  if (!ins || !ins._sourceClickupId) { toast('No ClickUp task linked to this inspiration', 'warn'); return; }
  if (!CFG.key) { toast('Enter your ClickUp API key first', 'err'); return; }
  var btn = document.getElementById('fetchBriefBtn_' + insId);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  fetchClickUpBriefUrl(ins._sourceClickupId).then(function(url) {
    if (url) {
      ins._clickupDocPageUrl = url;
      saveInspirations();
      renderInspirations();
      toast('Brief found and saved! 📄', 'ok');
    } else {
      if (btn) { btn.textContent = '📄?'; btn.disabled = false; }
      toast('No brief URL found in task description or comments', 'warn');
    }
  });
}

// ── Cross-product write-back helpers (Supabase) ──────────────────

// Mark that sourceInspirationId (in sourceProductId) was imported by importingProductId.
// Fire-and-forget: we don't block the caller on the network round-trip.
async function crossProductMarkInspoImported(sourceProductId, sourceInsId, importingProductId) {
  if (!DB.ready) return;
  try {
    var r = await SB.from('inspirations').select('*').eq('id', sourceInsId).eq('product_id', sourceProductId).maybeSingle();
    if (r.error || !r.data) return;
    var ins = r.data;
    // Stash cross-product-imports inside metadata jsonb column if exists, else skip.
    // Simplest: add to title suffix or keep as an in-memory hint. For now we just log —
    // this cross-product tracking was inherently best-effort and the data lives client-side.
    // Intentionally a no-op write to avoid polluting the schema; future: add a jsonb column.
    void ins; void importingProductId;
  } catch (e) { /* swallow */ }
}

async function crossProductMarkAdImported(sourceProductId, sourceAdId, importingProductId) {
  if (!DB.ready) return;
  // Same story as above — informational, not critical. Left as best-effort no-op.
  void sourceProductId; void sourceAdId; void importingProductId;
}

// ====================================================================
// QUEUE BADGE · STATUS PILL · BRIEF · REALTIME · CHIPS · EMPTY STATE
// ====================================================================
// New module-level state. Each interval/channel follows the established
// "clear → restart" pattern so a product switch (which calls loadInspirations
// in the background) cleanly recycles them without leaks.
var _INS_FEAT_STYLES_ID = 'ins-feature-styles';
var _insQueueBadgeTimer = null;
var _insRealtimeChannel = null;
var _insChipFilter = 'all';

// Inject the supporting CSS once. All values come from base.css tokens.
function _injectInspirationStyles() {
  if (document.getElementById(_INS_FEAT_STYLES_ID)) return;
  var st = document.createElement('style');
  st.id = _INS_FEAT_STYLES_ID;
  st.textContent =
    /* ── Queue status badge ── */
    '.ins-q-badges{display:inline-flex;gap:6px;margin-left:8px;align-items:center;flex-wrap:wrap;}' +
    '.ins-q-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:14px;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;font-family:\'JetBrains Mono\',monospace;' +
      'border:1px solid transparent;white-space:nowrap;}' +
    '.ins-q-pill.pending{background:var(--readyb);color:var(--ready);border-color:var(--readybr);}' +
    '.ins-q-pill.processing{background:var(--inprogb);color:var(--inprog);border-color:var(--inprogbr);' +
      'animation:pulse 1.6s ease-in-out infinite;}' +
    '.ins-q-pill.classified{background:var(--winb);color:var(--win);border-color:var(--winbr);}' +

    /* ── Status pill (column 17) ── */
    '.ins-status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;' +
      'font-size:0.66rem;font-weight:600;border:1px solid transparent;white-space:nowrap;}' +
    '.ins-status-pill::before{content:"";width:5px;height:5px;border-radius:50%;flex-shrink:0;}' +
    '.ins-status-pill.saved{background:var(--el);color:var(--t2);border-color:var(--b);}' +
    '.ins-status-pill.saved::before{background:var(--t3);}' +
    '.ins-status-pill.processing{background:var(--inprogb);color:var(--inprog);border-color:var(--inprogbr);' +
      'animation:pulse 1.6s ease-in-out infinite;}' +
    '.ins-status-pill.processing::before{background:var(--inprog);}' +
    '.ins-status-pill.classified{background:var(--winb);color:var(--win);border-color:var(--winbr);}' +
    '.ins-status-pill.classified::before{background:var(--win);}' +
    '.ins-status-pill.error{background:var(--loseb);color:var(--lose);border-color:var(--losebr);}' +
    '.ins-status-pill.error::before{background:var(--lose);}' +
    '.ins-rel-ts{font-size:0.6rem;color:var(--t3);margin-top:3px;font-family:\'JetBrains Mono\',monospace;}' +

    /* ── Brief column "Pending" muted state ── */
    '.ins-brief-pending{font-size:0.65rem;color:var(--t3);font-weight:500;}' +

    /* ── Realtime row flash (1.5s green sweep) ── */
    '@keyframes insRowFlash{0%{background:rgba(5,150,105,0.22);}100%{background:transparent;}}' +
    '#insTbody tr.ins-row-flash > td{animation:insRowFlash 1.5s ease-out both;}' +

    /* ── Filter chip bar (matches .nt-chip from gap box) ── */
    '.ins-chip-bar{display:flex;flex-wrap:wrap;gap:6px;padding:0 0 12px 0;margin-top:-4px;}' +
    '.ins-chip-bar .nt-chip{padding:4px 12px;border-radius:14px;border:none;' +
      'background:#f1f5f9;color:var(--t2);font-family:inherit;font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;transition:background .15s, color .15s, transform .1s;}' +
    '.ins-chip-bar .nt-chip:hover{background:#e2e8f0;color:var(--t1);}' +
    '.ins-chip-bar .nt-chip:active{transform:scale(0.97);}' +
    '.ins-chip-bar .nt-chip.active{background:var(--test);color:#fff;}' +
    '.ins-chip-bar .nt-chip.active:hover{background:#4338ca;}' +

    /* ── Empty-state card with subtle pulsing dashed border ── */
    '.ins-empty-card{text-align:center;padding:48px 24px;background:var(--card);border-radius:var(--r);' +
      'border:2px dashed var(--b);animation:insBorderPulse 3.2s ease-in-out infinite;' +
      'box-shadow:0 1px 3px rgba(15,23,42,0.04);}' +
    '@keyframes insBorderPulse{0%,100%{border-color:var(--b);}50%{border-color:var(--bh);}}' +
    '.ins-empty-card .ins-empty-icon{font-size:2.4rem;margin-bottom:12px;line-height:1;}' +
    '.ins-empty-card .ins-empty-title{font-size:0.95rem;font-weight:600;color:var(--t1);margin-bottom:6px;}' +
    '.ins-empty-card .ins-empty-body{font-size:0.78rem;color:var(--t2);}';
  document.head.appendChild(st);
}

// Ensure the queue badge + chip bar are present in the inspiration tab DOM.
// Idempotent — safe to call from every render.
function _ensureInspirationDom() {
  var toolbar = document.querySelector('#panel-inspiration .ins-toolbar');
  if (toolbar && !document.getElementById('insQueueBadge')) {
    var badge = document.createElement('div');
    badge.id = 'insQueueBadge';
    badge.className = 'ins-q-badges';
    badge.innerHTML =
      '<span class="ins-q-pill pending">0 pending</span>' +
      '<span class="ins-q-pill processing">0 processing</span>' +
      '<span class="ins-q-pill classified">0 classified</span>';
    toolbar.appendChild(badge);
  }
  var panel = document.getElementById('panel-inspiration');
  if (panel && !document.getElementById('insChipBar')) {
    var fb = panel.querySelector('.ins-filter-bar');
    var chipBar = document.createElement('div');
    chipBar.id = 'insChipBar';
    chipBar.className = 'ins-chip-bar';
    chipBar.innerHTML =
      '<button type="button" class="nt-chip active" data-ins-chip="all"     onclick="_setInsChipFilter(\'all\')">All</button>' +
      '<button type="button" class="nt-chip"        data-ins-chip="TOF"     onclick="_setInsChipFilter(\'TOF\')">TOF</button>' +
      '<button type="button" class="nt-chip"        data-ins-chip="MOF"     onclick="_setInsChipFilter(\'MOF\')">MOF</button>' +
      '<button type="button" class="nt-chip"        data-ins-chip="BOF"     onclick="_setInsChipFilter(\'BOF\')">BOF</button>' +
      '<button type="button" class="nt-chip"        data-ins-chip="review"  onclick="_setInsChipFilter(\'review\')">⚠️ Needs Review</button>';
    if (fb && fb.parentNode) {
      fb.parentNode.insertBefore(chipBar, fb.nextSibling);
    }
  }
}

function _setInsChipFilter(filter) {
  _insChipFilter = filter;
  var chips = document.querySelectorAll('#insChipBar .nt-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('active', chips[i].getAttribute('data-ins-chip') === filter);
  }
  renderInspirations();
}

// Read inspiration_queue grouped by status and update the live header badge.
async function _updateInsQueueBadge() {
  var badge = document.getElementById('insQueueBadge');
  if (!badge || !DB.ready || !activeProductId) return;
  try {
    var res = await SB.from('inspiration_queue').select('status').eq('product_id', activeProductId);
    if (res.error) return;
    var counts = { pending: 0, processing: 0, classified: 0 };
    (res.data || []).forEach(function(r) {
      var s = String(r.status || '').toLowerCase();
      if (counts[s] !== undefined) counts[s]++;
    });
    badge.innerHTML =
      '<span class="ins-q-pill pending">'+counts.pending+' pending</span>' +
      '<span class="ins-q-pill processing">'+counts.processing+' processing</span>' +
      '<span class="ins-q-pill classified">'+counts.classified+' classified</span>';
  } catch (e) { /* transient — keep last value */ }
}

function _startInsQueueBadgePolling() {
  if (_insQueueBadgeTimer) clearInterval(_insQueueBadgeTimer);
  _updateInsQueueBadge();
  _insQueueBadgeTimer = setInterval(_updateInsQueueBadge, 10000);
}

// Per-product realtime channel scoped just to the inspirations table — gives
// us instant visual feedback on classification (the global _resubscribeRealtime
// listener re-fetches taxonomy/cells but never touches INSPIRATIONS).
function _subscribeInspirationsRealtime() {
  if (!SB || !activeProductId) return;
  if (_insRealtimeChannel) {
    try { SB.removeChannel(_insRealtimeChannel); } catch (e) {}
    _insRealtimeChannel = null;
  }
  var pid = activeProductId;
  _insRealtimeChannel = SB.channel('ins-feedback:' + pid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inspirations', filter: 'product_id=eq.' + pid }, function(payload) {
      _handleInspirationRealtime(payload, pid);
    })
    .subscribe();
}

function _handleInspirationRealtime(payload, pidAtSubscribe) {
  if (pidAtSubscribe !== activeProductId) return;
  var newRow = payload.new || {};
  var oldRow = payload.old || {};
  var newBlob = newRow.data || {};
  var oldBlob = oldRow.data || {};
  var newStatus = newRow.status || newBlob.status;
  var oldStatus = oldRow.status || oldBlob.status;
  // Only react when a row newly transitions into Classified
  if (newStatus !== 'Classified' || oldStatus === 'Classified') return;

  var merged = Object.assign({}, newBlob, {
    id: newRow.id,
    url: newRow.url || newBlob.url,
    sourceUrl: newBlob.sourceUrl || newRow.url,
    title: newRow.title || newBlob.title || '',
    platform: newRow.platform || newBlob.platform || '',
    addedBy: newRow.added_by || newBlob.addedBy || '',
    status: newRow.status || newBlob.status || 'saved'
  });
  var idx = -1;
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (INSPIRATIONS[i].id === merged.id) { idx = i; break; }
  }
  if (idx >= 0) INSPIRATIONS[idx] = merged;
  else INSPIRATIONS.unshift(merged);

  renderInspirations();
  _updateInsQueueBadge();
  _flashInspirationRow(merged.id);
  if (typeof toast === 'function') {
    var brand = merged.brand || merged.formatName || merged.id || 'Inspiration';
    var angle = merged.angle || 'no angle';
    toast('✓ ' + brand + ' classified — ' + angle, 'ok');
  }
}

// Flash + auto-scroll the row matching this inspiration id. Uses a setTimeout
// to give renderInspirations a tick to paint the new <tr>.
function _flashInspirationRow(id) {
  setTimeout(function() {
    var tr = document.querySelector('#insTbody tr[data-ins-id="'+id+'"]');
    if (!tr) return;
    tr.classList.add('ins-row-flash');
    var rect = tr.getBoundingClientRect();
    var offscreen = rect.top < 80 || rect.bottom > (window.innerHeight - 20);
    if (offscreen) {
      try { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
    setTimeout(function() { tr.classList.remove('ins-row-flash'); }, 1500);
  }, 60);
}

// "2 hours ago" style relative timestamp for the classifiedAt label under the status pill.
function _insRelTime(ms) {
  if (!ms) return '';
  var diff = Date.now() - ms;
  if (diff < 0) diff = 0;
  var s = Math.floor(diff / 1000);
  if (s < 60) return s + 's ago';
  var m = Math.floor(s / 60);
  if (m < 60) return m + ' minute' + (m > 1 ? 's' : '') + ' ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
  var d = Math.floor(h / 24);
  return d + ' day' + (d > 1 ? 's' : '') + ' ago';
}
