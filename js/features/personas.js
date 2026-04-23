// ── 4c. PERSONAS ──

function renderPersonas() {
  function getPersonaStats(personaName) {
    var ads = ADS.filter(function(a) { return a.persona === personaName && !a.parentAdId; });
    var angleSet = {};
    var winners = 0;
    for (var i = 0; i < ads.length; i++) {
      if (ads[i].angle) angleSet[ads[i].angle] = true;
      if (ads[i].status === 'Winner') winners++;
    }
    var angleCount = Object.keys(angleSet).length;
    var total = ads.length;
    var winRate = total > 0 ? Math.round((winners / total) * 100) : 0;
    return { angles: angleCount, creatives: total, winners: winners, winRate: winRate };
  }

  var summaryEl = document.getElementById('personasSummary');
  var winCount = 0, testCount = 0, notStartCount = 0, totalAds = 0;
  for (var i = 0; i < PERSONAS.length; i++) {
    var st = derivePersonaStatus(PERSONAS[i].name);
    if (st === 'Winner' || st === 'Scale') winCount++;
    else if (st === 'Testing') testCount++;
    else if (st === 'Untested') notStartCount++;
    totalAds += getPersonaStats(PERSONAS[i].name).creatives;
  }
  summaryEl.innerHTML = '<div class="tracker-summary">' +
    '<span class="tracker-summary-stat">Total Personas: <strong>' + PERSONAS.length + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat" style="color:var(--win)">Winners: <strong>' + winCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat" style="color:var(--test)">Testing: <strong>' + testCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat">Untested: <strong>' + notStartCount + '</strong></span>' +
    '<span class="tracker-summary-divider"></span>' +
    '<span class="tracker-summary-stat">Total Creatives: <strong>' + totalAds + '</strong></span>' +
  '</div>';

  var bodyEl = document.getElementById('personasBody');
  bodyEl.style.display = 'none';

  var gridId = 'personasGrid';
  var gridEl = document.getElementById(gridId);
  if (!gridEl) {
    gridEl = document.createElement('div');
    gridEl.id = gridId;
    gridEl.className = 'tracker-grid';
    bodyEl.closest('table').insertAdjacentElement('afterend', gridEl);
    bodyEl.closest('table').style.display = 'none';
  }

  if (PERSONAS.length === 0) {
    gridEl.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128100;</div><div class="empty-text">No personas yet</div><div class="empty-hint">Click "+ Add Persona" to get started</div></div>';
    return;
  }

  var html = '<div class="tracker-header">' +
    '<span>#</span><span>Persona Name</span><span>Status</span><span>Source Link</span><span>Stats</span><span>Notes</span><span>Actions</span>' +
  '</div>';

  for (var i = 0; i < PERSONAS.length; i++) {
    var per = PERSONAS[i];
    // Auto-derive status from ads — sync back to stored value
    var derivedPerStatus = derivePersonaStatus(per.name);
    per.status = derivedPerStatus;
    var c = classify(derivedPerStatus);
    var stats = getPersonaStats(per.name);
    var winRateCls = stats.winRate >= 30 ? 'win-rate-good' : (stats.winRate > 0 ? 'win-rate-ok' : '');
    var winnerBadge = derivedPerStatus === 'Winner' || derivedPerStatus === 'Scale' ? '<span class="tr-win-badge">&#11088; Winner</span>' : '';
    var rowCls = 'tracker-row status-' + c.cls;

    // Source link cell
    var srcUrlDisplay = '';
    if (per.sourceLink) {
      srcUrlDisplay = per.sourceLink.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30);
      if (srcUrlDisplay.length < per.sourceLink.replace(/^https?:\/\/(www\.)?/, '').length) srcUrlDisplay += '…';
    }
    var srcCell = per.sourceLink
      ? '<a class="tr-src-link" href="' + escAttr(per.sourceLink) + '" target="_blank" rel="noopener">' +
          '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          esc(srcUrlDisplay) + '</a>'
      : '<span class="tr-src-empty" onclick="openEditPersona(' + i + ')" title="Click to add source link">+ Add link</span>';

    // Angle name pills (clickable → show angle detail or filter)
    var angleNameSet = {};
    ADS.filter(function(a) { return a.persona === per.name && !a.parentAdId; }).forEach(function(a) {
      if (a.angle) angleNameSet[a.angle] = true;
    });
    var angleNameList = Object.keys(angleNameSet);
    var anglePills;
    if (angleNameList.length === 0) {
      anglePills = '<span class="tr-stat-pill">0 angles</span>';
    } else {
      anglePills = '<span class="tr-stat-pill tr-clickable" onclick="showAnglesForPersona(event,\'' + escJs(per.name) + '\')" title="View angles">&#128203; ' + angleNameList.length + ' angle' + (angleNameList.length !== 1 ? 's' : '') + '</span>';
    }

    // Creatives pill (clickable)
    var creativesPill = stats.creatives > 0
      ? '<span class="tr-stat-pill tr-clickable pill-creatives" onclick="showCreativesPopup(event,\'persona\',\'' + escJs(per.name) + '\')" title="View all creatives">&#127912; ' + stats.creatives + ' creative' + (stats.creatives !== 1 ? 's' : '') + '</span>'
      : '<span class="tr-stat-pill">0 creatives</span>';

    html += '<div class="' + rowCls + '" style="--i:' + i + '">' +
      '<div class="tr-num">' + (i + 1) + '</div>' +
      '<div class="tr-name" contenteditable="true" ' +
        'onblur="updatePersonaName(' + i + ', this.textContent)" ' +
        'ondblclick="this.focus()" ' +
        'title="Double-click to edit">' + esc(per.name) + winnerBadge + '</div>' +
      '<div class="tr-status"><span class="tr-status-badge ' + c.cls + '" title="Auto-derived from creatives">' + esc(derivedPerStatus) + '</span></div>' +
      '<div class="tr-src">' + srcCell + '</div>' +
      '<div class="tr-stats">' +
        anglePills +
        creativesPill +
        (stats.creatives > 0 ? '<span class="tr-stat-pill ' + winRateCls + '">&#127942; ' + stats.winRate + '% win</span>' : '') +
      '</div>' +
      '<div class="tr-notes" contenteditable="true" data-placeholder="Add notes..." ' +
        'onblur="updatePersonaNotes(' + i + ', this.textContent)" ' +
        'title="Click to edit notes">' + esc(per.notes || '') + '</div>' +
      '<div class="tr-actions">' +
        '<button onclick="openEditPersona(' + i + ')" title="Edit"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button class="tr-del" onclick="deletePersona(' + i + ')" title="Delete"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
    '</div>';
  }

  gridEl.innerHTML = html;
}

