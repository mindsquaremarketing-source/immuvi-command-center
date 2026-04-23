// ============================================================
//  1. HELPERS
// ============================================================

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// escJs — for values embedded as JS string literals inside onclick/onchange attributes.
// Uses JS backslash-escaping (not HTML entities) so the browser doesn't re-decode
// &#39; → ' before the JS engine sees it, which would break string literals.
function escJs(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function mono(v) {
  return '<span class="mono">' + esc(String(v)) + '</span>';
}

function fmt$(v) {
  if (v == null || isNaN(v)) return '$0';
  var n = Number(v);
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '$' + n.toFixed(0);
}

function todayISO() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function classify(status) {
  var s = (status || '').toLowerCase().replace(/ /g, '-');
  var map = {
    'untested':        { cls: 'notstart',  lbl: 'Untested' },
    'approved':        { cls: 'inprog',    lbl: 'Approved' },
    'in-production':   { cls: 'ready',     lbl: 'In Production' },
    'ready-to-launch': { cls: 'test',      lbl: 'Ready to Launch' },
    'testing':         { cls: 'test',      lbl: 'Testing' },
    'winner':          { cls: 'win',       lbl: 'Winner' },
    'loser':           { cls: 'lose',      lbl: 'Loser' },
    'scale':           { cls: 'win',       lbl: 'Scale' },
    'complete':        { cls: 'win',       lbl: 'Complete' }
  };
  return map[s] || { cls: 'notstart', lbl: status || 'Untested' };
}

// ============================================================
// getProductPrefix — extracts 2-letter prefix from active product name
// e.g. "Astro Rekha" → "AR", "Immuvi" → "IM"
// ============================================================
function getProductPrefix() {
  var ap = typeof getActiveProduct === 'function' ? getActiveProduct() : null;
  var name = (ap && ap.name) ? ap.name : 'IM';
  var words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ============================================================
// generateTaskName — central naming function for all task creation
// source: 'inspo' | 'tracker' | 'manual'
// inspoId: full inspo ID e.g. "AR-INS-007"  (only for 'inspo')
// formatName: format name string             (only for 'tracker')
// ============================================================
function generateTaskName(source, inspoId, formatName) {
  var prefix = getProductPrefix();
  var serial = String(nextAdSerial).padStart(3, '0');

  if (source === 'inspo' && inspoId) {
    // Extract "INS-007" from "AR-INS-007" or "IM-INS-003"
    var insNum = inspoId;
    var insMatch = inspoId.match(/INS-(\d+)/i);
    if (insMatch) insNum = 'INS-' + insMatch[1];
    return prefix + '-' + serial + '-' + insNum;
  }

  if (source === 'tracker' && formatName) {
    return prefix + '-' + serial + '-' + formatName;
  }

  // Manual
  return prefix + '-' + serial;
}

function nextSerialId() {
  var num = nextAdSerial;
  nextAdSerial++;
  return 'AD-' + String(num).padStart(3, '0');
}

function truncateUrl(url, maxLen) {
  if (!url) return '';
  maxLen = maxLen || 35;
  try {
    var u = new URL(url);
    var display = u.hostname + u.pathname;
    if (display.length > maxLen) {
      display = display.substring(0, maxLen - 3) + '...';
    }
    return display;
  } catch (e) {
    if (url.length > maxLen) return url.substring(0, maxLen - 3) + '...';
    return url;
  }
}

// ── CREATIVE MATRIX UTILITY FUNCTIONS ──

// Rename an angle name across CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META keys
function renameAngleInMatrixKeys(oldName, newName) {
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    var p = key.split('||');
    if (p[0] === oldName) {
      var nk = newName + '||' + p[1];
      CELL_CREATIVE_ASSIGNMENTS[nk] = CELL_CREATIVE_ASSIGNMENTS[key];
      delete CELL_CREATIVE_ASSIGNMENTS[key];
    }
  });
  Object.keys(MATRIX_CELL_META).forEach(function(key) {
    var p = key.split('||');
    if (p.length === 2 && p[0] === oldName) {
      var nk = newName + '||' + p[1];
      MATRIX_CELL_META[nk] = MATRIX_CELL_META[key];
      delete MATRIX_CELL_META[key];
    } else if (p.length === 3 && p[1] === oldName) {
      var nk = p[0] + '||' + newName + '||' + p[2];
      MATRIX_CELL_META[nk] = MATRIX_CELL_META[key];
      delete MATRIX_CELL_META[key];
    }
  });
}

