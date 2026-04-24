// ============================================================
// SUPABASE CLIENT + DATA-ACCESS LAYER
// ============================================================
// Replaces the localStorage-for-shared-state and /tmp/*.json bridge.
// - Anon key is safe to embed (public by design; protected by RLS).
// - localStorage still used for per-user UI prefs: api_key, active_product, active_tab.
const SB_URL = 'https://bfsvczgnnjwqzvrluqhw.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmc3Zjemdubmp3cXp2cmx1cWh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Mjk0MzQsImV4cCI6MjA5MjUwNTQzNH0.iLTgDhUp1sTUf36EZ2EtYXZggpLGA9SIp7o64ofxc2A';
let SB = null;
try {
  SB = window.supabase.createClient(SB_URL, SB_ANON, {
    realtime: { params: { eventsPerSecond: 4 } }
  });
  console.log('[SB] Supabase client ready →', SB_URL);
} catch (e) {
  console.error('[SB] Client init failed:', e);
}

// Guard: tracks which product the in-memory ADS/ANGLES/etc. currently belong to.
// Set by loadState() and switchProduct() after they finish loading. Used to bail
// out of saves/syncs that would otherwise persist the wrong product's data under
// the currently-selected product's id (the class of race-condition bugs that
// corrupted the DB when a 30s sync fired mid-switch).
var _adsProductId = null;

// Debounce helper — used to coalesce many saveState() calls into one DB write
function _debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

// Shape helpers: translate between frontend camelCase and DB snake_case
// Heuristic: does this id look like a ClickUp task ID (vs a frontend-generated one)?
// ClickUp task IDs: 9-char lowercase alphanumeric ("86d2pmv7b"). Frontend IDs use
// prefixes: "AD-…", "ad-…", "ang-…", "per-…", "prod-…", "ins-…", "INS-…", "AR-…" etc.
function _looksLikeClickUpTaskId(id) {
  if (!id || typeof id !== 'string') return false;
  if (/^[A-Z]{2,4}-/.test(id)) return false;   // AD-xxx, INS-xxx, PROD-xxx
  if (/^(ang|per|prod|ins|ad)-/.test(id)) return false; // prefixed local
  return /^[a-z0-9]{6,12}$/i.test(id);          // alnum, reasonable length
}

// Local-only ad fields that aren't syncable to ClickUp but must survive a Supabase
// round-trip. Stored in the ads.meta jsonb column.
var _META_FIELDS = [
  'taskType', 'sourceFormatId', 'sourceFormatDriveLink', '_sourceFormatDriveLink',
  '_fromInspoId', '_sourceAdId', '_sourceProductId', '_sourceClickupId',
  '_sourceInsId', '_sourceInspoUrl', '_inspirationDriveLink',
  '_sourceFormatName', '_sourceFormatAdLink', '_sourceFormatAdType',
  '_fromAction', '_productionStatus', '_crossProductUses',
  'hookType', 'creativeStructure', 'productionStyle', 'creativeHypothesis',
  'uniqueName', 'description', 'dueDate',
  'dateCreated', 'taskName', 'taskEditor'
];

function _adToRow(a, productId) {
  // Persist the ClickUp linkage so future syncs can dedupe.
  // Priority: explicit a.clickupTaskId → a._clickupId → id (if it looks like a task id)
  var clickupId = a.clickupTaskId || a._clickupId || (_looksLikeClickUpTaskId(a.id) ? a.id : null);
  // Extract local-only fields into meta so they survive roundtrip.
  var meta = {};
  for (var fi = 0; fi < _META_FIELDS.length; fi++) {
    var fk = _META_FIELDS[fi];
    if (a[fk] !== undefined && a[fk] !== null && a[fk] !== '') meta[fk] = a[fk];
  }
  return {
    id: a.id,
    product_id: productId,
    format_name: a.formatName || null,
    ad_link: a.adLink || null,
    drive_link: a.driveLink || null,
    ad_type: a.adType || null,
    funnel_stage: a.funnelStage || null,
    status: a.status || 'Untested',
    angle: a.angle || null,
    persona: a.persona || null,
    parent_ad_id: a.parentAdId || null,
    variation_number: a.variationNumber ? (parseInt(a.variationNumber, 10) || null) : null,
    ad_origin: a.adOrigin || null,
    clickup_task_id: clickupId,
    meta: meta
  };
}
function _rowToAd(r) {
  // Restore _clickupId so the sync logic can match existing ads to fetched ClickUp tasks.
  // Priority: explicit clickup_task_id column → id (if it looks like a task id).
  var clickupId = r.clickup_task_id || (_looksLikeClickUpTaskId(r.id) ? r.id : null);
  var ad = {
    id: r.id,
    formatName: r.format_name,
    adLink: r.ad_link,
    driveLink: r.drive_link,
    adType: r.ad_type,
    funnelStage: r.funnel_stage,
    status: r.status,
    angle: r.angle,
    persona: r.persona,
    parentAdId: r.parent_ad_id,
    variationNumber: r.variation_number,
    adOrigin: r.ad_origin,
    clickupTaskId: r.clickup_task_id || null,
    _clickupId: clickupId,
    // Deterministically derive the ClickUp task URL so tracker "↗ ClickUp" pills render
    _clickupUrl: clickupId ? ('https://app.clickup.com/t/' + clickupId) : ''
  };
  // Spread the meta blob back onto the ad (taskType, sourceFormatId, _fromInspoId, etc.)
  var meta = r.meta || {};
  for (var k in meta) {
    if (Object.prototype.hasOwnProperty.call(meta, k)) ad[k] = meta[k];
  }
  return ad;
}

