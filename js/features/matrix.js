// ================================================
// initAnglePersonas — build ANGLE_PERSONAS from ADS data
// ================================================
function initAnglePersonas() {
  ANGLE_PERSONAS = {};
  var allPersonaNames = PERSONAS.map(function (p) { return p.name; });

  // Initialize each angle with all personas by default
  ANGLES.forEach(function (a) {
    ANGLE_PERSONAS[a.name] = allPersonaNames.slice();
  });

  // Also ensure any angle referenced in ADS but not in ANGLES gets entries
  ADS.forEach(function (ad) {
    if (ad.angle && !ANGLE_PERSONAS[ad.angle]) {
      ANGLE_PERSONAS[ad.angle] = allPersonaNames.slice();
    }
  });
}

// ================================================
// deriveMasterPersonas — union of all personas across all angle assignments
// ================================================
function deriveMasterPersonas() {
  var seen = {};
  var list = [];
  // Use PERSONAS order as master order
  PERSONAS.forEach(function (p) {
    if (!seen[p.name]) {
      seen[p.name] = true;
      list.push(p.name);
    }
  });
  // Also pick up any persona in ANGLE_PERSONAS not in PERSONAS list
  Object.keys(ANGLE_PERSONAS).forEach(function (ang) {
    (ANGLE_PERSONAS[ang] || []).forEach(function (pn) {
      if (!seen[pn]) {
        seen[pn] = true;
        list.push(pn);
      }
    });
  });
  return list;
}

// ================================================
// isPersonaActive — true if persona has ≥1 creative in any angle cell
// ================================================
function isPersonaActive(personaName) {
  for (var ai = 0; ai < ANGLES.length; ai++) {
    var key = ANGLES[ai].name + '||' + personaName;
    if ((CELL_CREATIVE_ASSIGNMENTS[key] || []).length > 0) return true;
  }
  return false;
}

// ================================================
// toggleMatrixPersonaFilter — switch between active-only / all personas
// ================================================
function toggleMatrixPersonaFilter() {
  _matrixPersonaFilter = (_matrixPersonaFilter === 'active') ? 'all' : 'active';
  renderMatrix();
}

// ================================================
// addPersonaToAngle — assign persona to angle
// ================================================
function addPersonaToAngle(angleName, personaName) {
  if (!ANGLE_PERSONAS[angleName]) ANGLE_PERSONAS[angleName] = [];
  if (ANGLE_PERSONAS[angleName].indexOf(personaName) === -1) {
    ANGLE_PERSONAS[angleName].push(personaName);
  }
  renderMatrix();
  saveState();
  toast('Added ' + personaName + ' to ' + angleName, 'ok');
}

// ================================================
// assignAndExpandCell — one-click from an unassigned matrix cell: assigns the
// persona to the angle, expands the cell detail, and scrolls it into view so
// the user can immediately add a creative. Used by the "+"/"Assign & add
// creative" placeholder in renderMatrix().
// ================================================
function assignAndExpandCell(angleName, personaName) {
  // Belt & suspenders: also ensure the persona exists in the PERSONAS array.
  // If a matrix column was sourced from ANGLE_PERSONAS but the persona is
  // missing from PERSONAS (rare, but happens when state syncs race a create),
  // add a stub so the "+ Add Persona" popup + tracker tab stay in sync.
  var hasInPersonas = false;
  for (var pi = 0; pi < PERSONAS.length; pi++) {
    if (PERSONAS[pi].name === personaName) { hasInPersonas = true; break; }
  }
  if (!hasInPersonas) {
    PERSONAS.push({
      id: 'per-' + (PERSONAS.length + 1),
      name: personaName,
      status: 'Untested',
      sourceLink: '',
      notes: '',
      _localNew: true
    });
  }
  // Assign persona to angle (mirror of addPersonaToAngle, minus toast).
  if (!ANGLE_PERSONAS[angleName]) ANGLE_PERSONAS[angleName] = [];
  if (ANGLE_PERSONAS[angleName].indexOf(personaName) === -1) {
    ANGLE_PERSONAS[angleName].push(personaName);
  }
  // Expand this cell so the add-creative UI is immediately visible.
  matrixExpandedCell = angleName + '||' + personaName;
  renderMatrix();
  updateTabCounts();
  saveState();
  toast('Assigned ' + personaName + ' — add a creative below', 'ok');
}

// ================================================
// removePersonaFromAngle — unassign persona from angle
// ================================================
function removePersonaFromAngle(angleName, personaName) {
  // Check if cell has data
  var cellAds = ADS.filter(function (a) {
    return a.angle === angleName && a.persona === personaName;
  });
  if (cellAds.length > 0) {
    if (!confirm('This cell has ' + cellAds.length + ' creative(s). Remove persona assignment anyway?')) return;
  }
  if (ANGLE_PERSONAS[angleName]) {
    ANGLE_PERSONAS[angleName] = ANGLE_PERSONAS[angleName].filter(function (p) { return p !== personaName; });
  }
  // Close detail if it was open for this combo
  if (matrixExpandedCell === angleName + '||' + personaName) {
    matrixExpandedCell = null;
    matrixExpandedAd = null;
  }
  renderMatrix();
  toast('Removed ' + personaName + ' from ' + angleName, 'ok');
}

// ================================================
// openAddPersonaPopup — dropdown of unassigned personas for angle
// ================================================
function openAddPersonaPopup(angleName, btnEl) {
  // Remove existing
  document.querySelectorAll('.mx-persona-dropdown').forEach(function (d) { d.remove(); });

  var assigned = ANGLE_PERSONAS[angleName] || [];
  // Union of PERSONAS + anything seen in ANGLE_PERSONAS so personas that exist
  // in state but haven't been pushed to PERSONAS yet still surface here instead
  // of the popup falsely claiming "All personas assigned".
  var allPersonaNames = deriveMasterPersonas();
  var unassigned = allPersonaNames.filter(function (pn) { return assigned.indexOf(pn) === -1; });

  var html = '<div class="mx-persona-dropdown">';
  if (unassigned.length === 0) {
    html += '<div class="mx-persona-dropdown-empty">All personas assigned</div>';
  } else {
    unassigned.forEach(function (pn) {
      html += '<div class="mx-persona-dropdown-item" onclick="event.stopPropagation();addPersonaToAngle(\'' +
        escJs(angleName) + '\',\'' + escJs(pn) + '\')">';
      html += '<span class="mx-pd-plus">+</span> ' + esc(pn);
      html += '</div>';
    });
  }
  html += '</div>';

  var wrapper = btnEl.closest('.mx-angle-section-hdr');
  if (wrapper) {
    wrapper.style.position = 'relative';
    wrapper.insertAdjacentHTML('beforeend', html);
  }

  setTimeout(function () {
    document.addEventListener('click', closePersonaDropdown);
  }, 10);
}

function closePersonaDropdown(e) {
  if (!e.target.closest('.mx-persona-dropdown') && !e.target.closest('.mx-add-persona-btn')) {
    document.querySelectorAll('.mx-persona-dropdown').forEach(function (d) { d.remove(); });
    document.removeEventListener('click', closePersonaDropdown);
  }
}

// ================================================
// toggleMatrixCell — expand/collapse cell detail
// ================================================
function toggleMatrixCell(angleName, personaName) {
  var key = angleName + '||' + personaName;
  if (matrixExpandedCell === key) {
    matrixExpandedCell = null;
    matrixExpandedAd = null;
  } else {
    matrixExpandedCell = key;
    matrixExpandedAd = null;
    matrixDetailFunnel = 'All';
  }
  renderMatrix();
}

// ================================================
// setDetailFunnel — change funnel filter in detail panel
// ================================================
function setDetailFunnel(funnel) {
  matrixDetailFunnel = funnel;
  renderMatrix();
}

// ================================================
// toggleMatrixAdExpand — expand/collapse ad variation sub-panel
// ================================================
function toggleMatrixAdExpand(adId) {
  if (matrixExpandedAd === adId) {
    matrixExpandedAd = null;
  } else {
    matrixExpandedAd = adId;
  }
  renderMatrix();
}

// ================================================
// changeAdStatusFromMatrix — update ad status inline
// ================================================
function changeAdStatusFromMatrix(adId, angleName, personaName, newStatus) {
  // Update ADS array (source of truth) so buildCreativeUsageIndex doesn't overwrite
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === adId) { ADS[i].status = newStatus; break; }
  }
  // Also update cell meta immediately for instant UI feedback
  var cellAdKey = adId + '||' + angleName + '||' + personaName;
  if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
  MATRIX_CELL_META[cellAdKey].status = newStatus;
  P = process(ADS);
  buildCreativeUsageIndex();
  deriveWinners();
  genActions();
  renderMatrix();
  renderCreatives();
  saveState();
  toast(adId + ' \u2192 ' + newStatus, 'ok');
}