// Rename a persona name across CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META keys
function renamePersonaInMatrixKeys(oldName, newName) {
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    var p = key.split('||');
    if (p[1] === oldName) {
      var nk = p[0] + '||' + newName;
      CELL_CREATIVE_ASSIGNMENTS[nk] = CELL_CREATIVE_ASSIGNMENTS[key];
      delete CELL_CREATIVE_ASSIGNMENTS[key];
    }
  });
  Object.keys(MATRIX_CELL_META).forEach(function(key) {
    var p = key.split('||');
    if (p.length === 2 && p[1] === oldName) {
      var nk = p[0] + '||' + newName;
      MATRIX_CELL_META[nk] = MATRIX_CELL_META[key];
      delete MATRIX_CELL_META[key];
    } else if (p.length === 3 && p[2] === oldName) {
      var nk = p[0] + '||' + p[1] + '||' + newName;
      MATRIX_CELL_META[nk] = MATRIX_CELL_META[key];
      delete MATRIX_CELL_META[key];
    }
  });
}

// Remove all CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META keys for a deleted angle
function deleteAngleFromMatrixKeys(name) {
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    if (key.split('||')[0] === name) delete CELL_CREATIVE_ASSIGNMENTS[key];
  });
  Object.keys(MATRIX_CELL_META).forEach(function(key) {
    var p = key.split('||');
    if ((p.length === 2 && p[0] === name) || (p.length === 3 && p[1] === name)) {
      delete MATRIX_CELL_META[key];
    }
  });
}

// Remove all CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META keys for a deleted persona
function deletePersonaFromMatrixKeys(name) {
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    if (key.split('||')[1] === name) delete CELL_CREATIVE_ASSIGNMENTS[key];
  });
  Object.keys(MATRIX_CELL_META).forEach(function(key) {
    var p = key.split('||');
    if ((p.length === 2 && p[1] === name) || (p.length === 3 && p[2] === name)) {
      delete MATRIX_CELL_META[key];
    }
  });
}

