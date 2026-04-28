// ================================================
// Local Quill-delta flattener — sync.js loads after this file in index.html,
// so its extractPlainText is not yet defined when renderCreatives runs on
// initial page load. This self-contained version handles the same shapes
// (well-formed {ops:[...]}, bare ops array) plus a regex fallback that
// recovers "insert" strings from truncated/broken Quill JSON.
// ================================================
function _flattenQuill(val) {
  if (!val) return '';
  var s = String(val).trim();
  if (s.charAt(0) !== '{' && s.charAt(0) !== '[') return s;
  try {
    var parsed = JSON.parse(s);
    var ops = parsed && parsed.ops ? parsed.ops : (Array.isArray(parsed) ? parsed : null);
    if (!ops || !ops.length) return s;
    return ops.map(function(op) {
      if (op && typeof op.insert === 'string') return op.insert;
      if (op && op.insert && typeof op.insert === 'object') return ' ';
      return '';
    }).join('').trim();
  } catch (e) {
    // Truncated / malformed JSON — recover whatever "insert":"..." strings we can.
    var parts = [];
    var rx = /"insert"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    var m;
    while ((m = rx.exec(s)) !== null) {
      try { parts.push(JSON.parse('"' + m[1] + '"')); }
      catch (e2) { parts.push(m[1]); }
    }
    return parts.length ? parts.join('').trim() : s;
  }
}

// ================================================
// showUsagePopup — modal showing all cells a creative is used in
// ================================================
function showUsagePopup(adId) {
  var usage = getCreativeUsageSummary(adId);
  var trackerAd = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === adId) { trackerAd = ADS[i]; break; }
  }
  var adLabel = adId + (trackerAd ? ' &mdash; ' + esc(trackerAd.formatName) : '');

  var bodyHtml = '';
  if (usage.count === 0) {
    bodyHtml = '<div style="color:var(--t3);text-align:center;padding:24px 0">This creative has not been added to any matrix cell yet.</div>';
  } else {
    bodyHtml = '<div class="usage-popup-grid">';
    for (var u = 0; u < usage.locations.length; u++) {
      var loc = usage.locations[u];
      var c = classify(loc.status);
      bodyHtml += '<div class="usage-popup-cell stagger" style="--i:' + u + '">';
      bodyHtml += '<div class="usage-popup-num">' + (u + 1) + '</div>';
      bodyHtml += '<div class="usage-popup-body">';
      bodyHtml += '<div class="usage-popup-angle">' + esc(loc.angle) + '</div>';
      bodyHtml += '<div class="usage-popup-sep">&times;</div>';
      bodyHtml += '<div class="usage-popup-persona">' + esc(loc.persona) + '</div>';
      bodyHtml += '</div>';
      // For production-derived locations: show the production task ID + status + ClickUp link
      if (usage.fromProduction && loc.prodAdId) {
        var prodAd = null;
        for (var _pi = 0; _pi < ADS.length; _pi++) { if (ADS[_pi].id === loc.prodAdId) { prodAd = ADS[_pi]; break; } }
        bodyHtml += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">';
        bodyHtml += '<span class="bdg ' + c.cls + ' bdg-xs">' + esc(loc.status) + '</span>';
        if (prodAd && prodAd._clickupId) {
          bodyHtml += '<a href="https://app.clickup.com/t/' + escAttr(prodAd._clickupId) + '" target="_blank" rel="noopener" class="cu-jump-link" onclick="event.stopPropagation()">&#8599; ClickUp</a>';
        } else {
          bodyHtml += '<span style="font-size:0.6rem;color:var(--t3)">No ClickUp task yet</span>';
        }
        bodyHtml += '</div>';
      } else {
        bodyHtml += '<span class="bdg ' + c.cls + ' bdg-xs">' + esc(loc.status) + '</span>';
      }
      bodyHtml += '</div>';
    }
    bodyHtml += '</div>';
  }

  var titleWord = usage.fromProduction
    ? (usage.count + ' production task' + (usage.count !== 1 ? 's' : '') + ' scheduled')
    : ('Used in ' + usage.count + ' cell' + (usage.count !== 1 ? 's' : ''));

  openModal(
    titleWord + ' &mdash; ' + adLabel,
    bodyHtml,
    '<button class="btn-ghost btn-sm" onclick="closeModal()">Close</button>'
  );
}