// ================================================
// renderMatrix — main renderer (stacked angle sections)
// ================================================
function renderMatrix() {
  var el = document.getElementById('matrixGrid');
  if (!el) return;

  var masterPersonas = deriveMasterPersonas();

  // Split personas into active / inactive
  var activePersonas   = masterPersonas.filter(function(pn){ return isPersonaActive(pn); });
  var inactivePersonas = masterPersonas.filter(function(pn){ return !isPersonaActive(pn); });

  var visiblePersonas  = (_matrixPersonaFilter === 'all') ? masterPersonas : activePersonas;
  var colCount = visiblePersonas.length;

  var html = '';

  // Header bar
  html += '<div class="mx-header-bar">';
  html += '<div class="sh" style="margin:0;border:0;padding:0">Creative Matrix</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<span class="muted" style="font-size:0.72rem">' + ANGLES.length + ' angles &times; ' + activePersonas.length + ' active personas</span>';

  // Toggle button
  var toggleLabel = _matrixPersonaFilter === 'all'
    ? '👁 Hide inactive'
    : '👁 Show all personas';
  html += '<button class="mx-persona-filter-toggle" onclick="toggleMatrixPersonaFilter()">' + toggleLabel + '</button>';

  // "N inactive hidden" pill
  if (_matrixPersonaFilter === 'active' && inactivePersonas.length > 0) {
    html += '<span class="mx-hidden-pill">' + inactivePersonas.length + ' inactive hidden</span>';
  }

  html += '</div>';
  html += '</div>';

  // Angle sections
  ANGLES.forEach(function (angle, ai) {
    var cls = classify(angle.status);
    var assignedPersonas = ANGLE_PERSONAS[angle.name] || [];

    html += '<div class="mx-angle-section" style="animation-delay:' + (ai * 0.06) + 's">';

    // Section header
    html += '<div class="mx-angle-section-hdr">';
    html += '<span class="mx-angle-name">' + esc(angle.name) + '</span>';
    html += '<span class="bdg ' + cls.cls + ' bdg-xs">' + cls.lbl + '</span>';
    html += '<div class="mx-angle-meta">';
    html += '<button class="mx-add-persona-btn" onclick="event.stopPropagation();openAddPersonaPopup(\'' +
      escJs(angle.name) + '\', this)">+ Add Persona</button>';
    html += '</div>';
    html += '</div>';

    // Grid: columns = angle label + one per visible persona
    var gridCols = '200px repeat(' + colCount + ', 1fr)';
    html += '<div class="mx-angle-grid" style="grid-template-columns:' + gridCols + '">';

    // Persona header row
    html += '<div class="mx-angle-col-hdr">Angle \\ Persona</div>';
    visiblePersonas.forEach(function (pn) {
      var isAssigned = assignedPersonas.indexOf(pn) !== -1;
      var isActive   = isPersonaActive(pn);
      var hdrCls     = 'mx-pcol-hdr' + (!isActive ? ' inactive' : '');
      html += '<div class="' + hdrCls + '" style="' + (!isAssigned ? 'opacity:0.35;' : '') + '">';
      html += esc(pn);
      if (!isActive) {
        html += '<div style="font-size:0.6rem;color:var(--t3);font-weight:400;margin-top:2px">· No creatives yet</div>';
      }
      if (isAssigned) {
        html += '<button class="mx-pcol-remove" onclick="event.stopPropagation();removePersonaFromAngle(\'' +
          escJs(angle.name) + '\',\'' + escJs(pn) + '\')" title="Remove persona">&times;</button>';
      }
      html += '</div>';
    });

    // Data row: angle label + cells
    html += '<div class="mx-angle-label">';
    html += '<div class="mx-al-name">' + esc(angle.name) + '</div>';
    html += '<span class="bdg ' + cls.cls + ' bdg-xs">' + cls.lbl + '</span>';
    html += '</div>';

    visiblePersonas.forEach(function (pn) {
      var isAssigned = assignedPersonas.indexOf(pn) !== -1;
      var isActive   = isPersonaActive(pn);

      if (!isAssigned) {
        // Unassigned cell — clickable to assign the persona to this angle AND
        // open the cell's add-creative UI in one step. For globally-inactive
        // personas in "show all" mode we surface "No creatives yet" so the
        // column's empty state is legible; for everything else a plain "+".
        var _assignClick = 'onclick="event.stopPropagation();assignAndExpandCell(\'' +
          escJs(angle.name) + '\',\'' + escJs(pn) + '\')"';
        var _assignTip   = 'title="Click to assign ' + escAttr(pn) + ' to ' + escAttr(angle.name) + ' and add a creative"';
        if (!isActive && _matrixPersonaFilter === 'all') {
          html += '<div class="mx-cell-inactive mx-cell-clickable" ' + _assignClick + ' ' + _assignTip + '>' +
            '<div class="mx-cell-empty-icon" style="font-size:1.2rem;opacity:0.7">+</div>' +
            '<div style="font-size:0.65rem;color:var(--t3);margin-top:2px">Assign &amp; add creative</div>' +
            '</div>';
        } else {
          html += '<div class="mx-cell-unassigned mx-cell-clickable" ' + _assignClick + ' ' + _assignTip + '>+</div>';
        }
        return;
      }
      // Persona is assigned to this angle — always render the interactive cell,
      // even when the persona has no creatives anywhere yet, so the user can add
      // the first one. (Previously the inactive-check short-circuited here and
      // rendered a dead "No creatives yet" div for assigned-but-empty cells.)
      html += renderMatrixCellV2(angle.name, pn);
    });

    html += '</div>'; // close mx-angle-grid

    // Detail panel (if a cell in this angle is expanded)
    if (matrixExpandedCell) {
      var parts = matrixExpandedCell.split('||');
      if (parts[0] === angle.name) {
        html += renderDetailPanel(parts[0], parts[1]);
      }
    }

    html += '</div>'; // close mx-angle-section
  });

  // Summary bar
  html += renderMatrixSummary();

  el.innerHTML = html;
}