// ── MERGE ANGLES ──────────────────────────────────────────────────────────────
// Merge one or more losing angles into a survivor angle.
// All data structures (ADS, INSPIRATIONS, MANUAL_ACTIONS, ANGLE_PERSONAS,
// CELL_CREATIVE_ASSIGNMENTS, MATRIX_CELL_META) are updated atomically.
// ClickUp is updated async for every affected AD that has a _clickupId.
function executeMergeAngles(losingNames, survivorName) {
  if (!survivorName || losingNames.length === 0) return;

  // Track which ADs changed angle so we can push to ClickUp
  var changedAds = [];

  // Collect all personas across all losing angles (union)
  var allPersonas = [];
  losingNames.forEach(function(ln) {
    var lps = ANGLE_PERSONAS[ln] || [];
    lps.forEach(function(p) { if (allPersonas.indexOf(p) === -1) allPersonas.push(p); });
  });

  // 1. Merge CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META for each losing angle
  losingNames.forEach(function(losingName) {
    var losingPersonas = (ANGLE_PERSONAS[losingName] || []).slice();
    losingPersonas.forEach(function(persona) {
      var losingKey   = losingName   + '||' + persona;
      var survivorKey = survivorName + '||' + persona;

      // Merge ad ID arrays (union, no dupes)
      var losingIds = (CELL_CREATIVE_ASSIGNMENTS[losingKey] || []).slice();
      if (losingIds.length > 0) {
        if (!CELL_CREATIVE_ASSIGNMENTS[survivorKey]) CELL_CREATIVE_ASSIGNMENTS[survivorKey] = [];
        losingIds.forEach(function(adId) {
          if (CELL_CREATIVE_ASSIGNMENTS[survivorKey].indexOf(adId) === -1) {
            CELL_CREATIVE_ASSIGNMENTS[survivorKey].push(adId);
          }
          // Rename per-ad cell meta key: adId||losingAngle||persona → adId||survivorAngle||persona
          var oldMetaKey = adId + '||' + losingName   + '||' + persona;
          var newMetaKey = adId + '||' + survivorName + '||' + persona;
          if (MATRIX_CELL_META[oldMetaKey] && !MATRIX_CELL_META[newMetaKey]) {
            MATRIX_CELL_META[newMetaKey] = MATRIX_CELL_META[oldMetaKey];
          }
          delete MATRIX_CELL_META[oldMetaKey];
        });
        delete CELL_CREATIVE_ASSIGNMENTS[losingKey];
      }

      // Rename cell-level meta (2-part key): losingAngle||persona → survivorAngle||persona
      if (MATRIX_CELL_META[losingKey] && !MATRIX_CELL_META[survivorKey]) {
        MATRIX_CELL_META[survivorKey] = MATRIX_CELL_META[losingKey];
      }
      delete MATRIX_CELL_META[losingKey];
    });

    // 2. Merge ANGLE_PERSONAS
    var losingPs = ANGLE_PERSONAS[losingName] || [];
    if (!ANGLE_PERSONAS[survivorName]) ANGLE_PERSONAS[survivorName] = [];
    losingPs.forEach(function(p) {
      if (ANGLE_PERSONAS[survivorName].indexOf(p) === -1) {
        ANGLE_PERSONAS[survivorName].push(p);
      }
    });
    delete ANGLE_PERSONAS[losingName];
  });

  // 3. Update ADS
  for (var i = 0; i < ADS.length; i++) {
    if (losingNames.indexOf(ADS[i].angle) !== -1) {
      ADS[i].angle = survivorName;
      changedAds.push(ADS[i]);
    }
  }

  // 4. Update INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (losingNames.indexOf(INSPIRATIONS[i].angle) !== -1) {
      INSPIRATIONS[i].angle = survivorName;
    }
  }

  // 5. Update MANUAL_ACTIONS
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (losingNames.indexOf(MANUAL_ACTIONS[i].angle) !== -1) {
      MANUAL_ACTIONS[i].angle = survivorName;
    }
  }

  // 6. Remove losing angles from ANGLES array (survivor stays)
  ANGLES = ANGLES.filter(function(a) { return losingNames.indexOf(a.name) === -1; });

  // 7. Rebuild + re-render everything
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();

  // 8. Push updated angle to ClickUp for all affected ADs (async, best-effort)
  var hasCfg = CFG && CFG.key;
  if (hasCfg) {
    changedAds.forEach(function(ad, i) {
      if (ad._clickupId) {
        setTimeout(function() {
          pushFieldToClickUp(ad, 'angle', survivorName).catch(function(){});
        }, i * 200);
      }
    });
  }

  var mergedCount = losingNames.length;
  toast('Merged ' + mergedCount + ' angle' + (mergedCount > 1 ? 's' : '') + ' → "' + survivorName + '"' +
    (hasCfg && changedAds.some(function(a){ return a._clickupId; }) ? ' (ClickUp updating…)' : ''), 'ok');
}

