// ── 4b. ANGLES ──

function renderAngles() {
  // Build per-angle stats from ADS and PERSONAS
  function getAngleStats(angleName) {
    var ads = ADS.filter(function(a) { return a.angle === angleName && !a.parentAdId; });
    var personaSet = {};
    var winners = 0;
    for (var i = 0; i < ads.length; i++) {
      if (ads[i].persona) personaSet[ads[i].persona] = true;
      if (ads[i].status === 'Winner') winners++;
    }
    var personaCount = Object.keys(personaSet).length;
    var total = ads.length;
    var winRate = total > 0 ? Math.round((winners / total) * 100) : 0;
    return { personas: personaCount, creatives: total, winners: winners, winRate: winRate };
  }

  // Summary strip — derive statuses fresh for accurate counts
  var summaryEl = document.getElementById('anglesSummary');
  var winCount = 0, testCount = 0, notStartCount = 0, totalAds = 0;
  for (var i = 0; i < ANGLES.length; i++) {
    var st = deriveAngleStatus(ANGLES[i].name);
    if (st === 'Winner' || st === 'Scale') winCount++;
    else if (st === 'Testing') testCount++;
    else if (st === 'Untested') notStartCount++;
    totalAds += getAngleStats(ANGLES[i].name).creatives;
  }
  summaryEl.innerHTML = '<div class="tracker-summary">' +
    '<span class="tracker-summary-stat">Total Angles: <strong>' + ANGLES.length + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat" style="color:var(--win)">Winners: <strong>' + winCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat" style="color:var(--test)">Testing: <strong>' + testCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat">Untested: <strong>' + notStartCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat">Total Creatives: <strong>' + totalAds + '</strong></span>' +
  '</div>';

  var bodyEl = document.getElementById('anglesBody');
  bodyEl.style.display = 'none'; // hide old table body

  // Use a sibling div instead of table body
  var gridId = 'anglesGrid';
  var gridEl = document.getElementById(gridId);
  if (!gridEl) {
    gridEl = document.createElement('div');
    gridEl.id = gridId;
    gridEl.className = 'tracker-grid';
    bodyEl.closest('table').insertAdjacentElement('afterend', gridEl);
    bodyEl.closest('table').style.display = 'none';
  }

  if (ANGLES.length === 0) {
    gridEl.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128203;</div><div class="empty-text">No angles yet</div><div class="empty-hint">Click "+ Add Angle" to get started</div></div>';
    return;
  }

  // Header
  var html = '<div class="tracker-header">' +
    '<span>#</span><span>Angle Name</span><span>Status</span><span>Source Link</span><span>Stats</span><span>Notes</span><span>Actions</span>' +
  '</div>';

  for (var i = 0; i < ANGLES.length; i++) {
    var ang = ANGLES[i];
    // Auto-derive status from ads — sync back to stored value
    var derivedAngStatus = deriveAngleStatus(ang.name);
    ang.status = derivedAngStatus;
    var c = classify(derivedAngStatus);
    var stats = getAngleStats(ang.name);
    var winRateCls = stats.winRate >= 30 ? 'win-rate-good' : (stats.winRate > 0 ? 'win-rate-ok' : '');
    var winnerBadge = derivedAngStatus === 'Winner' || derivedAngStatus === 'Scale' ? '<span class="tr-win-badge">&#11088; Winner</span>' : '';
    var rowCls = 'tracker-row status-' + c.cls;

    // Source link cell
    var srcUrlDisplay = '';
    if (ang.sourceLink) {
      srcUrlDisplay = ang.sourceLink.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30);
      if (srcUrlDisplay.length < ang.sourceLink.replace(/^https?:\/\/(www\.)?/, '').length) srcUrlDisplay += '…';
    }
    var srcCell = ang.sourceLink
      ? '<a class="tr-src-link" href="' + escAttr(ang.sourceLink) + '" target="_blank" rel="noopener">' +
          '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          esc(srcUrlDisplay) + '</a>'
      : '<span class="tr-src-empty" onclick="openEditAngle(' + i + ')" title="Click to add source link">+ Add link</span>';

    // Persona name pills (clickable)
    var personaNameSet = {};
    ADS.filter(function(a) { return a.angle === ang.name && !a.parentAdId; }).forEach(function(a) {
      if (a.persona) personaNameSet[a.persona] = true;
    });
    var personaNameList = Object.keys(personaNameSet);
    var personaPills;
    if (personaNameList.length === 0) {
      personaPills = '<span class="tr-stat-pill">0 personas</span>';
    } else {
      personaPills = '<span class="tr-stat-pill tr-clickable" onclick="showPersonasForAngle(event,\'' + escJs(ang.name) + '\')" title="View personas">&#128101; ' + personaNameList.length + ' persona' + (personaNameList.length !== 1 ? 's' : '') + '</span>';
    }

    // Creatives pill (clickable)
    var creativesPill = stats.creatives > 0
      ? '<span class="tr-stat-pill tr-clickable pill-creatives" onclick="showCreativesPopup(event,\'angle\',\'' + escJs(ang.name) + '\')" title="View all creatives">&#127912; ' + stats.creatives + ' creative' + (stats.creatives !== 1 ? 's' : '') + '</span>'
      : '<span class="tr-stat-pill">0 creatives</span>';

    html += '<div class="' + rowCls + '" style="--i:' + i + '">' +
      '<div class="tr-num">' + (i + 1) + '</div>' +
      '<div class="tr-name" contenteditable="true" ' +
        'onblur="updateAngleName(' + i + ', this.textContent)" ' +
        'ondblclick="this.focus()" ' +
        'title="Double-click to edit">' + esc(ang.name) + winnerBadge + '</div>' +
      '<div class="tr-status"><span class="tr-status-badge ' + c.cls + '" title="Auto-derived from creatives">' + esc(derivedAngStatus) + '</span></div>' +
      '<div class="tr-src">' + srcCell + '</div>' +
      '<div class="tr-stats">' +
        personaPills +
        creativesPill +
        (stats.creatives > 0 ? '<span class="tr-stat-pill ' + winRateCls + '">&#127942; ' + stats.winRate + '% win</span>' : '') +
      '</div>' +
      '<div class="tr-notes" contenteditable="true" data-placeholder="Add notes..." ' +
        'onblur="updateAngleNotes(' + i + ', this.textContent)" ' +
        'title="Click to edit notes">' + esc(ang.notes || '') + '</div>' +
      '<div class="tr-actions">' +
        '<button onclick="openEditAngle(' + i + ')" title="Edit"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button class="tr-del" onclick="deleteAngle(' + i + ')" title="Delete"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
    '</div>';
  }

  gridEl.innerHTML = html;
}