// ================================================
// renderMatrixCellV2 — compact cell (click to expand detail below)
// ================================================
function renderMatrixCellV2(angleName, personaName) {
  var cellKey     = angleName + '||' + personaName;
  var assignedIds = CELL_CREATIVE_ASSIGNMENTS[cellKey] || [];

  // Build cellAds with full tracker data + meta
  var cellAds = [];
  for (var ci = 0; ci < assignedIds.length; ci++) {
    var adId = assignedIds[ci];
    var trackerAd = null;
    for (var ti = 0; ti < ADS.length; ti++) {
      if (ADS[ti].id === adId) { trackerAd = ADS[ti]; break; }
    }
    if (!trackerAd) continue;
    var cellAdKey = adId + '||' + angleName + '||' + personaName;
    var cellMeta  = MATRIX_CELL_META[cellAdKey] || {};
    cellAds.push({
      id:          adId,
      formatName:  trackerAd.formatName || adId,
      status:      cellMeta.status || trackerAd.status || 'Untested',
      funnelStage: cellMeta.funnelStage || trackerAd.funnelStage || 'TOF',
      hookType:    trackerAd.hookType || '',
      adLink:      trackerAd.adLink || '',
      driveLink:   trackerAd.driveLink || '',
      taskType:    trackerAd.taskType || 'format'
    });
  }

  var isExpanded  = matrixExpandedCell === cellKey;
  var expandStyle = isExpanded ? 'border-bottom:2px solid var(--inprog);' : '';

  if (cellAds.length === 0) {
    return '<div class="mx-cell" style="' + expandStyle + '" onclick="toggleMatrixCell(\'' +
      escJs(angleName) + '\',\'' + escJs(personaName) + '\')">' +
      '<div class="mx-cell-empty">' +
      '<div class="mx-cell-empty-icon">+</div>' +
      '<div style="font-size:0.66rem">Untested</div>' +
      '</div></div>';
  }

  // ── Derive cell-level state ──
  var hasWinner  = cellAds.some(function(a){ return a.status === 'Winner' || a.status === 'Scale'; });
  var hasTesting = cellAds.some(function(a){ return a.status === 'Testing'; });
  var hasReady   = cellAds.some(function(a){ return a.status === 'Ready to Launch'; });
  var allLosers  = cellAds.length > 0 && cellAds.every(function(a){ return a.status === 'Loser'; });
  var hasTOF     = cellAds.some(function(a){ return a.funnelStage === 'TOF'; });
  var hasMOF     = cellAds.some(function(a){ return a.funnelStage === 'MOF'; });
  var hasBOF     = cellAds.some(function(a){ return a.funnelStage === 'BOF'; });

  var cellClass = 'mx-cell' +
    (hasWinner  ? ' has-winner'  : '') +
    (hasTesting && !hasWinner ? ' has-testing' : '') +
    (hasReady   && !hasWinner && !hasTesting ? ' has-ready' : '') +
    (allLosers  ? ' all-losers'  : '');

  // ── Status dots ──
  var statusDots = '';
  for (var di = 0; di < cellAds.length; di++) {
    var c = classify(cellAds[di].status);
    statusDots += '<span class="mx-cell-stat-dot" style="background:var(--' + c.cls + ')" title="' + esc(cellAds[di].id) + ' — ' + esc(cellAds[di].status) + '"></span>';
  }

  var html = '<div class="' + cellClass + '" style="' + expandStyle + '" onclick="toggleMatrixCell(\'' +
    escJs(angleName) + '\',\'' + escJs(personaName) + '\')">';

  // Winner badge
  if (hasWinner) html += '<span class="mx-cell-winner-badge">WINNER</span>';

  // AI button
  html += '<button class="mx-cell-ai-btn" onclick="event.stopPropagation();openCellAI(\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\')" title="AI Recommendations">AI</button>';

  // Header: count + status dots
  html += '<div class="mx-cell-hdr">';
  html += '<span class="mono" style="font-size:0.72rem;font-weight:700;color:var(--t1)">' + cellAds.length + ' ad' + (cellAds.length > 1 ? 's' : '') + '</span>';
  html += '<div class="mx-cell-stat-dots">' + statusDots + '</div>';
  html += '</div>';

  // Mini list (top 3 by status priority: Winner > Testing > Ready > rest)
  var sortedAds = cellAds.slice().sort(function(a, b) {
    var order = { 'Winner': 0, 'Scale': 0, 'Testing': 1, 'Ready to Launch': 2, 'In Progress': 3, 'Not Started': 4, 'Loser': 5 };
    return (order[a.status] || 4) - (order[b.status] || 4);
  });
  html += '<div class="mx-cell-mini-list">';
  var showCount = Math.min(sortedAds.length, 3);
  for (var mi = 0; mi < showCount; mi++) {
    var mad = sortedAds[mi];
    var mc  = classify(mad.status);
    html += '<div class="mx-cell-mini-row' + (mad.taskType === 'production' ? ' mx-cell-mini-prod' : '') + '">';
    html += '<span class="mx-cell-mini-dot" style="background:var(--' + mc.cls + ')"></span>';
    html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="' + escAttr(mad.formatName) + '">' + (mad.taskType === 'production' ? '🎬 ' : '') + esc(mad.formatName) + '</span>';
    html += '<span style="font-size:0.58rem;color:var(--t3);flex-shrink:0;margin-left:4px">' + esc(mad.funnelStage || '') + '</span>';
    html += '</div>';
  }
  if (sortedAds.length > 3) {
    html += '<div style="font-size:0.62rem;color:var(--t3);margin-top:2px">+' + (sortedAds.length - 3) + ' more</div>';
  }
  html += '</div>';

  // Funnel coverage row
  html += '<div class="mx-funnel-row">';
  html += '<span class="mx-funnel-pip ' + (hasTOF ? 'filled-tof' : 'empty') + '" title="Top of Funnel">T</span>';
  html += '<span class="mx-funnel-pip ' + (hasMOF ? 'filled-mof' : 'empty') + '" title="Middle of Funnel">M</span>';
  html += '<span class="mx-funnel-pip ' + (hasBOF ? 'filled-bof' : 'empty') + '" title="Bottom of Funnel">B</span>';
  if (hasWinner && !hasMOF) html += '<span style="font-size:0.6rem;color:#D97706;margin-left:4px;font-weight:600">↑ needs MOF</span>';
  if (hasWinner && !hasBOF) html += '<span style="font-size:0.6rem;color:#059669;margin-left:4px;font-weight:600">↑ needs BOF</span>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ================================================
// renderDetailPanel — expanded cell detail view
// ================================================
function renderDetailPanel(angleName, personaName) {
  var cellKey = angleName + '||' + personaName;
  var assignedIds = CELL_CREATIVE_ASSIGNMENTS[cellKey] || [];

  // Build cellAds from tracker ADS + per-cell metadata
  var cellAds = [];
  for (var dci = 0; dci < assignedIds.length; dci++) {
    var dAdId = assignedIds[dci];
    var dTrackerAd = null;
    for (var dti = 0; dti < ADS.length; dti++) {
      if (ADS[dti].id === dAdId) { dTrackerAd = ADS[dti]; break; }
    }
    if (!dTrackerAd) continue;
    var dCellAdKey = dAdId + '||' + angleName + '||' + personaName;
    var dMeta = MATRIX_CELL_META[dCellAdKey] || {};
    cellAds.push({
      id: dAdId,
      formatName: dTrackerAd.formatName,
      adLink: dTrackerAd.adLink,
      driveLink: dTrackerAd.driveLink || '',
      adType: dTrackerAd.adType,
      funnelStage: dTrackerAd.funnelStage || 'TOF',
      status: dMeta.status || dTrackerAd.status || 'Untested',
      adOrigin: dTrackerAd.adOrigin || 'New Find',
      uniqueName: dMeta.uniqueName || dTrackerAd.formatName,
      description: dMeta.description || '',
      dueDate: dMeta.dueDate || '',
      _cellAdKey: dCellAdKey
    });
  }

  // Filter by funnel
  var filteredAds = cellAds;
  if (matrixDetailFunnel !== 'All') {
    filteredAds = cellAds.filter(function (a) { return a.funnelStage === matrixDetailFunnel; });
  }

  var cellMeta = MATRIX_CELL_META[cellKey] || { description: '' };

  var html = '<div class="mx-detail-panel open">';

  // Title
  html += '<div class="mx-detail-title">';
  html += '<span>' + esc(angleName) + '</span>';
  html += '<span class="mx-dt-x">&times;</span>';
  html += '<span>' + esc(personaName) + '</span>';
  html += '<button class="mx-detail-close" onclick="event.stopPropagation();matrixExpandedCell=null;matrixExpandedAd=null;renderMatrix()">Close</button>';
  html += '</div>';

  // Cell-level description area
  html += '<div class="mx-detail-desc-area">';
  html += '<div class="mx-detail-desc-label">Cell Purpose / Notes</div>';
  html += '<textarea placeholder="Describe the purpose of this angle-persona combination..." onblur="event.stopPropagation();saveCellMeta(\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\', this.value)" onclick="event.stopPropagation()">' + esc(cellMeta.description) + '</textarea>';
  html += '</div>';

  // Funnel tabs
  html += '<div class="mx-detail-tabs">';
  var tabs = ['All'].concat(FUNNEL_STAGES);
  tabs.forEach(function (t) {
    html += '<button class="mx-detail-tab' + (matrixDetailFunnel === t ? ' active' : '') + '" onclick="event.stopPropagation();setDetailFunnel(\'' + esc(t) + '\')">' + esc(t) + '</button>';
  });
  html += '</div>';

  // Table
  html += '<table class="mx-detail-table">';
  html += '<thead><tr>';
  html += '<th>Ad #</th><th>Task Name</th><th>Ad Link</th><th>Format</th><th>Funnel</th><th>Origin</th><th>Description</th><th>Due Date</th><th>Status</th><th>Action Plan</th><th></th>';
  html += '</tr></thead>';
  html += '<tbody>';

  if (filteredAds.length === 0) {
    html += '<tr><td colspan="11" style="text-align:center;color:var(--t3);padding:16px">No creatives' +
      (matrixDetailFunnel !== 'All' ? ' for ' + matrixDetailFunnel : '') + '</td></tr>';
  } else {
    filteredAds.forEach(function (ad) {
      var c = classify(ad.status);
      var isAdExpanded = matrixExpandedAd === ad.id;
      var origin = ad.adOrigin;
      var originCls = origin === 'Old Winner' ? 'mx-origin-old' : 'mx-origin-new';
      var usage = getCreativeUsageSummary(ad.id);
      // Production ADs are bound to 1 cell by design — never flag them as "duplicates"
      var isDuplicate = !ad.taskType || ad.taskType !== 'production' ? usage.count > 1 : false;
      var actionInfo = getActionForAd(ad.id);

      html += '<tr onclick="event.stopPropagation();toggleMatrixAdExpand(\'' + esc(ad.id) + '\')" style="' +
        (isAdExpanded ? 'background:rgba(37,99,235,0.04);' : '') + '">';
      html += '<td class="mx-dt-id"><button onclick="event.stopPropagation();navigateToCreative(\'' + escAttr(ad.id) + '\')" style="background:none;border:none;padding:0;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:inherit;color:var(--inprog);text-decoration:underline;text-underline-offset:2px;font-weight:600" title="Go to Creative Tracker">' + esc(ad.id) + '</button></td>';

      // Task Name (editable) — saves to MATRIX_CELL_META
      html += '<td><span class="mx-dt-task-name" contenteditable="true" onblur="event.stopPropagation();saveAdField(\'' + escAttr(ad.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\',\'uniqueName\',this.textContent)" onclick="event.stopPropagation()">' + esc(ad.uniqueName) + '</span></td>';

      // Ad Link + Drive Link
      html += '<td style="white-space:nowrap">';
      if (ad.adLink) {
        html += '<a class="mx-dt-link" href="' + esc(ad.adLink) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#128279; Inspo Link</a>';
      }
      if (ad.driveLink) {
        html += (ad.adLink ? '&nbsp;' : '') + '<a class="mx-dt-drive-link" href="' + escAttr(ad.driveLink) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="vertical-align:middle"><path d="M12 2L2 19h20L12 2z" fill="#4285F4"/><path d="M2 19l5-9 7 12H2z" fill="#0F9D58"/><path d="M19 19l-7-12-5 9h12z" fill="#FBBC05"/></svg>Drive Link</a>';
      }
      if (!ad.adLink && !ad.driveLink) {
        html += '<span style="color:var(--t3);font-size:0.68rem">No link</span>';
      }
      html += '</td>';

      html += '<td>' + esc(ad.formatName) +
        (ad._clickupId ? '&nbsp;<a href="https://app.clickup.com/t/' + escAttr(ad._clickupId) + '" target="_blank" class="cu-jump-link" title="Open in ClickUp" onclick="event.stopPropagation()">&#8599; ClickUp</a>' : '') +
      '</td>';
      html += '<td><span class="bdg ' + ad.funnelStage.toLowerCase() + ' bdg-xs">' + esc(ad.funnelStage) + '</span></td>';

      // Origin + usage count
      html += '<td><span class="mx-origin-badge ' + originCls + '">' + esc(origin) + '</span>';
      if (isDuplicate) {
        html += ' <span class="mx-dt-usage-warn" title="Used in ' + usage.count + ' cells">(' + usage.count + ' cells)</span>';
      }
      html += '</td>';

      // Description (editable)
      html += '<td><span class="mx-dt-task-name" contenteditable="true" style="min-width:80px;font-size:0.62rem" onblur="event.stopPropagation();saveAdField(\'' + escAttr(ad.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\',\'description\',this.textContent)" onclick="event.stopPropagation()" title="Click to edit">' + esc(ad.description || 'Add note...') + '</span></td>';

      // Due Date
      html += '<td><input type="date" class="mx-dt-date-inp" value="' + escAttr(ad.dueDate) + '" onchange="event.stopPropagation();saveAdField(\'' + escAttr(ad.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\',\'dueDate\',this.value)" onclick="event.stopPropagation()"></td>';

      // Status
      html += '<td>';
      html += '<select class="mx-dt-status-sel" onchange="event.stopPropagation();changeAdStatusFromMatrix(\'' + esc(ad.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\', this.value)" onclick="event.stopPropagation()">';
      STATUSES.forEach(function (s) {
        html += '<option value="' + esc(s) + '"' + (ad.status === s ? ' selected' : '') + '>' + esc(s) + '</option>';
      });
      html += '</select></td>';

      // Action Plan
      html += '<td>';
      if (actionInfo && actionInfo.inActionPlan) {
        if (actionInfo.clickupId) {
          // ClickUp production task was created — show a direct link to it
          html += '<a href="https://app.clickup.com/t/' + escAttr(actionInfo.clickupId) + '" ' +
            'target="_blank" class="mx-dt-action-cu-link" onclick="event.stopPropagation()" ' +
            'title="Open production task in ClickUp">&#10003; ClickUp Task &#8599;</a>';
        } else {
          html += '<span class="mx-dt-action-sent">&#10003; In Action Plan &mdash; ' + esc(actionInfo.status) + '</span>';
        }
      } else {
        html += '<button class="mx-dt-action-btn" onclick="event.stopPropagation();createActionFromMatrix(\'' + escAttr(ad.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\', this)">&rarr; Action Plan</button>';
      }
      html += '</td>';

      // Delete (cascade: removes AD + actions + production + ClickUp task)
      html += '<td><button class="btn-icon btn-del btn-sm" title="Delete everywhere" onclick="event.stopPropagation();deleteAdEverywhere(\'' + escAttr(ad.id) + '\')">&#128465;</button></td>';

      html += '</tr>';

      // Variation sub-panel
      if (isAdExpanded) {
        var vars = ADS.filter(function (a) { return a.parentAdId === ad.id; });
        html += '<tr onclick="event.stopPropagation()"><td colspan="11" style="padding:0;border:none">';
        html += renderVariationSubPanel(ad, vars, angleName, personaName);
        html += '</td></tr>';
      }
    });
  }

  html += '</tbody></table>';

  // Add Creative button
  html += '<div style="margin-top:10px">';
  html += '<button class="mx-cell-add-btn" onclick="event.stopPropagation();openAddFormatsPopup(\'' +
    escJs(angleName) + '\',\'' + escJs(personaName) + '\')">+ Add Creative</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ================================================
// saveCellMeta — persist cell description to MATRIX_CELL_META
// ================================================
function saveCellMeta(angleName, personaName, value) {
  var cellKey = angleName + '||' + personaName;
  if (!MATRIX_CELL_META[cellKey]) MATRIX_CELL_META[cellKey] = {};
  MATRIX_CELL_META[cellKey].description = value;
  saveState();
}

// ================================================
// saveAdField — persist inline edits to MATRIX_CELL_META (per-cell)
// ================================================
function saveAdField(adId, angleName, personaName, field, value) {
  var cellAdKey = adId + '||' + angleName + '||' + personaName;
  if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
  MATRIX_CELL_META[cellAdKey][field] = value;
  saveState();
  // Auto-push to ClickUp if this is a taxonomy field
  var cuFieldMap = { creativeStructure: 'creativeStructure', hookType: 'hookType', productionStyle: 'productionStyle', angle: 'angle', persona: 'persona' };
  if (cuFieldMap[field]) {
    var pushAd = null;
    for (var i = 0; i < ADS.length; i++) { if (ADS[i].id === adId) { pushAd = ADS[i]; break; } }
    if (pushAd) pushFieldToClickUp(pushAd, cuFieldMap[field], value);
  }
}

// ================================================
// renderVariationSubPanel — variation tracker inside detail table
// ================================================
function renderVariationSubPanel(parentAd, vars, angleName, personaName) {
  var target = 5;
  angleName = angleName || parentAd.angle || '';
  personaName = personaName || parentAd.persona || '';

  var html = '<div class="mx-var-subpanel open"><div class="mx-var-subpanel-inner">';

  // Progress
  html += '<div class="mx-var-progress">';
  html += '<span>Variations (' + vars.length + '/' + target + ')</span>';
  for (var i = 0; i < target; i++) {
    html += '<span class="vdot' + (i < vars.length ? ' filled' : '') + '"></span>';
  }
  html += '</div>';

  // Existing variations table
  if (vars.length > 0) {
    html += '<table class="mx-var-existing-table">';
    html += '<thead><tr><th>Var ID</th><th>Link</th><th>Changes</th><th>Status</th><th>Action Plan</th></tr></thead>';
    html += '<tbody>';
    vars.forEach(function (v) {
      var vc = classify(v.status);
      var varId = v.id || (parentAd.id + '-V' + (v.variationNumber || '?'));
      var varActionInfo = getActionForAd(v.id);
      html += '<tr>';
      html += '<td class="mono">' + esc(varId) + '</td>';
      html += '<td>';
      if (v.adLink) {
        html += '<a class="mx-dt-link" href="' + esc(v.adLink) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#128279;</a>';
      } else {
        html += '<span style="color:var(--t3);font-size:0.62rem">--</span>';
      }
      html += '</td>';
      html += '<td>';
      if (v.variationChanges && v.variationChanges.length > 0) {
        v.variationChanges.forEach(function (ch) {
          html += '<span class="bdg bdg-xs" style="margin-right:2px">' + esc(ch) + '</span>';
        });
      } else {
        html += '<span style="color:var(--t3);font-size:0.62rem">--</span>';
      }
      html += '</td>';
      html += '<td><span class="bdg ' + vc.cls + ' bdg-xs">' + vc.lbl + '</span></td>';
      html += '<td>';
      if (varActionInfo && varActionInfo.inActionPlan) {
        html += '<span style="font-size:0.62rem;color:var(--win);font-weight:600">&#10003; AP</span>';
      } else {
        html += '<button class="mx-dt-action-btn" style="font-size:0.6rem;padding:1px 6px" onclick="event.stopPropagation();createVariationAction(\'' + escAttr(v.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\')">&rarr; AP</button>';
      }
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }

  // Variation creator
  var nextVarNum = vars.length + 1;
  var autoName = parentAd.id + '-V' + nextVarNum;

  html += '<div class="mx-var-creator">';
  html += '<div class="mx-var-creator-title">Create New Variation</div>';
  html += '<div class="mx-var-auto-name">Name: <strong>' + esc(autoName) + '</strong> (auto)</div>';

  // Change checkboxes
  html += '<div style="font-size:0.64rem;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.04em">Changes:</div>';
  html += '<div class="mx-var-checks" id="var-checks-' + esc(parentAd.id) + '">';
  var varOptions = ['Hook', 'Title', 'Text', 'CTA', 'Music', 'Thumbnail', 'Full Remake'];
  varOptions.forEach(function (opt) {
    html += '<div class="mx-var-check" onclick="event.stopPropagation();this.classList.toggle(\'checked\')" data-opt="' + esc(opt) + '">' + esc(opt) + '</div>';
  });
  html += '</div>';

  // Form fields
  html += '<div class="mx-var-form-row">';
  html += '<div><label>Status</label><select class="f-inp" id="var-status-' + esc(parentAd.id) + '" onclick="event.stopPropagation()">';
  STATUSES.forEach(function (s) {
    html += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
  });
  html += '</select></div>';
  html += '<div><label>Assignee</label><input type="text" class="f-inp" id="var-assignee-' + esc(parentAd.id) + '" placeholder="Name..." onclick="event.stopPropagation()"></div>';
  html += '</div>';
  html += '<div class="mx-var-form-row">';
  html += '<div><label>Link</label><input type="url" class="f-inp" id="var-link-' + esc(parentAd.id) + '" placeholder="https://..." onclick="event.stopPropagation()"></div>';
  html += '<div><label>Notes</label><textarea class="f-inp" id="var-notes-' + esc(parentAd.id) + '" rows="1" placeholder="Notes..." onclick="event.stopPropagation()"></textarea></div>';
  html += '</div>';

  // Action buttons
  html += '<div class="mx-var-actions">';
  html += '<button class="btn-add btn-sm" onclick="event.stopPropagation();createVariationFromMatrix(\'' + esc(parentAd.id) + '\', 1)">Create Variation</button>';
  html += '<button class="btn-ghost btn-sm" onclick="event.stopPropagation();createVariationFromMatrix(\'' + esc(parentAd.id) + '\', 5)">Create 5 Batch</button>';
  html += '</div>';

  html += '</div>'; // close mx-var-creator
  html += '</div></div>'; // close mx-var-subpanel-inner + mx-var-subpanel
  return html;
}

// ================================================
// openAddFormatsPopup — modal with tabs: Creative Tracker + From Inspiration
// ================================================
var _fmtModalAngle = '';
var _fmtModalPersona = '';
var _fmtModalFunnelFilter = 'All';
var _fmtModalActiveTab = 'tracker'; // 'tracker' | 'inspo'
var _insPickerPlatform = '';
var _insPickerHook = '';
var _insPickerFunnel = '';
var _insPickerStatus = '';
var _insPickerSearch = '';

function openAddFormatsPopup(angleName, personaName) {
  _matrixFormatStatusFilter = 'All';
  _fmtModalAngle = angleName;
  _fmtModalPersona = personaName;
  _fmtModalFunnelFilter = 'All';
  _fmtModalActiveTab = 'tracker';
  _insPickerPlatform = '';
  _insPickerHook = '';
  _insPickerFunnel = '';
  _insPickerStatus = '';
  _insPickerSearch = '';

  var bodyHtml = '';

  // ── Tab bar ──
  bodyHtml += '<div class="fmt-modal-tabs">' +
    '<button class="fmt-modal-tab active" id="fmtTab_tracker" onclick="switchFormatModalTab(\'tracker\')">Creative Tracker</button>' +
    '<button class="fmt-modal-tab" id="fmtTab_inspo" onclick="switchFormatModalTab(\'inspo\')">From Inspiration</button>' +
  '</div>';

  // ═══════════════════════════════════════════
  // PANE 1 — Creative Tracker
  // ═══════════════════════════════════════════
  bodyHtml += '<div class="fmt-modal-pane active" id="fmtPane_tracker">';

  // Status filter pills
  bodyHtml += '<div class="mx-fmt-filter-bar" id="fmtFilterBar">';
  var filterStatuses = ['All', 'Untested', 'Approved', 'In Production', 'Ready to Launch', 'Testing', 'Winner', 'Loser', 'Scale', 'Complete'];
  for (var f = 0; f < filterStatuses.length; f++) {
    var isActive = filterStatuses[f] === 'All' ? ' active' : '';
    bodyHtml += '<button class="mx-fmt-filter-pill' + isActive + '" onclick="setFormatStatusFilter(\'' + escAttr(filterStatuses[f]) + '\')" data-status="' + escAttr(filterStatuses[f]) + '">' + esc(filterStatuses[f]) + '</button>';
  }
  bodyHtml += '</div>';

  // Funnel filter + Search row
  bodyHtml += '<div class="fmt-modal-funnel-bar">';
  var funnels = ['All', 'TOF', 'MOF', 'BOF'];
  for (var fi = 0; fi < funnels.length; fi++) {
    bodyHtml += '<button class="fmt-modal-funnel-btn' + (funnels[fi] === 'All' ? ' active' : '') +
      '" data-funnel="' + escAttr(funnels[fi]) + '" onclick="setFormatFunnelFilter(\'' + escAttr(funnels[fi]) + '\')">' + esc(funnels[fi]) + '</button>';
  }
  bodyHtml += '<input type="text" class="mx-fmt-modal-search" id="fmtModalSearch" placeholder="Search by format name..." oninput="filterFormatModal()" style="flex:1;margin-left:6px">';
  bodyHtml += '</div>';

  // Build tracker ads table
  var cellKey = angleName + '||' + personaName;
  // Build set of source format IDs already assigned to this cell via production ADs
  var cellSourceIds = {};
  ADS.forEach(function(a) {
    if (a.taskType === 'production' && a.angle === angleName && a.persona === personaName && a.sourceFormatId) {
      cellSourceIds[a.sourceFormatId] = true;
    }
  });
  // Also include legacy direct assignments that are not production ADs
  (CELL_CREATIVE_ASSIGNMENTS[cellKey] || []).forEach(function(assignedId) {
    for (var _li = 0; _li < ADS.length; _li++) {
      if (ADS[_li].id === assignedId && ADS[_li].taskType !== 'production') {
        cellSourceIds[assignedId] = true; break;
      }
    }
  });
  // Exclude production tasks from "Add Format" modal — only show source formats
  var parentAds = ADS.filter(function (a) { return !a.parentAdId && !a.trackerRefId && a.taskType !== 'production'; });
  parentAds.sort(function (a, b) {
    var aInCell = cellSourceIds[a.id] ? 0 : 1;
    var bInCell = cellSourceIds[b.id] ? 0 : 1;
    return aInCell - bInCell;
  });

  bodyHtml += '<table class="mx-fmt-modal-table" id="fmtModalTable">';
  bodyHtml += '<thead><tr><th style="width:30px">&#9744;</th><th>Format Name</th><th>Ad Type</th><th>Funnel</th><th>Status</th><th>Origin</th><th>Usage</th><th>In Cell</th></tr></thead>';
  bodyHtml += '<tbody>';

  for (var i = 0; i < parentAds.length; i++) {
    var ad = parentAds[i];
    var isInCell = !!cellSourceIds[ad.id];
    var c = classify(ad.status);
    var usage = getCreativeUsageSummary(ad.id);
    var origin = ad.adOrigin || 'New Find';

    var usageTipHtml = '';
    if (usage.count > 0) {
      var badgeLabel = usage.fromProduction
        ? (usage.count + ' prod task' + (usage.count > 1 ? 's' : ''))
        : (usage.count + ' cell' + (usage.count > 1 ? 's' : ''));
      usageTipHtml = '<span class="mx-fmt-usage-tooltip"><span class="mx-fmt-usage-badge">' + badgeLabel + '</span>';
      usageTipHtml += '<span class="mx-fmt-usage-list">';
      for (var u = 0; u < usage.locations.length; u++) {
        var loc = usage.locations[u];
        usageTipHtml += '<div class="mx-fmt-usage-list-item">' + esc(loc.angle) + ' &times; ' + esc(loc.persona) + '</div>';
      }
      usageTipHtml += '</span></span>';
    } else {
      usageTipHtml = '<span style="color:var(--t3);font-size:0.6rem">0</span>';
    }

    bodyHtml += '<tr class="fmt-modal-row" data-format="' + escAttr(ad.formatName) + '" data-status="' + escAttr(ad.status) + '" data-funnel="' + escAttr(ad.funnelStage || '') + '" data-adid="' + escAttr(ad.id) + '"' +
      (isInCell ? ' style="background:rgba(16,185,129,0.04)"' : '') + '>';
    bodyHtml += '<td><input type="checkbox"' + (isInCell ? ' checked' : '') +
      ' onchange="toggleFormatInCell(this, \'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\',\'' +
      escAttr(ad.id) + '\',\'' + escAttr(ad.formatName) + '\',\'' + escAttr(ad.adType) + '\')"></td>';
    bodyHtml += '<td>' + esc(ad.formatName) + '</td>';
    bodyHtml += '<td><span style="font-size:0.68rem;color:var(--t3)">' + esc(ad.adType) + '</span></td>';
    bodyHtml += '<td><span class="bdg ' + (ad.funnelStage || 'tof').toLowerCase() + ' bdg-xs">' + esc(ad.funnelStage || 'TOF') + '</span></td>';
    bodyHtml += '<td><span class="bdg ' + c.cls + ' bdg-xs">' + esc(c.lbl) + '</span></td>';
    bodyHtml += '<td><span style="font-size:0.62rem;color:var(--t2)">' + esc(origin) + '</span></td>';
    bodyHtml += '<td>' + usageTipHtml + '</td>';
    bodyHtml += '<td>' + (isInCell ? '<span class="mx-fmt-in-cell">In this cell</span>' : '') + '</td>';
    bodyHtml += '</tr>';
  }
  bodyHtml += '</tbody></table>';
  bodyHtml += '</div>'; // end fmtPane_tracker

  // ═══════════════════════════════════════════
  // PANE 2 — From Inspiration
  // ═══════════════════════════════════════════
  bodyHtml += '<div class="fmt-modal-pane" id="fmtPane_inspo">';

  // Collect filter options from classified inspos
  // Also include 'Saved' items that have classification data (e.g. imported from another product)
  var classifiedInspos = INSPIRATIONS.filter(function(ins) {
    var isClassifiedStatus = ins.status === 'Classified' || ins.status === 'Testing' || ins.status === 'Winner' || ins.status === 'Scale' || ins.status === 'Loser';
    var hasClassificationData = !!(ins.creativeUSP || ins.hookType || ins.classifiedAt);
    return isClassifiedStatus || hasClassificationData;
  });
  var platforms = [], hooks = [], statuses = [];
  classifiedInspos.forEach(function(ins) {
    if (ins.platform && platforms.indexOf(ins.platform) === -1) platforms.push(ins.platform);
    if (ins.hookType && hooks.indexOf(ins.hookType) === -1) hooks.push(ins.hookType);
    if (ins.status && statuses.indexOf(ins.status) === -1) statuses.push(ins.status);
  });

  // Track which inspos already used in this cell
  var cellInspoIds = {};
  ADS.forEach(function(a) {
    if (a._fromInspoId && a.angle === angleName && a.persona === personaName) {
      cellInspoIds[a._fromInspoId] = true;
    }
  });

  // Filter bar
  bodyHtml += '<div class="ins-picker-filters">';
  bodyHtml += '<select class="ins-picker-select" id="insPickPlatform" onchange="filterInspoModal()">' +
    '<option value="">All Platforms</option>' +
    platforms.map(function(p){ return '<option value="'+escAttr(p)+'">'+esc(p)+'</option>'; }).join('') +
  '</select>';
  bodyHtml += '<select class="ins-picker-select" id="insPickHook" onchange="filterInspoModal()">' +
    '<option value="">All Hook Types</option>' +
    hooks.map(function(h){ return '<option value="'+escAttr(h)+'">'+esc(h)+'</option>'; }).join('') +
  '</select>';
  bodyHtml += '<select class="ins-picker-select" id="insPickFunnel" onchange="filterInspoModal()">' +
    '<option value="">All Funnels</option>' +
    '<option value="TOF">TOF</option><option value="MOF">MOF</option><option value="BOF">BOF</option>' +
  '</select>';
  bodyHtml += '<select class="ins-picker-select" id="insPickStatus" onchange="filterInspoModal()">' +
    '<option value="">All Statuses</option>' +
    statuses.map(function(s){ return '<option value="'+escAttr(s)+'">'+esc(s)+'</option>'; }).join('') +
  '</select>';
  bodyHtml += '<input type="text" class="ins-picker-search" id="insPickSearch" placeholder="Search inspos..." oninput="filterInspoModal()">';
  bodyHtml += '</div>';

  if (classifiedInspos.length === 0) {
    bodyHtml += '<div style="padding:32px 0;text-align:center;color:var(--t3);font-size:0.78rem">No classified inspirations yet. Add URLs in the Inspiration tab and run /classify-inspiration, or import from another product using 🔀 Other Products.</div>';
  } else {
    bodyHtml += '<table class="ins-picker-table" id="insPickTable">';
    bodyHtml += '<thead><tr><th style="width:30px">&#9744;</th><th>ID</th><th>Brand</th><th>Format / USP</th><th>Hook</th><th>Structure</th><th>Funnel</th><th>Platform</th><th>Duration</th><th>Status</th></tr></thead>';
    bodyHtml += '<tbody id="insPickTbody">';
    for (var ii = 0; ii < classifiedInspos.length; ii++) {
      var ins = classifiedInspos[ii];
      var alreadyAdded = !!cellInspoIds[ins.id];
      var sc = classify(ins.status);
      var fmtName = ins.creativeUSP ? (ins.creativeUSP.length > 40 ? ins.creativeUSP.substring(0,40)+'…' : ins.creativeUSP) : (ins.formatName || '—');
      bodyHtml += '<tr class="ins-picker-row" id="insPickRow_'+escAttr(ins.id)+'"' +
        ' data-platform="'+escAttr(ins.platform||'')+'"' +
        ' data-hook="'+escAttr(ins.hookType||'')+'"' +
        ' data-funnel="'+escAttr(ins.funnelStage||'')+'"' +
        ' data-status="'+escAttr(ins.status||'')+'"' +
        ' data-search="'+escAttr((ins.brand||'')+' '+(ins.hookType||'')+' '+(ins.creativeUSP||'')+' '+(ins.angle||'')).toLowerCase()+'">';
      bodyHtml += '<td><input type="checkbox"' + (alreadyAdded ? ' checked' : '') +
        ' id="insAddChk_'+escAttr(ins.id)+'"' +
        ' onchange="toggleInspoInCell(this,\''+escAttr(ins.id)+'\',\''+escJs(angleName)+'\',\''+escJs(personaName)+'\')"' +
        (alreadyAdded ? ' style="accent-color:var(--win)"' : '') + '></td>';
      bodyHtml += '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.62rem;color:var(--t3);white-space:nowrap">'+esc(ins.id)+'</td>';
      bodyHtml += '<td style="font-weight:600;font-size:0.73rem;white-space:nowrap">'+esc(ins.brand||'—')+'</td>';
      bodyHtml += '<td style="font-size:0.7rem;color:var(--t2);max-width:200px">'+esc(fmtName)+'</td>';
      bodyHtml += '<td><span style="font-size:0.65rem;color:var(--t2)">'+esc(ins.hookType||'—')+'</span></td>';
      bodyHtml += '<td><span style="font-size:0.65rem;color:var(--t2)">'+esc(ins.creativeStructure||'—')+'</span></td>';
      bodyHtml += '<td><span class="bdg '+(ins.funnelStage||'tof').toLowerCase()+' bdg-xs">'+esc(ins.funnelStage||'TOF')+'</span></td>';
      bodyHtml += '<td><span style="font-size:0.65rem;color:var(--t2)">'+esc(ins.platform||'—')+'</span></td>';
      bodyHtml += '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.65rem;color:var(--t3)">'+(ins.duration_seconds ? ins.duration_seconds+'s' : '—')+'</td>';
      bodyHtml += '<td><span class="ins-status-badge '+(ins.status||'').toLowerCase()+'">'+esc(ins.status||'—')+'</span></td>';
      bodyHtml += '</tr>';
    }
    bodyHtml += '</tbody></table>';
  }
  bodyHtml += '</div>'; // end fmtPane_inspo

  var footHtml = '<button class="btn-ghost btn-sm" onclick="closeModal()">Done</button>';
  openModal(esc(angleName) + ' &times; ' + esc(personaName) + ' &mdash; Add Creatives', bodyHtml, footHtml);
}

// ================================================
// switchFormatModalTab — toggle between Creative Tracker / From Inspiration
// ================================================
function switchFormatModalTab(tab) {
  _fmtModalActiveTab = tab;
  var tabs = ['tracker', 'inspo'];
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var tabBtn = document.getElementById('fmtTab_' + t);
    var pane = document.getElementById('fmtPane_' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
    if (pane) pane.classList.toggle('active', t === tab);
  }
}

// ================================================
// setFormatStatusFilter — status pill filter in format modal
// ================================================
function setFormatStatusFilter(status) {
  _matrixFormatStatusFilter = status;
  var pills = document.querySelectorAll('.mx-fmt-filter-pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].classList.toggle('active', pills[i].dataset.status === status);
  }
  filterFormatModal();
}

// ================================================
// setFormatFunnelFilter — funnel filter in Creative Tracker tab
// ================================================
function setFormatFunnelFilter(funnel) {
  _fmtModalFunnelFilter = funnel;
  var btns = document.querySelectorAll('.fmt-modal-funnel-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.funnel === funnel);
  }
  filterFormatModal();
}

// ================================================
// filterFormatModal — combined text + status + funnel filter
// ================================================
function filterFormatModal() {
  var query = ((document.getElementById('fmtModalSearch') || {}).value || '').toLowerCase();
  var statusFilter = _matrixFormatStatusFilter || 'All';
  var funnelFilter = _fmtModalFunnelFilter || 'All';
  var rows = document.querySelectorAll('.fmt-modal-row');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = (row.dataset.format || '').toLowerCase();
    var rowStatus = row.dataset.status || '';
    var rowFunnel = row.dataset.funnel || '';
    var matchText = name.indexOf(query) !== -1;
    var matchStatus = statusFilter === 'All' || rowStatus === statusFilter;
    var matchFunnel = funnelFilter === 'All' || rowFunnel === funnelFilter;
    row.style.display = (matchText && matchStatus && matchFunnel) ? '' : 'none';
  }
}

// ================================================
// filterInspoModal — filter inspo picker table
// ================================================
function filterInspoModal() {
  var platform = ((document.getElementById('insPickPlatform') || {}).value || '').toLowerCase();
  var hook = ((document.getElementById('insPickHook') || {}).value || '').toLowerCase();
  var funnel = ((document.getElementById('insPickFunnel') || {}).value || '').toLowerCase();
  var status = ((document.getElementById('insPickStatus') || {}).value || '').toLowerCase();
  var search = ((document.getElementById('insPickSearch') || {}).value || '').toLowerCase();
  var rows = document.querySelectorAll('.ins-picker-row');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rPlatform = (row.dataset.platform || '').toLowerCase();
    var rHook = (row.dataset.hook || '').toLowerCase();
    var rFunnel = (row.dataset.funnel || '').toLowerCase();
    var rStatus = (row.dataset.status || '').toLowerCase();
    var rSearch = (row.dataset.search || '').toLowerCase();
    var show = (!platform || rPlatform === platform) &&
               (!hook || rHook === hook) &&
               (!funnel || rFunnel === funnel) &&
               (!status || rStatus === status) &&
               (!search || rSearch.indexOf(search) !== -1);
    row.style.display = show ? '' : 'none';
  }
}

// ================================================
// toggleInspoInCell — checkbox handler: add or remove inspo task from cell
// ================================================
function toggleInspoInCell(checkbox, insId, angleName, personaName) {
  if (checkbox.checked) {
    addInspoToCell(insId, angleName, personaName);
    checkbox.style.accentColor = 'var(--win)';
  } else {
    removeInspoFromCell(insId, angleName, personaName);
    checkbox.style.accentColor = '';
  }
}

// ================================================
// addInspoToCell — create new AD from inspo + assign to cell
// ================================================
function addInspoToCell(insId, angleName, personaName) {
  var ins = INSPIRATIONS.find(function(i) { return i.id === insId; });
  if (!ins) { toast('Inspiration not found', 'error'); return; }

  // Check if already added in this cell
  var alreadyExists = ADS.some(function(a) {
    return a._fromInspoId === insId && a.angle === angleName && a.persona === personaName;
  });
  if (alreadyExists) {
    toast('Already in this cell', 'warn');
    return;
  }

  // Generate unique task name: AR-044-INS-007
  var formatName = generateTaskName('inspo', ins.id);

  var newAd = {
    id: nextSerialId(),
    formatName: formatName,
    adLink: ins.sourceUrl || '',
    driveLink: '',
    adType: ins.adType || 'Video',
    funnelStage: ins.funnelStage || 'TOF',
    status: 'Untested',
    angle: angleName,
    persona: personaName,
    hookType: ins.hookType || '',
    creativeStructure: ins.creativeStructure || '',
    productionStyle: ins.productionStyle || '',
    creativeUSP: ins.creativeUSP || '',
    creativeHypothesis: ins.creativeHypothesis || '',
    parentAdId: null,
    variationNumber: null,
    adOrigin: 'From Inspo',
    _fromInspoId: insId,
    _clickupId: null,
    _clickupStatus: null
  };

  ADS.push(newAd);

  // Auto-set inspo status to Testing if not already advanced
  var noAdvance = ['Saved', 'Pending', 'Classified', 'Queued'];
  if (noAdvance.indexOf(ins.status) !== -1) {
    ins.status = 'Testing';
    saveInspirations();
  }

  // Rebuild indexes and render
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  populateFilterOptions();
  renderAll();
  saveState();

  toast(newAd.id + ' added to ' + angleName + ' \u00D7 ' + personaName + ' from ' + insId, 'ok');
}

// ================================================
// removeInspoFromCell — uncheck: delete the task created from this inspo in this cell
// ================================================
function removeInspoFromCell(insId, angleName, personaName) {
  var idx = -1;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i]._fromInspoId === insId && ADS[i].angle === angleName && ADS[i].persona === personaName) {
      idx = i; break;
    }
  }
  if (idx === -1) { toast('Task not found', 'warn'); return; }

  var removedId = ADS[idx].id;
  ADS.splice(idx, 1);

  // Rebuild and render
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  populateFilterOptions();
  renderAll();
  saveState();

  toast(removedId + ' removed from ' + angleName + ' \u00D7 ' + personaName, 'ok');
}

// ================================================
// showInspoCellsPopup — popup listing all tasks from a given inspo
// ================================================
function showInspoCellsPopup(insId) {
  var ins = INSPIRATIONS.find(function(i) { return i.id === insId; });
  var insLabel = insId + (ins ? ' — ' + esc(ins.brand || ins.formatName || '') : '');

  var linked = ADS.filter(function(a) { return a._fromInspoId === insId; });

  var bodyHtml = '';
  if (linked.length === 0) {
    bodyHtml = '<div style="color:var(--t3);text-align:center;padding:24px 0">No tasks created from this inspiration yet.</div>';
  } else {
    bodyHtml = '<div class="ins-cells-popup-grid">';
    for (var i = 0; i < linked.length; i++) {
      var ad = linked[i];
      var c = classify(ad.status);
      var funnelCls = (ad.funnelStage || 'tof').toLowerCase();
      bodyHtml += '<div class="ins-cells-popup-row stagger" style="--i:' + i + '">';
      bodyHtml += '<div class="ins-cells-popup-id">' + esc(ad.id) + '</div>';
      bodyHtml += '<div class="ins-cells-popup-cell">' + esc(ad.angle) + ' &times; ' + esc(ad.persona) + '</div>';
      bodyHtml += '<span class="bdg ' + funnelCls + ' bdg-xs">' + esc(ad.funnelStage || 'TOF') + '</span>';
      bodyHtml += '<span class="bdg ' + c.cls + ' bdg-xs" style="margin-left:4px">' + esc(ad.status) + '</span>';
      if (ad._clickupId) {
        bodyHtml += '<a href="https://app.clickup.com/t/' + escAttr(ad._clickupId) + '" target="_blank" style="font-size:0.65rem;color:var(--inprog);margin-left:auto;text-decoration:none">CU &#8599;</a>';
      }
      bodyHtml += '</div>';
    }
    bodyHtml += '</div>';
  }

  openModal(insLabel, bodyHtml, '<button class="btn-ghost btn-sm" onclick="closeModal()">Close</button>');
}

// ================================================
// toggleFormatInCell — check/uncheck creative in modal (v2)
// ================================================
function toggleFormatInCell(checkbox, angleName, personaName, adId, formatName, adType) {
  if (checkbox.checked) {
    addFormatToCell(angleName, personaName, adId, formatName, adType);
  } else {
    // Find the production AD that was created for this source in this cell
    var cellKey = angleName + '||' + personaName;
    var prodAdId = null;
    for (var ri = 0; ri < ADS.length; ri++) {
      if (ADS[ri].sourceFormatId === adId && ADS[ri].taskType === 'production' &&
          ADS[ri].angle === angleName && ADS[ri].persona === personaName) {
        prodAdId = ADS[ri].id;
        break;
      }
    }
    if (prodAdId) {
      // Remove production AD from cell assignments
      var assignments = CELL_CREATIVE_ASSIGNMENTS[cellKey] || [];
      var idx = assignments.indexOf(prodAdId);
      if (idx !== -1) {
        assignments.splice(idx, 1);
        if (assignments.length === 0) delete CELL_CREATIVE_ASSIGNMENTS[cellKey];
      }
      // Remove production AD from ADS array
      for (var ri = ADS.length - 1; ri >= 0; ri--) {
        if (ADS[ri].id === prodAdId) { ADS.splice(ri, 1); break; }
      }
      // Clean up metadata and manual actions for this production AD
      var cellAdKey = prodAdId + '||' + angleName + '||' + personaName;
      delete MATRIX_CELL_META[cellAdKey];
      MANUAL_ACTIONS.forEach(function(a){
        if (a.sourceAdId === prodAdId || a.adId === prodAdId) {
          _rememberManualActionDeletion(a.id, a._dbId);
        }
      });
      MANUAL_ACTIONS = MANUAL_ACTIONS.filter(function(a) {
        return a.sourceAdId !== prodAdId && a.adId !== prodAdId;
      });
    } else {
      // Legacy fallback: format was added with old direct-assignment approach
      if (CELL_CREATIVE_ASSIGNMENTS[cellKey]) {
        var idx = CELL_CREATIVE_ASSIGNMENTS[cellKey].indexOf(adId);
        if (idx !== -1) {
          CELL_CREATIVE_ASSIGNMENTS[cellKey].splice(idx, 1);
          if (CELL_CREATIVE_ASSIGNMENTS[cellKey].length === 0) delete CELL_CREATIVE_ASSIGNMENTS[cellKey];
        }
      }
      var cellAdKey = adId + '||' + angleName + '||' + personaName;
      delete MATRIX_CELL_META[cellAdKey];
    }

    buildCreativeUsageIndex();
    renderMatrix();
    renderCreatives();
    saveState();
    toast(adId + ' removed from ' + angleName + ' \u00D7 ' + personaName, 'ok');
  }
}

// ================================================
// addFormatToCell — assign tracker creative to a matrix cell as a new production task
// Each cell assignment creates its own production AD with a unique ID and _clickupId,
// so the same format can be added to multiple cells and each gets a separate ClickUp task.
// ================================================
function addFormatToCell(angle, persona, sourceAdId, formatName, adType) {
  var cellKey = angle + '||' + persona;
  if (!CELL_CREATIVE_ASSIGNMENTS[cellKey]) CELL_CREATIVE_ASSIGNMENTS[cellKey] = [];

  // Find source AD
  var sourceAd = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === sourceAdId) { sourceAd = ADS[i]; break; }
  }

  // Already have a production AD for this source in this cell? (prevent duplicates)
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].sourceFormatId === sourceAdId && ADS[i].taskType === 'production' &&
        ADS[i].angle === angle && ADS[i].persona === persona) {
      toast('Already in this cell', 'warn');
      return;
    }
  }

  // Create a new production AD specific to this angle × persona cell.
  // This gives each cell its own _clickupId so separate ClickUp tasks can be created.
  var safeAngle   = angle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
  var safePersona = persona.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
  var prodAdId = sourceAdId + '-PROD-' + safeAngle + safePersona + Date.now().toString().slice(-3);
  var prodAd = {
    id:                 prodAdId,
    formatName:         (sourceAd && sourceAd.formatName) || formatName,
    // If source has a real ad link, carry it over. Otherwise fall back to its drive
    // link so the new task isn't "No link" in the tracker (restores pre-migration behavior).
    adLink:             (sourceAd && (sourceAd.adLink || sourceAd.driveLink)) || '',
    driveLink:          '',   // production clone starts with empty Drive Link — source format's
                              // driveLink is reference/inspiration material, shown in ClickUp
                              // description as "Inspiration Drive" (not the production output)
    _sourceFormatDriveLink: (sourceAd && sourceAd.driveLink) || '', // stash for ClickUp desc
    adType:             adType || (sourceAd && sourceAd.adType) || '',
    funnelStage:        (sourceAd && sourceAd.funnelStage) || 'TOF',
    status:             'Not Started',
    angle:              angle,
    persona:            persona,
    taskType:           'production',
    adOrigin:           'Production',
    sourceFormatId:     sourceAdId,
    parentAdId:         null,
    variationNumber:    null,
    _clickupId:         null,
    _clickupStatus:     null,
    dateCreated:        Date.now(),
    hookType:           (sourceAd && sourceAd.hookType)           || '',
    creativeStructure:  (sourceAd && sourceAd.creativeStructure)  || '',
    productionStyle:    (sourceAd && sourceAd.productionStyle)    || '',
    creativeHypothesis: (sourceAd && sourceAd.creativeHypothesis) || ''
  };
  ADS.push(prodAd);
  CELL_CREATIVE_ASSIGNMENTS[cellKey].push(prodAdId);

  // Initialize per-cell metadata for the new production AD
  var cellAdKey = prodAdId + '||' + angle + '||' + persona;
  if (!MATRIX_CELL_META[cellAdKey]) {
    MATRIX_CELL_META[cellAdKey] = {
      status:     'Not Started',
      uniqueName: generateTaskName('tracker', null, prodAd.formatName),
      description: '',
      dueDate:    ''
    };
  }

  // Ensure persona is registered under this angle in the matrix
  if (!ANGLE_PERSONAS[angle]) ANGLE_PERSONAS[angle] = [];
  if (ANGLE_PERSONAS[angle].indexOf(persona) === -1) {
    ANGLE_PERSONAS[angle].push(persona);
  }

  buildCreativeUsageIndex();
  renderMatrix();
  renderCreatives();
  saveState();

  toast(prodAdId + ' created for ' + angle + ' \u00D7 ' + persona, 'ok');
}