// DB object: all shared state I/O goes through here
const DB = {
  ready: !!SB,

  async listProducts() {
    if (!SB) return [];
    const { data, error } = await SB.from('products').select('*').order('name');
    if (error) { console.error('[SB] listProducts', error); return []; }
    return (data || []).map(function (p) {
      const c = p.config || {};
      return {
        id: p.id,
        name: p.name,
        clickupListId: c.clickup_list_id || '',
        clickupListName: c.clickup_list_name || '',
        color: c.color || '',
        insPrefix: c.ins_prefix || '',
        createdAt: c.created_at_ms || null,
        lastSyncedAt: c.last_synced_at_ms || null,
        lastSyncedCount: c.last_synced_count || 0
      };
    });
  },

  async upsertProduct(p) {
    if (!SB || !p || !p.id) return;
    const config = {
      clickup_list_id: p.clickupListId || '',
      clickup_list_name: p.clickupListName || '',
      color: p.color || '',
      ins_prefix: p.insPrefix || '',
      created_at_ms: p.createdAt || null,
      last_synced_at_ms: p.lastSyncedAt || null,
      last_synced_count: p.lastSyncedCount || 0
    };
    const { error } = await SB.from('products').upsert({ id: p.id, name: p.name, config: config });
    if (error) console.error('[SB] upsertProduct', error);
  },

  async deleteProduct(productId) {
    if (!SB) return;
    // Cascade will drop angles/personas/ads/cells/etc.
    const { error } = await SB.from('products').delete().eq('id', productId);
    if (error) console.error('[SB] deleteProduct', error);
  },

  async loadProductData(productId) {
    if (!SB || !productId) return null;
    const [angles, personas, ads, cells, actions] = await Promise.all([
      SB.from('angles').select('*').eq('product_id', productId),
      SB.from('personas').select('*').eq('product_id', productId),
      SB.from('ads').select('*').eq('product_id', productId),
      SB.from('matrix_cells').select('*').eq('product_id', productId),
      SB.from('manual_actions').select('*').eq('product_id', productId)
    ]);
    const meta = {}, assigns = {};
    (cells.data || []).forEach(function (c) {
      const cellKey2 = (c.meta && c.meta.cell_key) || (c.angle_id + '||' + c.persona_id);
      meta[cellKey2] = (c.meta && c.meta.meta) || {};
      assigns[cellKey2] = c.creative_assignments || [];
      // ── Rehydrate 3-part per-ad metadata back into MATRIX_CELL_META ──
      // On save, keys like "adId||angle||persona" get folded into meta.per_ad
      // as { adId: {...meta} }. Without this rehydration step, task names,
      // descriptions, due dates, and actionStatus stored per-ad-in-cell are
      // lost on every page reload — causing the UI to show stale / blank
      // task names and duplicating Action Plan pushes.
      const perAd = c.meta && c.meta.per_ad;
      if (perAd && typeof perAd === 'object') {
        Object.keys(perAd).forEach(function (adId) {
          const adKey = adId + '||' + c.angle_id + '||' + c.persona_id;
          meta[adKey] = perAd[adId] || {};
        });
      }
    });
    return {
      ANGLES: (angles.data || []).map(function (a) { return { id: a.id, name: a.name, status: a.status, sourceLink: a.source_link || '', notes: a.notes || '' }; }),
      PERSONAS: (personas.data || []).map(function (p) { return { id: p.id, name: p.name, status: p.status, sourceLink: p.source_link || '', notes: p.notes || '' }; }),
      ADS: (ads.data || []).map(_rowToAd),
      MATRIX_CELL_META: meta,
      CELL_CREATIVE_ASSIGNMENTS: assigns,
      MANUAL_ACTIONS: (actions.data || []).map(function (m) { return Object.assign({}, m.payload || {}, { _dbId: m.id, liveStatus: m.live_status }); }),
      PROD: [], // derived from ads, no dedicated table
      ANGLE_PERSONAS: [] // populated elsewhere
    };
  },

  // Full-sync write of an entire product's state (used by saveState, debounced).
  // Semantics: SNAPSHOT — whatever's in `state` is the new truth. Rows that existed
  // but aren't in the new state get deleted. This matches the old localStorage
  // 'serialize the whole blob' behaviour so delete / clear / bulk-remove actually
  // persist instead of coming back on refresh.
  async saveProductData(productId, state) {
    if (!SB || !productId) return { ok: false, error: 'no client or productId' };

    // Fetch existing IDs once so we can compute orphan-deletes across all tables.
    // Primary-key tables: ads, angles, personas (id text).
    // Composite-key table: matrix_cells (product_id, angle_id, persona_id).
    // uuid table with stable blob: manual_actions (we track via ma._dbId).
    const [existingAds, existingAngles, existingPersonas, existingCells] = await Promise.all([
      SB.from('ads').select('id').eq('product_id', productId),
      SB.from('angles').select('id').eq('product_id', productId),
      SB.from('personas').select('id').eq('product_id', productId),
      SB.from('matrix_cells').select('id, angle_id, persona_id').eq('product_id', productId)
    ]);

    const tasks = [];

    // ── ANGLES ───────────────────────────────────────────────────
    // DB-authoritative policy (added Apr 2026 to stop stale-cache resurrection):
    // If a local angle has an id the DB doesn't know about AND is NOT flagged
    // as locally-added-this-session (_localNew), it's a stale in-memory row
    // from a browser tab that wasn't refreshed after an external DELETE.
    // DROP those from local state instead of upserting them back.
    const existingAngleIdSet = new Set((existingAngles.data || []).map(function(r){ return r.id; }));
    const survivingLocalAngles = (state.ANGLES || []).filter(function(a){
      return existingAngleIdSet.has(a.id) || a._localNew === true;
    });
    const droppedAngleCount = (state.ANGLES || []).length - survivingLocalAngles.length;
    if (droppedAngleCount > 0) {
      console.log('[SB] pruned', droppedAngleCount, 'stale local angles (deleted elsewhere, not upserting back)');
      // Also reflect the pruning in live memory so the UI updates.
      if (typeof ANGLES !== 'undefined' && Array.isArray(ANGLES)) {
        ANGLES = ANGLES.filter(function(a){ return existingAngleIdSet.has(a.id) || a._localNew === true; });
      }
    }
    const angleRows = survivingLocalAngles.map(function (a) {
      return { id: a.id, product_id: productId, name: a.name || '', status: a.status || 'Untested', source_link: a.sourceLink || null, notes: a.notes || null };
    });
    const angleIds = new Set(angleRows.map(function (r) { return r.id; }));
    const angleOrphans = (existingAngles.data || []).filter(function (r) { return !angleIds.has(r.id); }).map(function (r) { return r.id; });
    if (angleOrphans.length) tasks.push(SB.from('angles').delete().in('id', angleOrphans));
    if (angleRows.length)    tasks.push(SB.from('angles').upsert(angleRows));

    // ── PERSONAS ─────────────────────────────────────────────────
    // Same DB-authoritative policy as ANGLES above.
    const existingPersonaIdSet = new Set((existingPersonas.data || []).map(function(r){ return r.id; }));
    const survivingLocalPersonas = (state.PERSONAS || []).filter(function(p){
      return existingPersonaIdSet.has(p.id) || p._localNew === true;
    });
    const droppedPersonaCount = (state.PERSONAS || []).length - survivingLocalPersonas.length;
    if (droppedPersonaCount > 0) {
      console.log('[SB] pruned', droppedPersonaCount, 'stale local personas (deleted elsewhere, not upserting back)');
      if (typeof PERSONAS !== 'undefined' && Array.isArray(PERSONAS)) {
        PERSONAS = PERSONAS.filter(function(p){ return existingPersonaIdSet.has(p.id) || p._localNew === true; });
      }
    }
    const personaRows = survivingLocalPersonas.map(function (p) {
      return { id: p.id, product_id: productId, name: p.name || '', status: p.status || 'Untested', source_link: p.sourceLink || null, notes: p.notes || null };
    });
    const personaIds = new Set(personaRows.map(function (r) { return r.id; }));
    const personaOrphans = (existingPersonas.data || []).filter(function (r) { return !personaIds.has(r.id); }).map(function (r) { return r.id; });
    if (personaOrphans.length) tasks.push(SB.from('personas').delete().in('id', personaOrphans));
    if (personaRows.length)    tasks.push(SB.from('personas').upsert(personaRows));

    // ── ADS ──────────────────────────────────────────────────────
    const adRows = (state.ADS || []).map(function (a) { return _adToRow(a, productId); });
    const adIds = new Set(adRows.map(function (r) { return r.id; }));
    const adOrphans = (existingAds.data || []).filter(function (r) { return !adIds.has(r.id); }).map(function (r) { return r.id; });
    if (adOrphans.length) tasks.push(SB.from('ads').delete().in('id', adOrphans));
    if (adRows.length)    tasks.push(SB.from('ads').upsert(adRows));

    // ── MATRIX CELLS (composite key, fold 3-part per-ad keys) ────
    const meta = state.MATRIX_CELL_META || {}, assigns = state.CELL_CREATIVE_ASSIGNMENTS || {};
    const cellKeys2 = new Set();
    const perAdMeta = {};
    Object.keys(meta).forEach(function (k) {
      const parts = k.split('||');
      if (parts.length === 2) {
        cellKeys2.add(k);
      } else if (parts.length === 3) {
        const cellKey = parts[1] + '||' + parts[2];
        if (!perAdMeta[cellKey]) perAdMeta[cellKey] = {};
        perAdMeta[cellKey][parts[0]] = meta[k];
      }
    });
    Object.keys(assigns).forEach(function (k) {
      if (k.split('||').length === 2) cellKeys2.add(k);
    });

    const cellRows = [];
    const keepCellKeys = new Set();
    cellKeys2.forEach(function (k) {
      const parts = k.split('||');
      keepCellKeys.add(parts[0] + '||' + parts[1]);
      cellRows.push({
        product_id: productId,
        angle_id: parts[0],
        persona_id: parts[1],
        meta: { cell_key: k, meta: meta[k] || {}, per_ad: perAdMeta[k] || {} },
        creative_assignments: assigns[k] || [],
        action_status: (meta[k] && meta[k].status) || null
      });
    });
    const cellOrphanIds = (existingCells.data || []).filter(function (r) {
      return !keepCellKeys.has(r.angle_id + '||' + r.persona_id);
    }).map(function (r) { return r.id; });
    if (cellOrphanIds.length) tasks.push(SB.from('matrix_cells').delete().in('id', cellOrphanIds));
    if (cellRows.length)      tasks.push(SB.from('matrix_cells').upsert(cellRows, { onConflict: 'product_id,angle_id,persona_id' }));

    // ── MANUAL_ACTIONS ───────────────────────────────────────────
    const actRows = (state.MANUAL_ACTIONS || []).map(function (ma) {
      var payload = {};
      for (var k in ma) { if (k !== '_dbId') payload[k] = ma[k]; }
      var row = { product_id: productId, payload: payload, live_status: ma.liveStatus || null };
      if (ma._dbId) row.id = ma._dbId;
      return row;
    });
    // DELETE → INSERT for manual_actions. Small row count, idempotent.
    //
    // CRITICAL: these MUST be serialized (awaited sequentially) inside a single
    // promise, NOT pushed as two independent entries into `tasks` (which is
    // eventually fed to Promise.allSettled). Pushing them independently means
    // the DELETE and INSERT requests race on the wire — if the INSERT arrives
    // at Supabase first and the DELETE arrives second, the DELETE wipes the
    // newly-inserted rows. Server-side `manual_actions` ends up empty; the
    // subsequent realtime echo (after the 1500ms self-save grace window)
    // reads that empty state and replaces in-memory `MANUAL_ACTIONS`, causing
    // the just-created task to silently disappear from the Action Plan AND
    // the Production filter (since renderCreativeTracker derives its
    // "production" pool from MANUAL_ACTIONS' _clickupId set + ad.taskType).
    tasks.push((async function () {
      const del = await SB.from('manual_actions').delete().eq('product_id', productId);
      if (del && del.error) throw del.error;
      if (!actRows.length) return { data: null, error: null };
      // Strip _dbId (uuid) from rows to let DB generate fresh ones, avoids PK conflicts
      const ins = await SB.from('manual_actions').insert(actRows.map(function (r) {
        var { id, ...rest } = r;
        return rest;
      }));
      if (ins && ins.error) throw ins.error;
      return ins;
    })());

    const results = await Promise.allSettled(tasks);
    const errs = results.filter(function (r) { return r.status === 'rejected' || (r.value && r.value.error); });
    if (errs.length) {
      console.warn('[SB] saveProductData partial errors', errs);
      return { ok: false, errors: errs };
    }
    // After a clean save, clear the _localNew flag on any angles/personas so
    // they are no longer exempt from the stale-pruning logic on subsequent
    // saves. If a row is deleted externally after this, the next save will
    // correctly drop it from local state instead of resurrecting it.
    try {
      if (typeof ANGLES !== 'undefined' && Array.isArray(ANGLES))
        ANGLES.forEach(function (a) { if (a && a._localNew) delete a._localNew; });
      if (typeof PERSONAS !== 'undefined' && Array.isArray(PERSONAS))
        PERSONAS.forEach(function (p) { if (p && p._localNew) delete p._localNew; });
    } catch (_) { /* best-effort, never block the save */ }
    return { ok: true };
  },

  async listInspirations(productId) {
    if (!SB) return [];
    const { data, error } = await SB.from('inspirations').select('*').eq('product_id', productId).order('created_at');
    if (error) { console.error('[SB] listInspirations', error); return []; }
    // Merge the jsonb `data` blob with top-level columns so all fields
    // (sourceUrl, angle, persona, hookType, creativeStructure, _clickupDocPageUrl,
    // importTags, etc.) are present — restoring full parity with localStorage.
    return (data || []).map(function (r) {
      const blob = r.data || {};
      return Object.assign({}, blob, {
        id: r.id,
        url: r.url || blob.url,
        sourceUrl: blob.sourceUrl || r.url,
        title: r.title || blob.title || '',
        platform: r.platform || blob.platform || '',
        addedBy: r.added_by || blob.addedBy || '',
        status: r.status || blob.status || 'saved'
      });
    });
  },

  async saveInspirations(productId, inspirations) {
    if (!SB) return;
    if (!Array.isArray(inspirations) || !inspirations.length) return;

    // Keys the classify-inspiration skill writes server-side after classification.
    // The frontend's in-memory copy may be stale (e.g. realtime event missed, or
    // the skill patched these fields between our last fetch and this save). We
    // re-read the current server values and let the SERVER WIN for these keys
    // so we never clobber a just-created brief URL with an empty string.
    const SERVER_OWNED_KEYS = [
      '_clickupDocPageUrl',
      '_clickupDocId',
      '_inspoDocCreated'
    ];

    // Pre-read current server state for exactly the rows we're about to upsert
    // so we can preserve server-owned keys. One round-trip, no transaction
    // needed — race window shrinks from seconds (realtime poll cadence) to
    // milliseconds (read-then-write).
    const ids = inspirations.map(function (i) { return i.id; }).filter(Boolean);
    let serverDataById = {};
    if (ids.length) {
      const preRead = await SB.from('inspirations')
        .select('id, data')
        .in('id', ids)
        .eq('product_id', productId);
      if (preRead.error) {
        console.warn('[SB] saveInspirations pre-read failed, falling back to blind upsert:', preRead.error);
      } else {
        (preRead.data || []).forEach(function (r) {
          serverDataById[r.id] = r.data || {};
        });
      }
    }

    // Strip only truly transient keys before storing. Everything else (angle, persona,
    // hookType, _clickupDocPageUrl, body_copy, …) goes into the `data` jsonb blob.
    const rows = inspirations.map(function (i) {
      const blob = {};
      Object.keys(i).forEach(function (k) {
        // Skip undefined and the mirrored top-level columns
        if (i[k] === undefined) return;
        blob[k] = i[k];
      });
      // Merge: server wins for server-owned keys. If the server has a value and
      // our in-memory copy is empty/missing, take the server's value.
      const serverData = serverDataById[i.id] || {};
      SERVER_OWNED_KEYS.forEach(function (k) {
        var serverVal = serverData[k];
        var localVal  = blob[k];
        // Take server value if it exists and local value is empty/missing.
        if (serverVal !== undefined && serverVal !== null && serverVal !== '' &&
            (localVal === undefined || localVal === null || localVal === '')) {
          blob[k] = serverVal;
        }
      });
      return {
        id: i.id,
        product_id: productId,
        url: i.sourceUrl || i.url || '',
        title: i.title || i.formatName || null,
        platform: i.platform || null,
        added_by: i.addedBy || null,
        status: i.status || 'saved',
        data: blob
      };
    });
    const { error } = await SB.from('inspirations').upsert(rows);
    if (error) console.error('[SB] saveInspirations', error);
  },

  // Replaces bridge POST /queue
  async enqueueInspirations(productId, items) {
    if (!SB || !items || !items.length) return { ok: false };
    const rows = items.map(function (it) {
      return {
        ins_id: it.id || it.ins_id || ('INS-' + Date.now()),
        product_id: productId,
        url: it.url,
        platform: it.platform || null,
        status: 'pending'
      };
    });
    const { error } = await SB.from('inspiration_queue').upsert(rows, { onConflict: 'ins_id,product_id' });
    if (error) { console.error('[SB] enqueueInspirations', error); return { ok: false, error: error }; }
    return { ok: true, count: rows.length };
  },

  // Replaces bridge GET /queue
  async getQueue(productId) {
    if (!SB) return [];
    let q = SB.from('inspiration_queue').select('*');
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q.order('queued_at', { ascending: true });
    if (error) { console.error('[SB] getQueue', error); return []; }
    return data || [];
  },

  // Replaces bridge GET /results
  async getResults(productId) {
    if (!SB) return [];
    let q = SB.from('inspiration_results').select('*');
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q.order('classified_at', { ascending: false });
    if (error) { console.error('[SB] getResults', error); return []; }
    return data || [];
  },

  // Replaces bridge DELETE /queue
  async clearQueue(productId) {
    if (!SB) return;
    let q = SB.from('inspiration_queue').delete();
    if (productId) q = q.eq('product_id', productId);
    else q = q.neq('id', '00000000-0000-0000-0000-000000000000'); // match all
    const { error } = await q;
    if (error) console.error('[SB] clearQueue', error);
  },

  // Replaces bridge DELETE /results
  async clearResults(productId) {
    if (!SB) return;
    let q = SB.from('inspiration_results').delete();
    if (productId) q = q.eq('product_id', productId);
    else q = q.neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await q;
    if (error) console.error('[SB] clearResults', error);
  },

  // Realtime subscription helper
  subscribeToProduct(productId, onChange) {
    if (!SB || !productId) return null;
    const ch = SB.channel('product:' + productId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ads', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matrix_cells', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'angles', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personas', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspirations', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspiration_queue', filter: 'product_id=eq.' + productId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspiration_results', filter: 'product_id=eq.' + productId }, onChange)
      .subscribe();
    return ch;
  },

  unsubscribe(ch) { if (SB && ch) SB.removeChannel(ch); }
};