// ── MERGE PERSONAS ─────────────────────────────────────────────────────────────
function executeMergePersonas(losingNames, survivorName) {
  if (!survivorName || losingNames.length === 0) return;

  var changedAds = [];

  // 1. Merge CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META for each losing persona
  losingNames.forEach(function(losingName) {
    // Collect all angles that had this losing persona
    var losingAngles = [];
    Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
      var p = key.split('||');
      if (p[1] === losingName && losingAngles.indexOf(p[0]) === -1) losingAngles.push(p[0]);
    });

    losingAngles.forEach(function(angle) {
      var losingKey   = angle + '||' + losingName;
      var survivorKey = angle + '||' + survivorName;

      var losingIds = (CELL_CREATIVE_ASSIGNMENTS[losingKey] || []).slice();
      if (losingIds.length > 0) {
        if (!CELL_CREATIVE_ASSIGNMENTS[survivorKey]) CELL_CREATIVE_ASSIGNMENTS[survivorKey] = [];
        losingIds.forEach(function(adId) {
          if (CELL_CREATIVE_ASSIGNMENTS[survivorKey].indexOf(adId) === -1) {
            CELL_CREATIVE_ASSIGNMENTS[survivorKey].push(adId);
          }
          // Rename per-ad cell meta key
          var oldMetaKey = adId + '||' + angle + '||' + losingName;
          var newMetaKey = adId + '||' + angle + '||' + survivorName;
          if (MATRIX_CELL_META[oldMetaKey] && !MATRIX_CELL_META[newMetaKey]) {
            MATRIX_CELL_META[newMetaKey] = MATRIX_CELL_META[oldMetaKey];
          }
          delete MATRIX_CELL_META[oldMetaKey];
        });
        delete CELL_CREATIVE_ASSIGNMENTS[losingKey];
      }

      // Cell-level meta (2-part key)
      if (MATRIX_CELL_META[losingKey] && !MATRIX_CELL_META[survivorKey]) {
        MATRIX_CELL_META[survivorKey] = MATRIX_CELL_META[losingKey];
      }
      delete MATRIX_CELL_META[losingKey];
    });

    // 2. Merge ANGLE_PERSONAS — replace losing persona references with survivor
    for (var key in ANGLE_PERSONAS) {
      var idxL = ANGLE_PERSONAS[key].indexOf(losingName);
      if (idxL !== -1) {
        ANGLE_PERSONAS[key].splice(idxL, 1);
        if (ANGLE_PERSONAS[key].indexOf(survivorName) === -1) {
          ANGLE_PERSONAS[key].push(survivorName);
        }
      }
    }
  });

  // 3. Update ADS
  for (var i = 0; i < ADS.length; i++) {
    if (losingNames.indexOf(ADS[i].persona) !== -1) {
      ADS[i].persona = survivorName;
      changedAds.push(ADS[i]);
    }
  }

  // 4. Update INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (losingNames.indexOf(INSPIRATIONS[i].persona) !== -1) {
      INSPIRATIONS[i].persona = survivorName;
    }
  }

  // 5. Update MANUAL_ACTIONS
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (losingNames.indexOf(MANUAL_ACTIONS[i].persona) !== -1) {
      MANUAL_ACTIONS[i].persona = survivorName;
    }
  }

  // 6. Remove losing personas from PERSONAS array
  PERSONAS = PERSONAS.filter(function(p) { return losingNames.indexOf(p.name) === -1; });

  // 7. Rebuild + re-render
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();

  // 8. Push to ClickUp
  var hasCfg = CFG && CFG.key;
  if (hasCfg) {
    changedAds.forEach(function(ad, i) {
      if (ad._clickupId) {
        setTimeout(function() {
          pushFieldToClickUp(ad, 'persona', survivorName).catch(function(){});
        }, i * 200);
      }
    });
  }

  var mergedCount = losingNames.length;
  toast('Merged ' + mergedCount + ' persona' + (mergedCount > 1 ? 's' : '') + ' → "' + survivorName + '"' +
    (hasCfg && changedAds.some(function(a){ return a._clickupId; }) ? ' (ClickUp updating…)' : ''), 'ok');
}