// ================================================
// createVariationFromMatrix — batch variations with AD-001-V1 naming
// ================================================
function createVariationFromMatrix(parentId, count) {
  var parent = ADS.find(function (a) { return a.id === parentId; });
  if (!parent) return;

  // Gather checked variation options
  var checksEl = document.getElementById('var-checks-' + parentId);
  var checkedOpts = [];
  if (checksEl) {
    checksEl.querySelectorAll('.mx-var-check.checked').forEach(function (c) {
      checkedOpts.push(c.dataset.opt);
    });
  }

  // Gather form fields
  var statusEl = document.getElementById('var-status-' + parentId);
  var assigneeEl = document.getElementById('var-assignee-' + parentId);
  var linkEl = document.getElementById('var-link-' + parentId);
  var notesEl = document.getElementById('var-notes-' + parentId);

  var varStatus = statusEl ? statusEl.value : 'Untested';
  var varAssignee = assigneeEl ? assigneeEl.value.trim() : '';
  var varLink = linkEl ? linkEl.value.trim() : '';
  var varNotes = notesEl ? notesEl.value.trim() : '';
  var varLabel = checkedOpts.length > 0 ? checkedOpts.join(', ') : 'Variation';

  // Count existing child variations
  var existingVars = ADS.filter(function (a) { return a.parentAdId === parentId; });
  var startNum = existingVars.length + 1;

  for (var i = 0; i < count; i++) {
    var varNum = startNum + i;
    // Use variation ID pattern: AD-001-V1
    var varId = parentId + '-V' + varNum;

    // Check if this ID already exists (shouldn't but be safe)
    while (ADS.find(function (a) { return a.id === varId; })) {
      varNum++;
      varId = parentId + '-V' + varNum;
    }

    var newAd = {
      id: varId,
      formatName: parent.formatName,
      adLink: i === 0 ? varLink : '',
      driveLink: '',
      adType: parent.adType,
      funnelStage: parent.funnelStage,
      status: varStatus,
      angle: parent.angle,
      persona: parent.persona,
      parentAdId: parentId,
      variationNumber: varNum,
      adOrigin: 'New Find',
      variationChanges: checkedOpts.slice(),
      variationAssignee: i === 0 ? varAssignee : '',
      variationNotes: i === 0 ? varNotes : '',
      _clickupId: null,
      _clickupStatus: null
    };
    ADS.push(newAd);

    PROD.push({
      id: 'prod-' + Date.now() + '-' + i,
      name: 'Var ' + varNum + ': ' + varLabel + ' - ' + parent.formatName,
      status: 'to do',
      angle: parent.angle,
      persona: parent.persona,
      format: parent.formatName,
      dueDate: todayISO()
    });
  }

  P = process(ADS);
  if (typeof deriveWinners === 'function') deriveWinners();
  if (typeof genActions === 'function') genActions();
  renderAll();
  // Persist — missing save was causing freshly-created variations to be lost
  // on refresh if no other save fired before the user navigated away.
  saveState();

  toast(count + ' variation' + (count > 1 ? 's' : '') + ' created for ' + parentId, 'ok');
}