// Expose for debugging in DevTools
window.DB = DB;
window.SB = SB;

// ── REALTIME: subscribe to changes on the active product ──
let _activeRTChannel = null;
let _rtMergeTimer = null;
function _resubscribeRealtime() {
  if (!DB.ready) return;
  if (_activeRTChannel) { DB.unsubscribe(_activeRTChannel); _activeRTChannel = null; }
  if (!activeProductId) return;
  _activeRTChannel = DB.subscribeToProduct(activeProductId, function (payload) {
    // Debounce — coalesce bursts of changes into a single re-fetch + re-render
    if (_rtMergeTimer) clearTimeout(_rtMergeTimer);
    _rtMergeTimer = setTimeout(async function () {
      _rtMergeTimer = null;
      try {
        // ──── SELF-ECHO GUARDS ────
        // Realtime echoes our OWN writes back to us. During a local save (or
        // just-after, while network catches up), re-fetching would observe a
        // transient partial DB state — rows deleted but replacement upserts
        // not yet applied → the screen would flash blank. Bail in these cases;
        // our in-memory state already reflects the changes.
        if (_saveScheduled) return;                    // a save is debounced
        if (_saveInFlight) return;                     // a save is running right now
        if (Date.now() - _lastSaveCompletedAt < 1500) return; // grace window for echoes

        // Only merge if we're still on the same product
        const pid = activeProductId;
        const st = await DB.loadProductData(pid);
        if (!st || pid !== activeProductId) return;
        // Re-check the save guards AFTER the network round-trip in case another
        // save started while we were fetching.
        if (_saveScheduled || _saveInFlight) return;
        // And don't clobber data that doesn't belong here (mid-switch guard)
        if (_adsProductId && _adsProductId !== activeProductId) return;
        ANGLES = st.ANGLES || ANGLES;
        PERSONAS = st.PERSONAS || PERSONAS;
        // ── ADS: union-merge preserving LOCAL provenance fields ──
        //
        // Same class of bug as MANUAL_ACTIONS below: a realtime event on one
        // table (e.g. matrix_cells) triggers a re-read of ALL tables including
        // ads. If our latest save hasn't propagated to the read replica yet,
        // st.ADS contains the PRE-update view — blind-overwriting ADS would
        // demote a just-promoted production task back to 'format' and make it
        // drop out of the Production filter 10-20s after creation.
        //
        // Strategy: per-ad, prefer DB for ClickUp-authoritative fields (angle,
        // persona, status, etc. — those come back from ClickUp) but prefer the
        // LOCAL copy for provenance fields listed in _META_FIELDS (taskType,
        // sourceFormatId, _fromInspoId, …). Any DB-only ads are added; any
        // local-only ads (save still pending) are kept.
        if (Array.isArray(st.ADS)) {
          var _localAdById = {};
          for (var _la = 0; _la < ADS.length; _la++) {
            if (ADS[_la] && ADS[_la].id) _localAdById[ADS[_la].id] = ADS[_la];
          }
          var _mergedAds = [];
          for (var _dai = 0; _dai < st.ADS.length; _dai++) {
            var _dbAd = st.ADS[_dai];
            if (!_dbAd || !_dbAd.id) continue;
            var _localAd = _localAdById[_dbAd.id];
            if (_localAd) {
              // Prefer LOCAL provenance fields over DB (race-window safety)
              for (var _mfi = 0; _mfi < _META_FIELDS.length; _mfi++) {
                var _mf = _META_FIELDS[_mfi];
                if (_localAd[_mf] !== undefined && _localAd[_mf] !== null && _localAd[_mf] !== '') {
                  _dbAd[_mf] = _localAd[_mf];
                }
              }
              // Preserve _clickupId link if local has it (covers save-lag window)
              if (_localAd._clickupId && !_dbAd._clickupId) {
                _dbAd._clickupId = _localAd._clickupId;
                _dbAd._clickupUrl = _localAd._clickupUrl || _dbAd._clickupUrl;
              }
              _mergedAds.push(_dbAd);
              delete _localAdById[_dbAd.id];
            } else {
              _mergedAds.push(_dbAd);
            }
          }
          // Any local-only ads (newly created, save still pending) — keep them
          for (var _lo in _localAdById) _mergedAds.push(_localAdById[_lo]);
          ADS = _mergedAds;
        }
        MATRIX_CELL_META = st.MATRIX_CELL_META || MATRIX_CELL_META;
        CELL_CREATIVE_ASSIGNMENTS = st.CELL_CREATIVE_ASSIGNMENTS || CELL_CREATIVE_ASSIGNMENTS;
        // ── MANUAL_ACTIONS: union-merge, do NOT blind-overwrite ──
        //
        // The realtime subscription does NOT listen to the `manual_actions` table
        // (see DB.subscribeToProduct — only ads/matrix_cells/angles/personas/inspirations*).
        // So when the handler fires (triggered by a change to some OTHER table) and re-reads
        // manual_actions from DB as a side effect, it can observe stale/empty state — e.g.
        // when our own recent DELETE→INSERT hasn't committed on the read replica yet, or
        // when the read happens between our own writes on another tab.
        //
        // Blindly doing `MANUAL_ACTIONS = st.MANUAL_ACTIONS` in that window WIPES locally-
        // created actions, which is the "task vanishes 10-20s after creation" bug.
        //
        // Safer: union by id, preferring the local copy (which reflects the user's latest
        // in-memory edits). Only add entries from DB that we don't already have locally.
        if (Array.isArray(st.MANUAL_ACTIONS)) {
          var _localById = {};
          for (var _li = 0; _li < MANUAL_ACTIONS.length; _li++) {
            if (MANUAL_ACTIONS[_li] && MANUAL_ACTIONS[_li].id) {
              _localById[MANUAL_ACTIONS[_li].id] = MANUAL_ACTIONS[_li];
            }
          }
          for (var _di = 0; _di < st.MANUAL_ACTIONS.length; _di++) {
            var _dbAct = st.MANUAL_ACTIONS[_di];
            if (!_dbAct || !_dbAct.id) continue;
            if (!_localById[_dbAct.id]) {
              // TOMBSTONE CHECK: if this id was deleted by the user in the
              // last few seconds, our direct DB-delete may not have
              // propagated to the read replica yet. Don't resurrect it.
              if (_recentlyDeletedMaIds.has(_dbAct.id)) continue;
              // Local doesn't have it — another tab/session added it. Include.
              MANUAL_ACTIONS.push(_dbAct);
              _localById[_dbAct.id] = _dbAct;
            } else if (_dbAct._clickupId && !_localById[_dbAct.id]._clickupId) {
              // DB has a ClickUp id we don't — merge it in so the "↗ ClickUp" link appears.
              _localById[_dbAct.id]._clickupId = _dbAct._clickupId;
            } else if (_dbAct.liveStatus && _localById[_dbAct.id].liveStatus !== _dbAct.liveStatus) {
              // Refresh the live ClickUp status from DB.
              _localById[_dbAct.id].liveStatus = _dbAct.liveStatus;
            }
          }
        }
        // Re-derive + re-render
        P = process(ADS);
        if (typeof deriveWinners === 'function') deriveWinners();
        if (typeof genActions === 'function') genActions();
        if (typeof buildCreativeUsageIndex === 'function') buildCreativeUsageIndex();
        renderAll();
      } catch (e) { console.error('[SB] realtime merge failed', e); }
    }, 350);
  });
}
window._resubscribeRealtime = _resubscribeRealtime;