// Purge any CELL_CREATIVE_ASSIGNMENTS / MATRIX_CELL_META keys whose angle or persona
// no longer exists — cleans up stale data from past renames / deletes
function purgeOrphanedMatrixKeys() {
  var angleNames   = ANGLES.map(function(a){ return a.name; });
  var personaNames = PERSONAS.map(function(p){ return p.name; });
  var purged = 0;

  // Pass 1: remove keys for deleted angles/personas
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    var p = key.split('||');
    if (angleNames.indexOf(p[0]) === -1 || personaNames.indexOf(p[1]) === -1) {
      delete CELL_CREATIVE_ASSIGNMENTS[key];
      purged++;
    }
  });
  Object.keys(MATRIX_CELL_META).forEach(function(key) {
    var p = key.split('||');
    if (p.length === 2) {
      if (angleNames.indexOf(p[0]) === -1 || personaNames.indexOf(p[1]) === -1) {
        delete MATRIX_CELL_META[key]; purged++;
      }
    } else if (p.length === 3) {
      if (angleNames.indexOf(p[1]) === -1 || personaNames.indexOf(p[2]) === -1) {
        delete MATRIX_CELL_META[key]; purged++;
      }
    }
  });

  // Pass 2: remove deleted AD entries (ADs that no longer exist in ADS).
  // NOTE: We intentionally do NOT remove ADs from cells based on a mismatch with
  // ad.angle / ad.persona — tracker ADs can be legitimately assigned to cells via
  // "Add Creative" picker with a different stored angle/persona.
  // updateCreativeFieldInline() already handles the "angle changed → clean old cell" case.
  var adMap = {};
  ADS.forEach(function(ad) { adMap[ad.id] = ad; });
  Object.keys(CELL_CREATIVE_ASSIGNMENTS).forEach(function(key) {
    CELL_CREATIVE_ASSIGNMENTS[key] = CELL_CREATIVE_ASSIGNMENTS[key].filter(function(adId) {
      if (!adMap[adId]) {
        // AD was deleted — clean up its meta too
        var p = key.split('||');
        delete MATRIX_CELL_META[adId + '||' + p[0] + '||' + p[1]];
        purged++;
        return false;
      }
      return true;
    });
    if (CELL_CREATIVE_ASSIGNMENTS[key].length === 0) delete CELL_CREATIVE_ASSIGNMENTS[key];
  });

  return purged;
}