// ================================================
// openCellAI — Iron Man-style AI recommendations modal for a cell
// ================================================
function openCellAI(angleName, personaName) {
  // Filter ACTIONS to only auto-generated recs for this cell
  var cellRecs = [];
  for (var i = 0; i < ACTIONS.length; i++) {
    var a = ACTIONS[i];
    if (a.angle === angleName && a.persona === personaName &&
        a.tag !== 'manual' && a.tag !== 'variation' && a.tag !== 'ai-recommended') {
      cellRecs.push(a);
    }
  }

  // Remove any existing AI overlay
  var existing = document.getElementById('aiModalOverlay');
  if (existing) existing.parentNode.removeChild(existing);

  var overlay = document.createElement('div');
  overlay.id = 'aiModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;background:rgba(5,8,20,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fadeUp .2s ease both';

  var inner = document.createElement('div');
  inner.className = 'ai-modal-panel';
  inner.style.cssText = 'padding:0;animation:fadeUp .3s cubic-bezier(0.16,1,0.3,1) both';

  // Header
  var headerHtml = '<div style="padding:16px 20px;border-bottom:1px solid rgba(0,212,255,0.15);display:flex;align-items:center;justify-content:space-between">';
  headerHtml += '<div>';
  headerHtml += '<div class="ai-modal-title">AI Recommendations</div>';
  headerHtml += '<div style="color:rgba(180,210,240,0.6);font-size:0.7rem;margin-top:3px">' + esc(angleName) + ' &times; ' + esc(personaName) + '</div>';
  headerHtml += '</div>';
  headerHtml += '<button onclick="document.getElementById(\'aiModalOverlay\').remove()" style="background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.2);color:#00d4ff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.72rem;font-family:\'Satoshi\',sans-serif">&times; Close</button>';
  headerHtml += '</div>';

  // Body
  var bodyHtml = '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px">';
  if (cellRecs.length === 0) {
    bodyHtml += '<div style="color:rgba(180,210,240,0.5);font-size:0.78rem;text-align:center;padding:24px 0">No recommendations for this cell.</div>';
  } else {
    for (var i = 0; i < cellRecs.length; i++) {
      var rec = cellRecs[i];
      var pipColor = rec.priority === 'urgent' ? '#ef4444' : rec.priority === 'high' ? '#f59e0b' : rec.priority === 'medium' ? '#3b82f6' : '#94a3b8';
      bodyHtml += '<div class="ai-rec-card" style="--i:' + i + '">';
      bodyHtml += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">';
      bodyHtml += '<div style="display:flex;gap:8px;align-items:flex-start;flex:1">';
      bodyHtml += '<span style="width:7px;height:7px;border-radius:50%;background:' + pipColor + ';flex-shrink:0;margin-top:5px;display:inline-block"></span>';
      bodyHtml += '<div>';
      bodyHtml += '<div class="ai-rec-title">' + esc(rec.title) + '</div>';
      bodyHtml += '<div class="ai-rec-reason">' + esc(rec.reason) + '</div>';
      if (rec.funnelStage || rec.format) {
        bodyHtml += '<div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">';
        if (rec.funnelStage) bodyHtml += '<span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:rgba(0,212,255,0.08);color:#00d4ff;border:1px solid rgba(0,212,255,0.15)">' + esc(rec.funnelStage) + '</span>';
        if (rec.format) bodyHtml += '<span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:rgba(0,212,255,0.05);color:rgba(180,210,240,0.6)">' + esc(rec.format) + '</span>';
        bodyHtml += '</div>';
      }
      bodyHtml += '</div></div>';
      bodyHtml += '<button class="ai-rec-add-btn" onclick="addCellRecToPlan(\'' + escAttr(rec.id) + '\',\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\')">Add to Plan</button>';
      bodyHtml += '</div></div>';
    }
  }
  bodyHtml += '</div>';

  inner.innerHTML = headerHtml + bodyHtml;
  overlay.appendChild(inner);

  // Close on backdrop click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

function addCellRecToPlan(recId, angleName, personaName) {
  var rec = null;
  for (var i = 0; i < ACTIONS.length; i++) {
    if (ACTIONS[i].id === recId) { rec = ACTIONS[i]; break; }
  }
  if (!rec) return;

  // Check if cell exists
  var cellKey = angleName + '||' + personaName;
  if (!CELL_CREATIVE_ASSIGNMENTS[cellKey]) {
    var confirmed = confirm('This will create the cell [' + angleName + ' \u00D7 ' + personaName + '] in the Creative Matrix. Continue?');
    if (!confirmed) return;
    CELL_CREATIVE_ASSIGNMENTS[cellKey] = [];
    if (!ANGLE_PERSONAS[angleName]) ANGLE_PERSONAS[angleName] = [];
    if (ANGLE_PERSONAS[angleName].indexOf(personaName) === -1) {
      ANGLE_PERSONAS[angleName].push(personaName);
    }
  }

  var newAction = {
    id: 'manual-' + Date.now(),
    priority: rec.priority,
    title: rec.title,
    reason: rec.reason,
    tag: 'ai-recommended',
    angle: angleName,
    persona: personaName,
    format: rec.format || '',
    funnelStage: rec.funnelStage || 'TOF',
    dueDate: rec.dueDate || todayISO(),
    description: '',
    adId: null,
    adLink: '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: null,
    sourceAngle: angleName,
    sourcePersona: personaName
  };
  MANUAL_ACTIONS.push(newAction);
  genActions();
  rebuildProdFromManual();
  renderActionPlan();
  renderProduction();
  saveState();

  // Update button in AI modal to show added
  var btns = document.querySelectorAll('#aiModalOverlay .ai-rec-add-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('onclick') && btns[i].getAttribute('onclick').indexOf(recId) !== -1) {
      btns[i].textContent = '✓ Added';
      btns[i].disabled = true;
      btns[i].style.opacity = '0.5';
    }
  }
  toast('Added to Action Plan', 'ok');
}