// === CONFIGURATION ===
const CFG = {
  key: '',
  lists: {
    creatives: '',
    production: '',
    actions: ''
  },
  fields: {
    angle: { id: '', opts: {} },
    persona: { id: '', opts: {} },
    adFormat: { id: '', opts: {} },
    adType: { id: '', opts: {} },
    funnelStage: { id: '', opts: {} },
    status: { id: '', opts: {} },
    adLink: { id: '' },
    driveLink: { id: '' },
    parentAd: { id: '' },
    variationNumber: { id: '' }
  }
};

// === CONSTANTS ===
let STATUSES = ['Untested', 'Approved', 'In Production', 'Ready to Launch', 'Testing', 'Winner', 'Loser', 'Scale', 'Complete'];
const CREATIVE_STRUCTURES = ['UGC', 'Testimonial', 'Demo', 'Tutorial / How-To', 'Story / Narrative', 'Hook + Offer', 'Listicle', 'Static / Photo', 'Comparison', 'Interview', 'Skit / Roleplay', 'AI / Voiceover'];
const CREATIVE_STRUCTURE_DESC = {
  'UGC': 'Real person, phone-shot, authentic feel',
  'Testimonial': 'Customer review / before-after story',
  'Demo': 'Product shown in action',
  'Tutorial / How-To': 'Step-by-step walkthrough',
  'Story / Narrative': 'Character arc, emotional journey',
  'Hook + Offer': 'Direct response — problem → solution → CTA',
  'Listicle': '"3 reasons why..." / numbered format',
  'Static / Photo': 'Image-only, no video',
  'Comparison': 'Us vs. them / before vs. after',
  'Interview': 'Q&A or talking head format',
  'Skit / Roleplay': 'Acted scenario, scripted situation',
  'AI / Voiceover': 'AI-generated visuals or narrated slideshow'
};
const HOOK_TYPES = ['Pain / Problem', 'Fear', 'Curiosity', 'Social Proof', 'Aspirational', 'Direct Offer', 'Controversy / Bold Claim', 'POV', 'Question', 'News / Trend', 'Pattern Interrupt'];
const HOOK_TYPE_DESC = {
  'Pain / Problem': '"Is your child struggling with..."',
  'Fear': '"Most parents don\'t realize..."',
  'Curiosity': '"Nobody talks about this..."',
  'Social Proof': '"10,000 teachers swear by this"',
  'Aspirational': '"Imagine your kid thriving at school"',
  'Direct Offer': '"50% off ends tonight"',
  'Controversy / Bold Claim': '"School is failing your child"',
  'POV': '"POV: You finally found what works"',
  'Question': '"Why do some kids learn faster?"',
  'News / Trend': '"New study reveals..."',
  'Pattern Interrupt': 'Unexpected visual or sound to stop scroll'
};
const PRODUCTION_STYLES = ['Organic / Raw UGC', 'Polished UGC', 'Professional Studio', 'AI Generated', 'Screen Record', 'Animation / Motion', 'Static Graphic', 'Slideshow', 'Repurposed Organic', 'Competitor Inspired'];
const PRODUCTION_STYLE_DESC = {
  'Organic / Raw UGC': 'Shot on phone, no editing',
  'Polished UGC': 'Phone-shot but edited / captioned',
  'Professional Studio': 'Hired crew, studio lighting',
  'AI Generated': 'Midjourney, Runway, Sora etc.',
  'Screen Record': 'App walkthrough, tutorial',
  'Animation / Motion': '2D/3D animated',
  'Static Graphic': 'Canva-style designed image',
  'Slideshow': 'Images with text/music',
  'Repurposed Organic': 'Taken from organic social post',
  'Competitor Inspired': 'Modelled after a competitor ad'
};
const STATUS_CLS = {
  'Untested': 'notstart',
  'Approved': 'inprog',
  'In Production': 'ready',
  'Ready to Launch': 'test',
  'Testing': 'test',
  'Winner': 'win',
  'Loser': 'lose',
  'Scale': 'win',
  'Complete': 'win'
};
const FUNNEL_STAGES = ['TOF', 'MOF', 'BOF'];
const AD_TYPES = ['Video', 'Photo', 'Carousel', 'UGC', 'VSL', 'AI Style'];
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const PROD_STATUSES = ['to do', 'in progress', 'complete'];
const PROD_LABELS = { 'to do': 'In Queue', 'in progress': 'In Production', 'complete': 'Done' };