function createActionFromMatrix(adId, angleName, personaName, btnEl) {
  var ad = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === adId) { ad = ADS[i]; break; }
  }
  if (!ad) return null;
  // Prevent duplicates
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].sourceAdId === adId && MANUAL_ACTIONS[i].sourceAngle === angleName && MANUAL_ACTIONS[i].sourcePersona === personaName) {
      toast(adId + ' already in Action Plan', 'ok');
      return MANUAL_ACTIONS[i].id;
    }
  }
  var cellAdKey = adId + '||' + angleName + '||' + personaName;
  var cellMeta = MATRIX_CELL_META[cellAdKey] || {};
  var actionId = 'manual-' + Date.now();
  var newAction = {
    id: actionId,
    priority: 'high',
    title: cellMeta.uniqueName || ad.formatName,
    reason: 'Manually pushed from matrix',
    tag: 'manual',
    angle: angleName,
    persona: personaName,
    format: ad.formatName,
    funnelStage: ad.funnelStage || 'TOF',
    dueDate: cellMeta.dueDate || todayISO(),
    description: cellMeta.description || '',
    adId: adId,
    adLink: ad.adLink || '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: adId,
    sourceAngle: angleName,
    sourcePersona: personaName
  };
  MANUAL_ACTIONS.push(newAction);
  // Update cell meta to reflect action status
  if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
  MATRIX_CELL_META[cellAdKey].actionStatus = 'Untested';
  genActions();
  // Defensive: ensure the AD is still in CELL_CREATIVE_ASSIGNMENTS for this cell.
  var _cellKey = angleName + '||' + personaName;
  if (!CELL_CREATIVE_ASSIGNMENTS[_cellKey]) CELL_CREATIVE_ASSIGNMENTS[_cellKey] = [];
  if (CELL_CREATIVE_ASSIGNMENTS[_cellKey].indexOf(adId) === -1) {
    CELL_CREATIVE_ASSIGNMENTS[_cellKey].push(adId);
  }
  // ── Targeted DOM swap: replace ONLY the clicked button with the "In Action
  // Plan" label. This avoids re-rendering the entire matrix (which caused the
  // open cell popup to tear down + rebuild, producing a jarring blank flash).
  // The button's parent <td> is in the cell detail popup.
  if (btnEl && btnEl.parentNode) {
    btnEl.parentNode.innerHTML = '<span class="mx-dt-action-sent">&#10003; In Action Plan &mdash; Untested</span>';
  }
  renderActionPlan();                    // refresh Action Plan tab content
  updateTabCounts();                     // update "Action Plan N" badge in nav
  saveState();                           // debounced persist
  toast(adId + ' added to Action Plan', 'ok');
  return actionId;
}

function createVariationAction(varId, angleName, personaName) {
  var varAd = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === varId) { varAd = ADS[i]; break; }
  }
  if (!varAd) return;
  // Prevent duplicates
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].sourceAdId === varId) {
      toast(varId + ' already in Action Plan', 'ok');
      return;
    }
  }
  var actionId = 'manual-' + Date.now();
  var newAction = {
    id: actionId,
    priority: 'high',
    title: varId + ' variation',
    reason: 'Manually pushed variation from matrix',
    tag: 'variation',
    angle: angleName,
    persona: personaName,
    format: varAd.formatName,
    funnelStage: varAd.funnelStage || 'TOF',
    dueDate: todayISO(),
    description: '',
    adId: varId,
    adLink: varAd.adLink || '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: varId,
    sourceAngle: angleName,
    sourcePersona: personaName,
    parentAdId: varAd.parentAdId || null
  };
  MANUAL_ACTIONS.push(newAction);
  genActions();
  // Defensive: ensure the variation AD stays in its cell after genActions
  var _vCellKey = angleName + '||' + personaName;
  if (!CELL_CREATIVE_ASSIGNMENTS[_vCellKey]) CELL_CREATIVE_ASSIGNMENTS[_vCellKey] = [];
  if (CELL_CREATIVE_ASSIGNMENTS[_vCellKey].indexOf(varId) === -1) {
    CELL_CREATIVE_ASSIGNMENTS[_vCellKey].push(varId);
  }
  renderActionPlan();
  // Skip the expensive full-matrix re-render — the row the user clicked will
  // reflect the change at the next natural render pass. Prevents blank flash.
  updateTabCounts();
  saveState();
  toast(varId + ' added to Action Plan', 'ok');
}

function getActionForAd(adId) {
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    var a = MANUAL_ACTIONS[i];
    if (a.sourceAdId === adId) {
      return {
        inActionPlan: true,
        actionId:     a.id,
        status:       a.liveStatus || 'Untested',
        clickupId:    a._clickupId || null   // production ClickUp task ID (may differ from sourceAd._clickupId)
      };
    }
  }
  return null;
}


// ====================================================================
// [split.py] next slice from source file begins below
// ====================================================================