// ====================================================================
// [split.py] next slice from source file begins below
// ====================================================================

// ================================================
// renderMatrixSummary — bottom summary bar
// ================================================
function renderMatrixSummary() {
  var total = ADS.filter(function (a) { return !a.parentAdId; }).length;
  var winners = ADS.filter(function (a) { return (a.status === 'Winner' || a.status === 'Scale') && !a.parentAdId; }).length;
  var testing = ADS.filter(function (a) { return a.status === 'Testing' && !a.parentAdId; }).length;
  var notStarted = ADS.filter(function (a) { return a.status === 'Untested' && !a.parentAdId; }).length;
  var variations = ADS.filter(function (a) { return !!a.parentAdId; }).length;

  var totalCells = 0;
  var filledSet = {};
  ANGLES.forEach(function (a) {
    var assigned = ANGLE_PERSONAS[a.name] || [];
    totalCells += assigned.length;
  });
  ADS.forEach(function (a) {
    if (!a.parentAdId) filledSet[a.angle + '||' + a.persona] = true;
  });
  var filledCells = Object.keys(filledSet).length;

  var html = '<div class="mx-summary-row" style="margin-top:12px">';
  html += '<div class="mx-summary-stat"><span class="mono" style="color:var(--t1)">' + total + '</span> Creatives</div>';
  html += '<div class="mx-summary-stat"><span class="mono" style="color:var(--win)">' + winners + '</span> Winners</div>';
  html += '<div class="mx-summary-stat"><span class="mono" style="color:var(--test)">' + testing + '</span> Testing</div>';
  html += '<div class="mx-summary-stat"><span class="mono" style="color:var(--notstart)">' + notStarted + '</span> Untested</div>';
  html += '<div class="mx-summary-stat"><span class="mono" style="color:var(--inprog)">' + variations + '</span> Variations</div>';
  html += '<div class="mx-summary-stat"><span class="mono">' + filledCells + '/' + totalCells + '</span> Cells Filled</div>';
  html += '</div>';
  return html;
}