// === STATIC SEED DATA: ANGLES ===
const SD_ANGLES = [
  { id: 'ang-001', name: 'Dysregulated Kids', status: 'Winner', sourceLink: 'https://www.facebook.com/61579244277635/posts/122160680324974809/', notes: 'Primary winning angle, strong TOF performance' },
  { id: 'ang-002', name: 'Sextortion', status: 'Untested', sourceLink: 'https://www.facebook.com/ads/library/?id=1857212928256683', notes: 'New find from competitor research' },
  { id: 'ang-003', name: 'Raising Kids', status: 'Winner', sourceLink: 'https://www.facebook.com/61579244277635/posts/122154398300974809/', notes: 'Second winning angle, works with Mom personas' },
  { id: 'ang-004', name: 'ADHD Kids', status: 'Untested', sourceLink: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=trysaphire.com&search_type=keyword_unordered', notes: '1000+ competitor ads found on trysaphire.com' }
];

// === STATIC SEED DATA: PERSONAS ===
const SD_PERSONAS = [
  { id: 'per-001', name: 'Female Teachers 25-44', status: 'Winner', sourceLink: 'https://www.facebook.com/61579244277635/posts/122160680324974809/', notes: 'Primary persona, strong with Dysregulated Kids angle' },
  { id: 'per-002', name: 'Moms Raising Kids 35-44', status: 'Winner', sourceLink: 'https://www.facebook.com/61579244277635/posts/122154398300974809/', notes: 'Works well with Raising Kids angle' },
  { id: 'per-003', name: "Mom's POV", status: 'Untested', sourceLink: 'https://www.facebook.com/ads/library/?id=1821169311890595', notes: '7 ads found from competitor' },
  { id: 'per-004', name: 'Elementary Teachers', status: 'Untested', sourceLink: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=immuvi.com&search_type=keyword_unordered', notes: '170+ competitor ads found' }
];

// === STATIC SEED DATA: AD FORMATS (templates) ===
const SD_FORMATS = [
  'Storytelling Music Style',
  'UGC Format',
  'AI Style',
  'New Angle + UGC',
  'Old Winner Video 1',
  'Old Winner Video 2',
  'Old Winner Photo',
  'New Angle + Photo',
  'Teacher Angle',
  'Competitor Reference'
];

// === STATIC SEED DATA: CREATIVES ===
const SD_CREATIVES = [
  { id: 'AD-001', formatName: 'Storytelling Music Style', adLink: 'https://www.facebook.com/61579244277635/posts/122160680324974809/', driveLink: '', adType: 'Video', funnelStage: 'TOF', status: 'Winner', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'Old Winner' },
  { id: 'AD-002', formatName: 'UGC Format', adLink: 'https://www.facebook.com/ads/library/?id=751722593607242', driveLink: '', adType: 'UGC', funnelStage: 'TOF', status: 'Testing', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-003', formatName: 'AI Style', adLink: 'https://www.facebook.com/ads/library/?id=946009307858827', driveLink: '', adType: 'AI Style', funnelStage: 'TOF', status: 'Untested', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-004', formatName: 'New Angle + UGC', adLink: 'https://www.facebook.com/ads/library/?id=1857212928256683', driveLink: '', adType: 'UGC', funnelStage: 'TOF', status: 'Testing', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-005', formatName: 'Old Winner Video 1', adLink: 'https://www.facebook.com/61579244277635/posts/122154398300974809/', driveLink: '', adType: 'Video', funnelStage: 'TOF', status: 'Winner', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'Old Winner' },
  { id: 'AD-006', formatName: 'Old Winner Video 2', adLink: 'https://www.facebook.com/61579244277635/posts/122158926332974809/', driveLink: '', adType: 'Video', funnelStage: 'TOF', status: 'Winner', angle: 'Raising Kids', persona: 'Moms Raising Kids 35-44', parentAdId: null, variationNumber: null, adOrigin: 'Old Winner' },
  { id: 'AD-007', formatName: 'Old Winner Photo', adLink: 'https://www.facebook.com/61579244277635/posts/122152167464974809/', driveLink: '', adType: 'Photo', funnelStage: 'TOF', status: 'Testing', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-008', formatName: 'Teacher Angle', adLink: 'https://www.facebook.com/ads/library/?id=1345847180336975', driveLink: '', adType: 'Video', funnelStage: 'TOF', status: 'Untested', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-009', formatName: 'Competitor Reference', adLink: 'https://www.facebook.com/ads/library/?id=1790074398356166', driveLink: '', adType: 'Video', funnelStage: 'TOF', status: 'Untested', angle: 'Sextortion', persona: 'Moms Raising Kids 35-44', parentAdId: null, variationNumber: null, adOrigin: 'New Find' },
  { id: 'AD-010', formatName: 'Storytelling Music Style', adLink: 'https://www.facebook.com/61579244277635/posts/122160680324974809/', driveLink: '', adType: 'Video', funnelStage: 'BOF', status: 'In Production', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', parentAdId: 'AD-001', variationNumber: 1, adOrigin: 'New Find' }
];

// === STATIC SEED DATA: PRODUCTION TASKS ===
const SD_PROD = [
  { id: 'prod-001', name: 'Create 5 variations of Winner AD-001', status: 'to do', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', format: 'Storytelling Music Style', dueDate: '2026-04-09' },
  { id: 'prod-002', name: 'Create BOF set for Dysregulated Kids x Teachers', status: 'to do', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', format: 'Old Winner Video 2', dueDate: '2026-04-09' },
  { id: 'prod-003', name: 'UGC Teacher calling out parents - Dysregulated', status: 'in progress', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', format: 'UGC Format', dueDate: '2026-04-09' },
  { id: 'prod-004', name: 'New Angle + UGC Teacher persona variation', status: 'in progress', angle: 'Dysregulated Kids', persona: 'Female Teachers 25-44', format: 'New Angle + UGC', dueDate: '2026-04-09' }
];

/* ============================================================
   Immuvi Command Center - Kids Mental Health Creative Ops
   Complete JavaScript Logic
   ============================================================ */

// ── GLOBAL STATE ──
let PRODUCTS = [];
let activeProductId = null;
let ANGLES = [];
let PERSONAS = [];
let ADS = [];
let PROD = [];
let ACTIONS = [];
let WINNERS = [];
let P = null;
let ANGLE_PERSONAS = {}; // { 'Dysregulated Kids': ['Female Teachers 25-44', ...], ... }
let matrixExpandedCell = null; // 'angleName||personaName' or null
let matrixExpandedAd = null;   // ad id or null
let matrixDetailFunnel = 'All'; // funnel filter in detail panel
let trackerSort = { col: 'id', dir: 1 };
let trackerFilters = { angle: '', persona: '', format: '', adType: '', funnelStage: '', status: '', structure: '', hookType: '', productionStyle: '', taskType: '', dateRange: '' };

// Filter persistence — scoped per product so filters don't leak across.
function _trackerFiltersKey() { return 'immuvi_tracker_filters_' + (activeProductId || 'default'); }
function _saveTrackerFilters() {
  try { localStorage.setItem(_trackerFiltersKey(), JSON.stringify(trackerFilters)); } catch (e) {}
}
function _loadTrackerFilters() {
  try {
    var raw = localStorage.getItem(_trackerFiltersKey());
    if (!raw) return;
    var saved = JSON.parse(raw) || {};
    Object.keys(saved).forEach(function (k) {
      if (k in trackerFilters) trackerFilters[k] = saved[k];
    });
  } catch (e) {}
}
// Push current trackerFilters values onto the <select> elements if they exist in the DOM.
function _syncTrackerFilterDom() {
  var map = {
    fAngle: 'angle', fPersona: 'persona', fFormat: 'format',
    fAdType: 'adType', fFunnel: 'funnelStage', fStatus: 'status',
    fStructure: 'structure', fHook: 'hookType', fProduction: 'productionStyle',
    fDate: 'dateRange'
  };
  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el && trackerFilters[map[id]] != null) el.value = trackerFilters[map[id]];
  });
  var btns = document.querySelectorAll('#taskTypeToggle .tt-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-type') === (trackerFilters.taskType || ''));
  }
}
let selectedActions = new Set();
let dragState = null;
let builderSlots = { angle: null, persona: null, format: null };
let nextAdSerial = 11;
let _filtersPopulated = false;
let _pollingInterval = null;
let _autoSyncInterval = null;   // 30s full diff poll
let _syncCounterInterval = null; // 1s label counter
let _lastSyncedAt = null;        // timestamp of last successful auto-sync
let _autoSyncActive = false;
let CREATIVE_USAGE = {}; // { 'AD-001': [{angle, persona, status}], ... }
let MATRIX_CELL_META = {}; // { 'angle||persona': { description }, 'adId||angle||persona': { status, uniqueName, description, dueDate } }
let CELL_CREATIVE_ASSIGNMENTS = {}; // { 'angle||persona': ['AD-001', 'AD-005', ...] }
let MANUAL_ACTIONS = []; // manually created actions from matrix (preserved across genActions rebuilds)

// Tombstone set: ids of MANUAL_ACTIONS the user just deleted. Held for a short
// window so the realtime-merge handler doesn't resurrect them if the DB read
// replica is still returning the old row. Also short-circuits the "added in
// another tab?" heuristic in the merge. Entries self-expire after ~8s.
var _recentlyDeletedMaIds = new Set();

// Tombstone set for deleted product ids — prevents _flushStateToSupabase's
// products-upsert loop from resurrecting a product another tab just deleted.
// Same TTL pattern as MANUAL_ACTIONS tombstones.
var _recentlyDeletedProductIds = new Set();
function _rememberProductDeletion(productId) {
  if (!productId) return;
  _recentlyDeletedProductIds.add(productId);
  setTimeout(function () { _recentlyDeletedProductIds.delete(productId); }, 15000);
}

// Flag set for the duration of a fresh DB load inside switchProduct. While
// true, the debounced save must NOT fire — otherwise cached-but-stale ADS
// could be flushed back to Supabase before the fresh fetch lands, resurrecting
// rows that were deleted upstream (e.g. by the ClickUp reconcile auto-poll or
// another tab). Cleared when the fresh load applies or fails.
var _freshLoadInProgress = false;
function _rememberManualActionDeletion(id, dbId) {
  if (id) _recentlyDeletedMaIds.add(id);
  setTimeout(function () { if (id) _recentlyDeletedMaIds.delete(id); }, 8000);
  // Fire an IMMEDIATE DB delete so the user's intent reaches Supabase right
  // away — don't wait for the debounced saveState(). Prevents the bug where
  // a realtime echo from some other save arrives before the delete is
  // persisted and the merge logic re-adds the row.
  if (typeof SB !== 'undefined' && SB && activeProductId) {
    try {
      if (dbId) {
        SB.from('manual_actions').delete().eq('id', dbId).then(function(r){
          if (r && r.error) console.error('[SB] manual_action direct delete (by dbId)', r.error);
        });
      } else {
        // Fallback: match by payload->>'id' (text) within this product
        SB.from('manual_actions')
          .delete()
          .eq('product_id', activeProductId)
          .filter('payload->>id', 'eq', id)
          .then(function(r){
            if (r && r.error) console.error('[SB] manual_action direct delete (by payload id)', r.error);
          });
      }
    } catch (e) { console.error('[SB] manual_action direct delete threw', e); }
  }
}
let PRODUCTION_CLICKUP_IDS = {}; // { [clickupTaskId]: sourceFormatAdId } — tasks created via action-plan push
let FIELD_OPTIONS = {
  creativeStructure: [],
  hookType: [],
  productionStyle: []
};
var LS_FIELD_OPTIONS_KEY = 'immuvi_field_options_v1';
let _matrixFormatStatusFilter = 'All'; // status filter for format modal
let _matrixPersonaFilter = 'active';   // 'active' = hide empty persona columns | 'all' = show all

// Field map: per-product, keyed by product ID
// Structure: { [productId]: { creativeStructure: { fieldId, options: [{name, orderindex}] }, ... } }
let PRODUCT_FIELD_MAPS = {};
var LS_FIELD_MAPS_KEY = 'immuvi_field_maps_v1';

function saveFieldMaps() {
  try { localStorage.setItem(LS_FIELD_MAPS_KEY, JSON.stringify(PRODUCT_FIELD_MAPS)); } catch(e) {}
}

function loadFieldMaps() {
  try {
    var raw = localStorage.getItem(LS_FIELD_MAPS_KEY);
    if (raw) PRODUCT_FIELD_MAPS = JSON.parse(raw) || {};
  } catch(e) { PRODUCT_FIELD_MAPS = {}; }
}

function getActiveFieldMap() {
  return activeProductId ? (PRODUCT_FIELD_MAPS[activeProductId] || null) : null;
}