function buildCreativeUsageIndex() {
  CREATIVE_USAGE = {};

  // ── Step 1: Auto-populate CELL_CREATIVE_ASSIGNMENTS from Creative Tracker ADS ──
  // Any ad with angle + persona set gets mapped to its matrix cell automatically
  var AUTO_STATUSES = ['Winner', 'Testing', 'Loser', 'Ready to Launch', 'In Progress', 'Not Started', 'Scale'];
  var angleNames   = ANGLES.map(function(a){ return a.name; });
  var personaNames = PERSONAS.map(function(p){ return p.name; });

  ADS.forEach(function(ad) {
    if (!ad.angle || !ad.persona) return;
    // Must match a known angle AND persona
    if (angleNames.indexOf(ad.angle) === -1) return;
    if (personaNames.indexOf(ad.persona) === -1) return;

    var cellKey = ad.angle + '||' + ad.persona;

    // Ensure this persona is assigned to this angle in the matrix
    if (!ANGLE_PERSONAS[ad.angle]) ANGLE_PERSONAS[ad.angle] = [];
    if (ANGLE_PERSONAS[ad.angle].indexOf(ad.persona) === -1) {
      ANGLE_PERSONAS[ad.angle].push(ad.persona);
    }

    // Add ad to cell assignment if not already there
    if (!CELL_CREATIVE_ASSIGNMENTS[cellKey]) CELL_CREATIVE_ASSIGNMENTS[cellKey] = [];
    if (CELL_CREATIVE_ASSIGNMENTS[cellKey].indexOf(ad.id) === -1) {
      CELL_CREATIVE_ASSIGNMENTS[cellKey].push(ad.id);
    }

    // Sync MATRIX_CELL_META status from tracker (always kept in sync)
    var cellAdKey = ad.id + '||' + ad.angle + '||' + ad.persona;
    if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
    MATRIX_CELL_META[cellAdKey].status     = ad.status;
    MATRIX_CELL_META[cellAdKey].funnelStage = ad.funnelStage || 'TOF';
    MATRIX_CELL_META[cellAdKey].formatName  = ad.formatName || '';
    MATRIX_CELL_META[cellAdKey].hookType    = ad.hookType || '';
    MATRIX_CELL_META[cellAdKey].adLink      = ad.adLink || '';
  });

  // ── Step 2: Build CREATIVE_USAGE reverse index ──
  for (var cellKey in CELL_CREATIVE_ASSIGNMENTS) {
    var kParts   = cellKey.split('||');
    var kAngle   = kParts[0], kPersona = kParts[1];
    var adIds    = CELL_CREATIVE_ASSIGNMENTS[cellKey];
    for (var i = 0; i < adIds.length; i++) {
      var adId      = adIds[i];
      var cellAdKey = adId + '||' + kAngle + '||' + kPersona;
      var cellMeta  = MATRIX_CELL_META[cellAdKey] || {};
      if (!CREATIVE_USAGE[adId]) CREATIVE_USAGE[adId] = [];
      CREATIVE_USAGE[adId].push({
        angle: kAngle, persona: kPersona,
        status: cellMeta.status || 'Untested',
        cellAdKey: cellAdKey
      });
    }
  }

  // ── Step 3: Derive inspo statuses from linked tasks ──
  if (typeof deriveInspoStatuses === 'function') deriveInspoStatuses();
}

function generateUniqueName(angle, persona, formatName, funnelStage) {
  // Abbreviate long names: take first 10 chars of each word-start
  function abbrev(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    // Take first letters of words up to maxLen
    var words = str.split(/[\s\-_]+/);
    var short = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (i === 0) {
        short += w.substring(0, Math.min(w.length, 8));
      } else {
        short += w.substring(0, Math.min(w.length, 5));
      }
      if (short.length >= maxLen) break;
    }
    return short.substring(0, maxLen);
  }
  var aShort = abbrev(angle, 12);
  var pShort = abbrev(persona, 12);
  var fShort = abbrev(formatName, 12);
  var stage = funnelStage || 'TOF';
  return aShort + ' \u00D7 ' + pShort + ' | ' + fShort + ' | ' + stage;
}

function getCreativeUsageSummary(adId) {
  // For production ADs: usage count is meaningless (they're each bound to exactly 1 cell by design).
  // Return empty so callers don't render a "used in 1 cell" badge on them.
  var ad = null;
  for (var _i = 0; _i < ADS.length; _i++) { if (ADS[_i].id === adId) { ad = ADS[_i]; break; } }
  if (ad && ad.taskType === 'production') {
    return { count: 0, locations: [], isProduction: true };
  }

  // For source format ADs: count production ADs that were spawned from this format.
  // This tells you "how many matrix cells have this format scheduled for production."
  var prodLocations = [];
  for (var _j = 0; _j < ADS.length; _j++) {
    var a = ADS[_j];
    if (a.sourceFormatId === adId && a.taskType === 'production') {
      prodLocations.push({
        angle:    a.angle    || '',
        persona:  a.persona  || '',
        status:   a.status   || 'Not Started',
        prodAdId: a.id,
        cellAdKey: a.id + '||' + a.angle + '||' + a.persona
      });
    }
  }
  if (prodLocations.length > 0) {
    return { count: prodLocations.length, locations: prodLocations, fromProduction: true };
  }

  // Fallback: use CREATIVE_USAGE index (for ClickUp-synced or directly-assigned ADs)
  var locations = CREATIVE_USAGE[adId] || [];
  return { count: locations.length, locations: locations, fromProduction: false };
}