// ── 4d. CREATIVE TRACKER ──

function renderCreatives() {
  // Apply filters — only show tracker ads (no trackerRefId, no parentAdId)
  var filtered = [];
  for (var i = 0; i < ADS.length; i++) {
    var ad = ADS[i];
    if (ad.parentAdId || ad.trackerRefId) continue; // skip matrix-cell clones and variations
    if (trackerFilters.angle && ad.angle !== trackerFilters.angle) continue;
    if (trackerFilters.persona && ad.persona !== trackerFilters.persona) continue;
    if (trackerFilters.format && ad.formatName !== trackerFilters.format) continue;
    if (trackerFilters.adType && ad.adType !== trackerFilters.adType) continue;
    if (trackerFilters.funnelStage && ad.funnelStage !== trackerFilters.funnelStage) continue;
    if (trackerFilters.status && ad.status !== trackerFilters.status) continue;
    if (trackerFilters.structure && ad.creativeStructure !== trackerFilters.structure) continue;
    if (trackerFilters.hookType && ad.hookType !== trackerFilters.hookType) continue;
    if (trackerFilters.productionStyle && ad.productionStyle !== trackerFilters.productionStyle) continue;
    // Task type filter: 'format' = non-production, 'production' = production tasks
    if (trackerFilters.taskType === 'format' && ad.taskType === 'production') continue;
    if (trackerFilters.taskType === 'production' && ad.taskType !== 'production') continue;
    if (trackerFilters.dateRange && ad.dateCreated) {
      var now = Date.now();
      var dc = ad.dateCreated;
      var d = new Date(); d.setHours(0,0,0,0); var dayStart = d.getTime();
      var weekStart = dayStart - ((new Date().getDay() || 7) - 1) * 86400000;
      var monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
      if (trackerFilters.dateRange === 'today' && dc < dayStart) continue;
      if (trackerFilters.dateRange === 'week' && dc < weekStart) continue;
      if (trackerFilters.dateRange === 'month' && dc < monthStart) continue;
    }
    filtered.push(ad);
  }

  // Sort
  var col = trackerSort.col;
  var dir = trackerSort.dir;
  filtered.sort(function (a, b) {
    var va = a[col] || '';
    var vb = b[col] || '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  var bodyEl = document.getElementById('creativesBody');
  if (filtered.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="16"><div class="empty-state"><div class="empty-icon">&#127912;</div><div class="empty-text">No creatives match your filters</div><div class="empty-hint">Try clearing filters or add a new creative</div></div></td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var ad = filtered[i];
    var c = classify(ad.status);
    var linkDisplay = truncateUrl(ad.adLink);
    var extIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left:4px;vertical-align:middle"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var funnelCls = (ad.funnelStage || '').toLowerCase();
    var opts = '';
    for (var s = 0; s < STATUSES.length; s++) {
      opts += '<option value="' + escAttr(STATUSES[s]) + '"' + (STATUSES[s] === ad.status ? ' selected' : '') + '>' + esc(STATUSES[s]) + '</option>';
    }

    // Helper: build select options for a field from an array of names
    function buildInlineOpts(names, currentVal) {
      var o = '<option value="">—</option>';
      for (var oi = 0; oi < names.length; oi++) {
        o += '<option value="' + escAttr(names[oi]) + '"' + (names[oi] === currentVal ? ' selected' : '') + '>' + esc(names[oi]) + '</option>';
      }
      // Always include current value even if not in list
      if (currentVal && names.indexOf(currentVal) === -1) {
        o += '<option value="' + escAttr(currentVal) + '" selected>' + esc(currentVal) + '</option>';
      }
      return o;
    }

    // Build all inline option sets
    var angleOptsRow    = buildInlineOpts(ANGLES.map(function(a){ return a.name; }), ad.angle);
    var personaOptsRow  = buildInlineOpts(PERSONAS.map(function(p){ return p.name; }), ad.persona);
    var structureOptsRow = buildInlineOpts(getFieldNames('creativeStructure'), ad.creativeStructure);
    var hookOptsRow      = buildInlineOpts(getFieldNames('hookType'), ad.hookType);
    var prodStyleOptsRow = buildInlineOpts(getFieldNames('productionStyle'), ad.productionStyle);

    // Find the original index in ADS
    var origIdx = ADS.indexOf(ad);

    // Matrix usage info — clickable button
    var usageSummary = getCreativeUsageSummary(ad.id);
    var usageHtml = '';
    if (ad.taskType === 'production') {
      // Production tasks belong to exactly 1 cell — don't show a usage count badge.
      // Show the cell it belongs to instead.
      var cellLabel = (ad.angle && ad.persona) ? esc(ad.angle) + ' &times; ' + esc(ad.persona) : 'Matrix cell';
      usageHtml = '<span style="font-size:0.62rem;color:var(--inprog)">' + cellLabel + '</span>';
    } else if (usageSummary.count > 0) {
      var cellWord = usageSummary.fromProduction
        ? (usageSummary.count + ' production task' + (usageSummary.count > 1 ? 's' : ''))
        : (usageSummary.count + ' cell' + (usageSummary.count > 1 ? 's' : ''));
      usageHtml = '<button class="mx-usage-btn" onclick="showUsagePopup(\'' + escAttr(ad.id) + '\')">' + cellWord + '</button>';
    } else {
      usageHtml = '<span style="color:var(--t3);font-size:0.62rem">Not in matrix</span>';
    }

    var varCount = ADS.filter(function(v) { return v.parentAdId === ad.id; }).length;
    var varBadge = varCount > 0
      ? '<span class="var-count-badge">' + varCount + ' var' + (varCount !== 1 ? 's' : '') + '</span>'
      : '<span style="color:var(--t3);font-size:0.62rem">0</span>';

    var adIdQ = '\'' + escAttr(ad.id) + '\'';

    // For production tasks, resolve inspiration link + hypothesis from the inspiration chain
    // if the AD's own fields are empty (they inherit from source, which may have been blank).
    var effectiveAdLink       = ad.adLink || '';
    var effectiveHypothesis   = ad.creativeHypothesis || '';
    if (ad.taskType === 'production' && (!effectiveAdLink || !effectiveHypothesis)) {
      // Walk the chain: direct _fromInspoId → sourceFormatId._fromInspoId
      var _chainInspoId = ad._fromInspoId;
      if (!_chainInspoId && ad.sourceFormatId) {
        var _srcFmt = ADS.find(function(a) { return a.id === ad.sourceFormatId; });
        if (_srcFmt) _chainInspoId = _srcFmt._fromInspoId || null;
      }
      if (_chainInspoId) {
        var _chainIns = INSPIRATIONS.find(function(i) { return i.id === _chainInspoId; });
        if (_chainIns) {
          if (!effectiveAdLink)     effectiveAdLink     = _chainIns.sourceUrl || _chainIns._clickupDocPageUrl || '';
          if (!effectiveHypothesis) effectiveHypothesis = _chainIns.creativeHypothesis || '';
        }
      }
    }

    // Hypothesis inline textarea — compact, expands on focus.
    // Defensive: stale meta from older syncs may still hold raw Quill delta
    // JSON. _flattenQuill is defined at the top of this file (no dependency
    // on sync.js, which loads later in index.html).
    var hyp = _flattenQuill(effectiveHypothesis);
    var hypHtml = '<div class="hyp-cell">' +
      '<textarea class="hyp-input' + (hyp ? ' hyp-filled' : '') + '" rows="1" ' +
        'placeholder="Add hypothesis…" ' +
        'onblur="updateCreativeFieldInline(' + adIdQ + ', \'creativeHypothesis\', this.value)" ' +
        'onfocus="this.rows=3" ' +
        'onblur="this.rows=1;updateCreativeFieldInline(' + adIdQ + ', \'creativeHypothesis\', this.value)">' +
        esc(hyp) +
      '</textarea>' +
    '</div>';

    // Inspo source pill
    var inspoPill = '';
    if (ad._fromInspoId) {
      var srcIns = INSPIRATIONS.find(function(ins){ return ins.id === ad._fromInspoId; });
      var pillUrl = srcIns && srcIns._clickupDocPageUrl ? escAttr(srcIns._clickupDocPageUrl) : '';
      if (pillUrl) {
        inspoPill = '<a href="' + pillUrl + '" target="_blank" class="inspo-src-pill" title="From inspiration: ' + escAttr(ad._fromInspoId) + '">&#128204; ' + esc(ad._fromInspoId) + '</a>';
      } else {
        inspoPill = '<span class="inspo-src-pill" title="From inspiration: ' + escAttr(ad._fromInspoId) + '">&#128204; ' + esc(ad._fromInspoId) + '</span>';
      }
    }

    // Production task indicators
    var isProduction = ad.taskType === 'production';
    var prodBadge = '';
    var prodSourcePill = '';
    if (isProduction) {
      prodBadge = '<span class="prod-task-badge" title="Production task — created from action plan">🎬 Production</span>';
      if (ad.sourceFormatId) {
        var srcFmtAd = ADS.find(function(a){ return a.id === ad.sourceFormatId; });
        var srcFmtName = srcFmtAd ? srcFmtAd.formatName : ad.sourceFormatId;
        var srcFmtCuId = srcFmtAd && srcFmtAd._clickupId ? srcFmtAd._clickupId : null;
        if (srcFmtCuId) {
          prodSourcePill = '<a href="https://app.clickup.com/t/' + escAttr(srcFmtCuId) + '" target="_blank" class="prod-source-pill" title="Source format task">📎 From: ' + esc(srcFmtName) + '</a>';
        } else {
          prodSourcePill = '<span class="prod-source-pill" title="Source format">📎 From: ' + esc(srcFmtName) + '</span>';
        }
      }
    }

    var cuLink = ad._clickupId
      ? '<a href="https://app.clickup.com/t/' + escAttr(ad._clickupId) + '" target="_blank" class="cu-jump-link" title="Open in ClickUp">&#8599; ClickUp</a>'
      : '';

    html += '<tr id="ad_row_' + escAttr(ad.id) + '" class="stagger' + (isProduction ? ' prod-task-row' : '') + '" style="--i:' + i + '">' +
      '<td><div style="display:flex;flex-direction:column;gap:3px">' +
        '<span>' + esc(ad.formatName) + (cuLink ? '&nbsp;' + cuLink : '') + '</span>' +
        (prodBadge ? prodBadge : '') +
        (prodSourcePill ? prodSourcePill : '') +
        (inspoPill ? inspoPill : '') +
      '</div></td>' +
      '<td><select class="fs fs-dim' + (ad.angle ? ' fs-filled' : '') + '" onchange="updateCreativeFieldInline(' + adIdQ + ', \'angle\', this.value)">' + angleOptsRow + '</select></td>' +
      '<td><select class="fs fs-dim' + (ad.persona ? ' fs-filled' : '') + '" onchange="updateCreativeFieldInline(' + adIdQ + ', \'persona\', this.value)">' + personaOptsRow + '</select></td>' +
      '<td><select class="fs fs-dim' + (ad.creativeStructure ? ' fs-filled' : '') + '" onchange="updateCreativeFieldInline(' + adIdQ + ', \'creativeStructure\', this.value)">' + structureOptsRow + '</select></td>' +
      '<td><select class="fs fs-dim' + (ad.hookType ? ' fs-filled' : '') + '" onchange="updateCreativeFieldInline(' + adIdQ + ', \'hookType\', this.value)">' + hookOptsRow + '</select></td>' +
      '<td><select class="fs fs-dim' + (ad.productionStyle ? ' fs-filled' : '') + '" onchange="updateCreativeFieldInline(' + adIdQ + ', \'productionStyle\', this.value)">' + prodStyleOptsRow + '</select></td>' +
      '<td style="min-width:160px;max-width:220px">' + hypHtml + '</td>' +
      '<td>' + (effectiveAdLink ? '<a class="link-cell" href="' + escAttr(effectiveAdLink) + '" target="_blank" rel="noopener">' + esc(truncateUrl(effectiveAdLink)) + extIcon + '</a>' : '-') + '</td>' +
      '<td>' + (ad.driveLink ? '<a class="drive-link-cell" href="' + escAttr(ad.driveLink) + '" target="_blank" rel="noopener" title="Open Google Drive file"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:3px"><path d="M12 2L2 19h20L12 2z" fill="#4285F4"/><path d="M2 19l5-9 7 12H2z" fill="#0F9D58"/><path d="M19 19l-7-12-5 9h12z" fill="#FBBC05"/></svg>Drive Link</a>' : '<span style="color:var(--t3);font-size:0.62rem">—</span>') + '</td>' +
      '<td>' + esc(ad.adType) + '</td>' +
      '<td><span class="bdg ' + funnelCls + '">' + esc(ad.funnelStage) + '</span></td>' +
      '<td><select class="fs ' + c.cls + '" onchange="updateCreativeStatus(' + origIdx + ', this.value)">' + opts + '</select></td>' +
      '<td class="ai-date">' + (ad.dateCreated ? (function(ts){ var d=new Date(ts); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); })(ad.dateCreated) : '—') + '</td>' +
      '<td>' + varBadge + '</td>' +
      '<td>' + usageHtml + '</td>' +
      '<td><span class="cu-push-indicator" style="font-size:0.65rem;margin-right:4px"></span><button class="btn-icon" onclick="openEditCreative(\'' + escAttr(ad.id) + '\')" title="Edit">&#9998;</button> <button class="btn-icon btn-del" onclick="deleteCreative(\'' + escAttr(ad.id) + '\')" title="Delete">&#128465;</button></td>' +
    '</tr>';
  }
  bodyEl.innerHTML = html;
}

