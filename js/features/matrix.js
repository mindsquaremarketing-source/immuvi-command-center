// ================================================
// Interactive Creative Matrix — Angle cards with
// persona pills carrying TOF/MOF/BOF coverage dots.
// Reads from the global ADS array; rows/pills are
// driven by ads with both angle AND persona filled in.
// ================================================

// ── Module state ──
var _mxFunnelFilter  = 'ALL';   // 'TOF' | 'MOF' | 'BOF' | 'ALL'
var _mxStatusFilter  = 'all';   // 'all' | 'winners' | 'gaps'
var _mxSearch        = '';
var _mxSelectedKey   = null;    // 'angle||persona' or null — drives the side panel
var _mxStyleInjected = false;

// ================================================
// initAnglePersonas — kept for sync.js callers; the new matrix
// reads angles/personas straight off ADS but other modules
// still seed ANGLE_PERSONAS from this hook on first load.
// ================================================
function initAnglePersonas() {
  ANGLE_PERSONAS = {};
  var allPersonaNames = PERSONAS.map(function (p) { return p.name; });
  ANGLES.forEach(function (a) {
    ANGLE_PERSONAS[a.name] = allPersonaNames.slice();
  });
  ADS.forEach(function (ad) {
    if (ad.angle && !ANGLE_PERSONAS[ad.angle]) {
      ANGLE_PERSONAS[ad.angle] = allPersonaNames.slice();
    }
  });
}

// ================================================
// renderMatrixStyle — inject scoped CSS into <head> once.
// Rules sit under #matrixGrid so the legacy matrix.css
// rules can't bleed in and these styles can't bleed out.
// ================================================
function renderMatrixStyle() {
  if (_mxStyleInjected) return;
  _mxStyleInjected = true;
  var css =
    '#matrixGrid .mx-board{display:flex;flex-direction:column;gap:14px;color:var(--t1);font-family:inherit;position:relative}' +
    '#matrixGrid .mx-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--card);border:1px solid var(--b);border-radius:var(--r);padding:10px 14px;box-shadow:0 1px 3px rgba(15,23,42,0.04)}' +
    '#matrixGrid .mx-tlabel{font-size:0.62rem;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:0.05em;margin-right:2px}' +
    '#matrixGrid .mx-fbar{display:inline-flex;background:rgba(0,0,0,0.04);border-radius:var(--rs);padding:2px;gap:0}' +
    '#matrixGrid .mx-fpill{font-size:0.7rem;font-weight:600;padding:5px 12px;border:0;background:transparent;color:var(--t2);border-radius:calc(var(--rs) - 1px);cursor:pointer;font-family:inherit;transition:all .15s}' +
    '#matrixGrid .mx-fpill:hover{color:var(--t1)}' +
    '#matrixGrid .mx-fpill.active{background:var(--card);color:var(--t1);box-shadow:0 1px 2px rgba(15,23,42,0.08)}' +
    '#matrixGrid .mx-status-sel,#matrixGrid .mx-search{font-size:0.7rem;padding:5px 10px;border:1px solid var(--b);border-radius:var(--rs);background:var(--card);color:var(--t1);font-family:inherit;outline:none;transition:border-color .15s}' +
    '#matrixGrid .mx-status-sel:focus,#matrixGrid .mx-search:focus{border-color:var(--test)}' +
    '#matrixGrid .mx-search{flex:1;min-width:160px;max-width:280px}' +
    '#matrixGrid .mx-stats{display:flex;flex-wrap:wrap;gap:14px;background:var(--card);border:1px solid var(--b);border-radius:var(--r);padding:10px 16px;box-shadow:0 1px 3px rgba(15,23,42,0.04)}' +
    '#matrixGrid .mx-stat{display:flex;flex-direction:column;gap:2px}' +
    '#matrixGrid .mx-stat-num{font-family:"JetBrains Mono",monospace;font-size:1.05rem;font-weight:700;color:var(--t1);line-height:1}' +
    '#matrixGrid .mx-stat-num.full{color:var(--win)}' +
    '#matrixGrid .mx-stat-num.part{color:var(--ready)}' +
    '#matrixGrid .mx-stat-num.gap{color:var(--t3)}' +
    '#matrixGrid .mx-stat-lbl{font-size:0.62rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em}' +
    '#matrixGrid .mx-legend{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:0.68rem;color:var(--t2);padding:8px 14px;background:var(--card);border:1px solid var(--b);border-radius:var(--r)}' +
    '#matrixGrid .mx-legend-item{display:flex;align-items:center;gap:5px}' +
    '#matrixGrid .mx-legend-sep{color:var(--b);font-size:1rem}' +
    '#matrixGrid .mx-legend b{color:var(--t1)}' +
    /* ── Cards layout ── */
    '#matrixGrid .mx-cards{display:flex;flex-direction:column;gap:12px}' +
    '#matrixGrid .mx-no-results{padding:32px 16px;text-align:center;color:var(--t3);font-size:0.78rem;background:var(--card);border:1px dashed var(--b);border-radius:var(--r)}' +
    '#matrixGrid .mx-angle-card{background:var(--card);border:1px solid var(--b);border-radius:var(--r);padding:12px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(15,23,42,0.04)}' +
    '#matrixGrid .mx-angle-header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '#matrixGrid .mx-angle-name{font-size:0.82rem;font-weight:700;color:var(--t1)}' +
    '#matrixGrid .mx-angle-count{font-size:0.65rem;color:var(--t3);font-family:"JetBrains Mono",monospace}' +
    '#matrixGrid .mx-angle-count b{color:var(--win);font-weight:700}' +
    '#matrixGrid .mx-angle-empty{font-size:0.7rem;color:var(--t3);font-style:italic;padding:4px 0}' +
    '#matrixGrid .mx-persona-row{display:flex;flex-wrap:wrap;gap:8px}' +
    '#matrixGrid .mx-persona-pill{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 14px;background:rgba(0,0,0,0.02);border:1px solid var(--b);border-radius:var(--r);cursor:pointer;transition:all .15s;min-width:120px;max-width:180px}' +
    '#matrixGrid .mx-persona-pill:hover{background:rgba(37,99,235,0.05);border-color:var(--test)}' +
    '#matrixGrid .mx-persona-pill.selected{background:rgba(37,99,235,0.08);border-color:var(--test);box-shadow:0 0 0 2px rgba(37,99,235,0.15)}' +
    '#matrixGrid .mx-persona-name{font-size:0.7rem;font-weight:600;color:var(--t1);text-align:center;line-height:1.3;word-break:break-word}' +
    '#matrixGrid .mx-persona-name .pn-win{display:inline-block;margin-left:4px;font-family:"JetBrains Mono",monospace;font-size:0.6rem;color:var(--win);font-weight:700}' +
    '#matrixGrid .mx-dots{display:flex;gap:6px;align-items:center}' +
    '#matrixGrid .mx-dot{width:12px;height:12px;border-radius:50%;background:#cbd5e1;display:inline-block}' +
    '#matrixGrid .mx-dot.win{background:var(--win)}' +
    '#matrixGrid .mx-dot.test{background:var(--test)}' +
    '#matrixGrid .mx-dot.ready{background:var(--ready)}' +
    '#matrixGrid .mx-dot.empty{background:#cbd5e1}' +
    '#matrixGrid .mx-dot.hl{transform:scale(1.4)}' +
    '#matrixGrid .mx-dot.fade{opacity:0.25}' +
    '#matrixGrid .mx-dot-labels{font-size:0.55rem;color:var(--t3);font-family:"JetBrains Mono",monospace;letter-spacing:0.1em}' +
    '#matrixGrid .mx-empty{background:var(--card);border:1px dashed var(--b);border-radius:var(--r);padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}' +
    '#matrixGrid .mx-empty-icon{font-size:1.8rem;color:var(--t3)}' +
    '#matrixGrid .mx-empty-title{font-size:0.95rem;font-weight:600;color:var(--t1)}' +
    '#matrixGrid .mx-empty-msg{font-size:0.78rem;color:var(--t2);max-width:420px;line-height:1.5}' +
    /* ── Side panel ── */
    '.mx-panel-back{position:fixed;inset:0;background:rgba(15,23,42,0.32);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:480;animation:mxFade .18s ease both}' +
    '.mx-panel{position:fixed;top:0;right:0;bottom:0;width:min(460px,100vw);background:var(--card);border-left:1px solid var(--b);box-shadow:-8px 0 24px rgba(15,23,42,0.12);z-index:481;display:flex;flex-direction:column;animation:mxSlide .22s cubic-bezier(0.16,1,0.3,1) both;color:var(--t1);font-family:inherit}' +
    '.mx-panel-hdr{padding:14px 18px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between;gap:10px}' +
    '.mx-panel-title{font-size:0.85rem;font-weight:700;color:var(--t1);display:flex;align-items:center;gap:8px;flex:1;min-width:0}' +
    '.mx-panel-title .x{color:var(--t3);font-weight:400}' +
    '.mx-panel-close{background:rgba(0,0,0,0.04);border:1px solid var(--b);color:var(--t2);border-radius:var(--rs);padding:4px 10px;font-size:0.7rem;cursor:pointer;font-family:inherit;transition:all .15s}' +
    '.mx-panel-close:hover{background:rgba(0,0,0,0.08);color:var(--t1)}' +
    '.mx-panel-body{flex:1;overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:14px}' +
    '.mx-panel-section{border:1px solid var(--b);border-radius:var(--r);padding:10px 12px;background:rgba(0,0,0,0.015)}' +
    '.mx-ps-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '.mx-ps-title{font-size:0.7rem;font-weight:700;color:var(--t1);text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:6px}' +
    '.mx-ps-pip{width:8px;height:8px;border-radius:50%}' +
    '.mx-ps-pip.win{background:var(--win)}.mx-ps-pip.test{background:var(--test)}.mx-ps-pip.ready{background:var(--ready)}.mx-ps-pip.empty{background:#cbd5e1}' +
    '.mx-ps-count{font-size:0.62rem;color:var(--t3);font-family:"JetBrains Mono",monospace}' +
    '.mx-ps-empty{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0}' +
    '.mx-ps-empty-msg{font-size:0.72rem;color:var(--t3);font-style:italic}' +
    '.mx-create-btn{font-size:0.68rem;padding:5px 11px;border-radius:var(--rs);background:rgba(37,99,235,0.08);color:var(--test);border:1px solid rgba(37,99,235,0.22);cursor:pointer;font-family:inherit;font-weight:600;white-space:nowrap;transition:all .15s}' +
    '.mx-create-btn:hover:not(:disabled){background:var(--test);color:#fff}' +
    '.mx-create-btn:disabled{cursor:default;opacity:0.7}' +
    '.mx-create-btn.creating{background:rgba(0,0,0,0.04);border-color:var(--b);color:var(--t3)}' +
    '.mx-create-btn.success{background:rgba(5,150,105,0.1);border-color:rgba(5,150,105,0.25);color:var(--win)}' +
    '.mx-create-btn.failed{background:rgba(220,38,38,0.08);border-color:rgba(220,38,38,0.22);color:var(--lose)}' +
    '.mx-ad-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;padding:7px 0;border-top:1px dashed var(--b);align-items:center}' +
    '.mx-ad-row:first-child{border-top:0}' +
    '.mx-ad-pill{font-size:0.6rem;font-weight:600;padding:2px 7px;border-radius:10px;white-space:nowrap;font-family:inherit}' +
    '.mx-ad-pill.win{background:rgba(5,150,105,0.1);color:var(--win);border:1px solid rgba(5,150,105,0.22)}' +
    '.mx-ad-pill.test{background:rgba(79,70,229,0.1);color:var(--test);border:1px solid rgba(79,70,229,0.22)}' +
    '.mx-ad-pill.ready{background:rgba(217,119,6,0.1);color:var(--ready);border:1px solid rgba(217,119,6,0.22)}' +
    '.mx-ad-pill.lose{background:rgba(220,38,38,0.08);color:var(--lose);border:1px solid rgba(220,38,38,0.22)}' +
    '.mx-ad-pill.notstart{background:rgba(139,92,246,0.08);color:var(--notstart);border:1px solid rgba(139,92,246,0.22)}' +
    '.mx-ad-pill.inprog{background:rgba(37,99,235,0.08);color:var(--inprog);border:1px solid rgba(37,99,235,0.22)}' +
    '.mx-ad-main{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.mx-ad-name{font-size:0.74rem;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.mx-ad-meta{font-size:0.62rem;color:var(--t3);display:flex;flex-wrap:wrap;gap:6px}' +
    '.mx-ad-meta b{color:var(--t2);font-weight:600}' +
    '.mx-ad-cu{font-size:0.65rem;color:var(--inprog);text-decoration:none;font-weight:600;white-space:nowrap}' +
    '.mx-ad-cu:hover{text-decoration:underline}' +
    '.mx-ad-cu.dim{color:var(--t3);font-weight:400;cursor:default}' +
    '@keyframes mxFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes mxSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}';

  var styleEl = document.createElement('style');
  styleEl.id = 'mx-grid-style';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

// ================================================
// mxBuildModel — read ADS, group by angle×persona×funnel,
// return { angles, personas, cells, hasData }.
// Skips variations (parentAdId set) so duplicate child ads
// don't double-count winners or fill rows by themselves.
// ================================================
function mxBuildModel() {
  var byAngle   = {};  // angleName   -> { winners: n }
  var byPersona = {};  // personaName -> { winners: n }
  var cells     = {};  // 'angle||persona' -> { TOF:[], MOF:[], BOF:[] }
  var hasData   = false;

  for (var i = 0; i < ADS.length; i++) {
    var ad = ADS[i];
    if (!ad.angle || !ad.persona) continue;
    if (ad.parentAdId) continue;
    hasData = true;

    var fn = ad.funnelStage || 'TOF';
    if (fn !== 'TOF' && fn !== 'MOF' && fn !== 'BOF') fn = 'TOF';

    if (!byAngle[ad.angle])      byAngle[ad.angle]     = { winners: 0 };
    if (!byPersona[ad.persona])  byPersona[ad.persona] = { winners: 0 };
    if (ad.status === 'Winner' || ad.status === 'Scale') {
      byAngle[ad.angle].winners++;
      byPersona[ad.persona].winners++;
    }

    var key = ad.angle + '||' + ad.persona;
    if (!cells[key]) cells[key] = { TOF: [], MOF: [], BOF: [] };
    cells[key][fn].push(ad);
  }

  var byAngleSort = function (a, b) {
    var d = byAngle[b].winners - byAngle[a].winners;
    return d !== 0 ? d : a.localeCompare(b);
  };
  var byPersonaSort = function (a, b) {
    var d = byPersona[b].winners - byPersona[a].winners;
    return d !== 0 ? d : a.localeCompare(b);
  };

  return {
    angles:   Object.keys(byAngle).sort(byAngleSort),
    personas: Object.keys(byPersona).sort(byPersonaSort),
    cells:    cells,
    hasData:  hasData,
    angleWin: byAngle,
    persWin:  byPersona
  };
}

// ================================================
// mxFunnelDotState — color class for a single funnel slot.
// 'win' beats 'test' beats 'ready' beats 'empty'.
// ================================================
function mxFunnelDotState(ads) {
  if (!ads || ads.length === 0) return 'empty';
  var hasWin = false, hasTest = false, hasReady = false;
  for (var i = 0; i < ads.length; i++) {
    var s = ads[i].status;
    if (s === 'Winner' || s === 'Scale') hasWin = true;
    else if (s === 'Testing')             hasTest = true;
    else if (s === 'Untested' || s === 'In Production' || s === 'Ready to Launch' || s === 'Approved' || s === 'Not Started')
      hasReady = true;
  }
  if (hasWin)   return 'win';
  if (hasTest)  return 'test';
  if (hasReady) return 'ready';
  return 'empty';
}

// ================================================
// mxCellSummary — coverage tier for a cell across all funnels.
// Returns 'full' (3/3 funnels covered), 'partial' (1-2), or 'none'.
// ================================================
function mxCellSummary(cell) {
  if (!cell) return 'none';
  var n = (cell.TOF.length ? 1 : 0) + (cell.MOF.length ? 1 : 0) + (cell.BOF.length ? 1 : 0);
  if (n === 3) return 'full';
  if (n === 0) return 'none';
  return 'partial';
}

function mxCellHasWinner(cell) {
  if (!cell) return false;
  var stages = ['TOF', 'MOF', 'BOF'];
  for (var i = 0; i < 3; i++) {
    var ads = cell[stages[i]] || [];
    for (var j = 0; j < ads.length; j++) {
      if (ads[j].status === 'Winner' || ads[j].status === 'Scale') return true;
    }
  }
  return false;
}

function mxCellHasGap(cell) {
  if (!cell) return true;
  return !cell.TOF.length || !cell.MOF.length || !cell.BOF.length;
}

// ================================================
// mxCellMatchesStatus — apply the status filter to a cell.
// ================================================
function mxCellMatchesStatus(cell) {
  if (_mxStatusFilter === 'all')     return true;
  if (_mxStatusFilter === 'winners') return mxCellHasWinner(cell);
  if (_mxStatusFilter === 'gaps')    return mxCellHasGap(cell);
  return true;
}

// ================================================
// renderMatrix — main renderer for the Creative Matrix tab.
// ================================================
function renderMatrix() {
  var el = document.getElementById('matrixGrid');
  if (!el) return;
  renderMatrixStyle();

  var model = mxBuildModel();

  // ── Empty state ──
  if (!model.hasData) {
    el.innerHTML =
      '<div class="mx-empty">' +
        '<div class="mx-empty-icon">◇</div>' +
        '<div class="mx-empty-title">No classified ads yet</div>' +
        '<div class="mx-empty-msg">Run the creative pipeline to classify ads and populate the matrix</div>' +
      '</div>';
    return;
  }

  // ── Apply search to angle/persona visibility ──
  var q = (_mxSearch || '').toLowerCase().trim();
  var anglesVis   = model.angles.slice();
  var personasVis = model.personas.slice();
  if (q) {
    var aMatch = model.angles.filter(function (a) { return a.toLowerCase().indexOf(q) !== -1; });
    var pMatch = model.personas.filter(function (p) { return p.toLowerCase().indexOf(q) !== -1; });
    // If the search matches angle names, restrict cards; same for personas.
    // If neither axis matches, fall through and show everything (the user
    // gets a no-result feel via the empty body rather than a hidden state).
    if (aMatch.length || pMatch.length) {
      if (aMatch.length) anglesVis   = aMatch;
      if (pMatch.length) personasVis = pMatch;
    }
  }

  // ── Apply status filter to angle visibility ──
  // Hide an angle entirely only when none of its (search-visible) personas
  // would render a pill under the active filter. Per-pill filtering happens
  // inside renderAngleCard so we can also show the "no personas" empty state.
  if (_mxStatusFilter !== 'all') {
    anglesVis = anglesVis.filter(function (a) {
      return personasVis.some(function (p) {
        return mxCellMatchesStatus(model.cells[a + '||' + p]);
      });
    });
  }

  // ── Stats: computed across the full model, not the filtered view ──
  var totalCombos = model.angles.length * model.personas.length;
  var fullCovered = 0, partialCovered = 0, gapCells = 0;
  model.angles.forEach(function (a) {
    model.personas.forEach(function (p) {
      var sum = mxCellSummary(model.cells[a + '||' + p]);
      if (sum === 'full')     fullCovered++;
      else if (sum === 'partial') partialCovered++;
      else                    gapCells++;
    });
  });

  // ── Build HTML ──
  var html = '<div class="mx-board">';

  // Toolbar: funnel pills + status filter + search
  html += '<div class="mx-toolbar">';
  html += '<span class="mx-tlabel">Funnel</span><div class="mx-fbar">';
  ['ALL', 'TOF', 'MOF', 'BOF'].forEach(function (f) {
    var lbl = f === 'ALL' ? 'All' : f;
    html += '<button class="mx-fpill' + (_mxFunnelFilter === f ? ' active' : '') +
      '" onclick="mxSetFunnelFilter(\'' + f + '\')">' + lbl + '</button>';
  });
  html += '</div>';
  html += '<span class="mx-tlabel" style="margin-left:8px">Status</span>';
  html += '<select class="mx-status-sel" onchange="mxSetStatusFilter(this.value)">' +
    '<option value="all"' + (_mxStatusFilter === 'all' ? ' selected' : '') + '>All</option>' +
    '<option value="winners"' + (_mxStatusFilter === 'winners' ? ' selected' : '') + '>Winners Only</option>' +
    '<option value="gaps"' + (_mxStatusFilter === 'gaps' ? ' selected' : '') + '>Has Gaps</option>' +
    '</select>';
  html += '<input type="text" class="mx-search" placeholder="Search angle or persona…" value="' + escAttr(_mxSearch) +
    '" oninput="mxSetSearch(this.value)">';
  html += '</div>';

  // Legend bar — color key + T/M/B funnel abbreviation map
  html += '<div class="mx-legend">' +
    '<span class="mx-legend-item"><span class="mx-dot win"></span> Winner/Scale</span>' +
    '<span class="mx-legend-item"><span class="mx-dot test"></span> Testing</span>' +
    '<span class="mx-legend-item"><span class="mx-dot ready"></span> In Progress</span>' +
    '<span class="mx-legend-item"><span class="mx-dot empty"></span> No ads</span>' +
    '<span class="mx-legend-sep">·</span>' +
    '<span class="mx-legend-item"><b>T</b> = Top of Funnel</span>' +
    '<span class="mx-legend-item"><b>M</b> = Middle of Funnel</span>' +
    '<span class="mx-legend-item"><b>B</b> = Bottom of Funnel</span>' +
    '</div>';

  // Stats bar
  html += '<div class="mx-stats">' +
    '<div class="mx-stat"><span class="mx-stat-num">' + totalCombos + '</span><span class="mx-stat-lbl">Total combinations</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num full">' + fullCovered + '</span><span class="mx-stat-lbl">Fully covered</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num part">' + partialCovered + '</span><span class="mx-stat-lbl">Partially covered</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num gap">' + gapCells + '</span><span class="mx-stat-lbl">Not started</span></div>' +
    '</div>';

  // Cards (one per angle)
  html += renderMatrixCards(model, anglesVis, personasVis);

  html += '</div>'; // .mx-board

  // Side panel (fixed-position; lives outside the board flow)
  if (_mxSelectedKey) {
    var parts = _mxSelectedKey.split('||');
    var selA  = parts[0];
    var selP  = parts[1];
    var selCell = (model.cells[_mxSelectedKey]) || { TOF: [], MOF: [], BOF: [] };
    html += renderMatrixPanel(selA, selP, selCell);
  }

  el.innerHTML = html;
}

// ================================================
// renderMatrixCards — angle-card list. One card per visible
// angle, each holding a row of persona pills.
// ================================================
function renderMatrixCards(model, anglesVis, personasVis) {
  if (anglesVis.length === 0 || personasVis.length === 0) {
    return '<div class="mx-no-results">No combinations match the current filters.</div>';
  }
  var html = '<div class="mx-cards">';
  anglesVis.forEach(function (a) {
    html += renderAngleCard(a, personasVis, model);
  });
  html += '</div>';
  return html;
}

// ================================================
// renderAngleCard — one angle's card with header + persona pills.
// Pills hidden by the status filter are dropped from this card;
// if none remain, an empty state is shown inside the card.
// ================================================
function renderAngleCard(angleName, personasVis, model) {
  var visiblePersonas = personasVis.filter(function (p) {
    return mxCellMatchesStatus(model.cells[angleName + '||' + p]);
  });

  var aw = (model.angleWin[angleName] && model.angleWin[angleName].winners) || 0;
  var pCount = visiblePersonas.length;
  var pLbl = pCount + ' persona' + (pCount === 1 ? '' : 's');
  var wLbl = aw > 0 ? ' · <b>' + aw + ' winner' + (aw === 1 ? '' : 's') + '</b>' : '';

  var html = '<div class="mx-angle-card">';
  html += '<div class="mx-angle-header">';
  html += '<span class="mx-angle-name">' + esc(angleName) + '</span>';
  html += '<span class="mx-angle-count">' + pLbl + wLbl + '</span>';
  html += '</div>';

  if (visiblePersonas.length === 0) {
    html += '<div class="mx-angle-empty">No personas with this filter</div>';
  } else {
    html += '<div class="mx-persona-row">';
    visiblePersonas.forEach(function (p) {
      html += renderPersonaPill(angleName, p, model.cells[angleName + '||' + p], model);
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ================================================
// renderPersonaPill — one persona pill: name + 3 dots + T·M·B labels.
// Clicking opens the right-side drill-down panel for the cell.
// ================================================
function renderPersonaPill(angleName, personaName, cell, model) {
  var key = angleName + '||' + personaName;
  var isSelected = (_mxSelectedKey === key);
  var stages = ['TOF', 'MOF', 'BOF'];
  var pw = (model.persWin[personaName] && model.persWin[personaName].winners) || 0;

  var html = '<div class="mx-persona-pill' + (isSelected ? ' selected' : '') +
    '" onclick="mxOpenCell(\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\')" title="' +
    escAttr(angleName) + ' × ' + escAttr(personaName) + '">';

  html += '<span class="mx-persona-name">' + esc(personaName) +
    (pw > 0 ? '<span class="pn-win">' + pw + 'W</span>' : '') + '</span>';

  html += '<div class="mx-dots">';
  for (var i = 0; i < 3; i++) {
    var fn = stages[i];
    var st = mxFunnelDotState(cell ? cell[fn] : null);
    var dCls = 'mx-dot ' + st;
    if (_mxFunnelFilter !== 'ALL') {
      dCls += (fn === _mxFunnelFilter) ? ' hl' : ' fade';
    }
    var fnAds = (cell && cell[fn]) ? cell[fn].length : 0;
    var titleTxt = fn + ': ' + (fnAds ? fnAds + ' ad' + (fnAds > 1 ? 's' : '') + ' (' + st + ')' : 'No ads');
    html += '<span class="' + dCls + '" title="' + escAttr(titleTxt) + '"></span>';
  }
  html += '</div>';

  html += '<span class="mx-dot-labels">T &middot; M &middot; B</span>';
  html += '</div>';
  return html;
}

// ================================================
// renderMatrixPanel — right-side drill-down panel.
// ================================================
function renderMatrixPanel(angleName, personaName, cell) {
  var html = '<div class="mx-panel-back" onclick="mxClosePanel()"></div>';
  html += '<div class="mx-panel" onclick="event.stopPropagation()">';

  // Header
  html += '<div class="mx-panel-hdr">';
  html += '<div class="mx-panel-title">' + esc(angleName) + ' <span class="x">×</span> ' + esc(personaName) + '</div>';
  html += '<button class="mx-panel-close" onclick="mxClosePanel()">Close</button>';
  html += '</div>';

  // Body — three funnel sections
  html += '<div class="mx-panel-body">';
  ['TOF', 'MOF', 'BOF'].forEach(function (fn) {
    html += renderMatrixPanelSection(angleName, personaName, fn, cell[fn] || []);
  });
  html += '</div>';

  html += '</div>';
  return html;
}

// ================================================
// renderMatrixPanelSection — one funnel section in the side panel.
// ================================================
function renderMatrixPanelSection(angleName, personaName, funnel, ads) {
  var dotState = mxFunnelDotState(ads);

  var html = '<div class="mx-panel-section">';
  html += '<div class="mx-ps-hdr">';
  html += '<div class="mx-ps-title"><span class="mx-ps-pip ' + dotState + '"></span>' + funnel + '</div>';
  html += '<div class="mx-ps-count">' + ads.length + ' ad' + (ads.length === 1 ? '' : 's') + '</div>';
  html += '</div>';

  if (ads.length === 0) {
    var btnId = 'mxct-' + funnel + '-' + Math.random().toString(36).slice(2, 8);
    html += '<div class="mx-ps-empty">';
    html += '<span class="mx-ps-empty-msg">No creatives yet for ' + funnel + '.</span>';
    html += '<button id="' + btnId + '" class="mx-create-btn" onclick="mxCreateTest(\'' +
      escJs(angleName) + '\',\'' + escJs(personaName) + '\',\'' + funnel + '\', this)">+ Create Test</button>';
    html += '</div>';
  } else {
    ads.forEach(function (ad) {
      html += renderMatrixPanelAd(ad);
    });
  }

  html += '</div>';
  return html;
}

// ================================================
// renderMatrixPanelAd — one row inside a funnel section.
// ================================================
function renderMatrixPanelAd(ad) {
  var c = classify(ad.status);
  var name = ad.formatName || ad.id || '(unnamed)';
  var hook = ad.hookType || '';
  var struct = ad.creativeStructure || '';
  var cuId = ad._clickupId;

  var html = '<div class="mx-ad-row">';
  html += '<span class="mx-ad-pill ' + c.cls + '">' + esc(c.lbl) + '</span>';
  html += '<div class="mx-ad-main">';
  html += '<div class="mx-ad-name" title="' + escAttr(name) + '">' + esc(name) + '</div>';
  if (hook || struct) {
    html += '<div class="mx-ad-meta">';
    if (hook)   html += '<span><b>Hook:</b> ' + esc(hook) + '</span>';
    if (struct) html += '<span><b>Structure:</b> ' + esc(struct) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  if (cuId) {
    html += '<a class="mx-ad-cu" href="https://app.clickup.com/t/' + escAttr(cuId) +
      '" target="_blank" rel="noopener" onclick="event.stopPropagation()">ClickUp ↗</a>';
  } else {
    html += '<span class="mx-ad-cu dim">no link</span>';
  }
  html += '</div>';
  return html;
}

// ================================================
// mxOpenCell / mxClosePanel — side-panel selection state.
// ================================================
function mxOpenCell(angleName, personaName) {
  _mxSelectedKey = angleName + '||' + personaName;
  renderMatrix();
}
function mxClosePanel() {
  _mxSelectedKey = null;
  renderMatrix();
}

// ================================================
// Filter setters — re-render after each change.
// ================================================
function mxSetFunnelFilter(f) {
  _mxFunnelFilter = f;
  renderMatrix();
}
function mxSetStatusFilter(s) {
  _mxStatusFilter = s;
  renderMatrix();
}
function mxSetSearch(q) {
  _mxSearch = q || '';
  // Search input lives inside #matrixGrid which we re-render; preserve focus by
  // re-querying after the next paint and restoring caret position.
  var caret = null;
  try {
    var inp = document.querySelector('#matrixGrid .mx-search');
    if (inp) caret = inp.selectionStart;
  } catch (e) {}
  renderMatrix();
  try {
    var inp2 = document.querySelector('#matrixGrid .mx-search');
    if (inp2) {
      inp2.focus();
      if (caret != null) inp2.setSelectionRange(caret, caret);
    }
  } catch (e) {}
}

// ================================================
// mxCreateTest — creates a gap test for an empty funnel section.
// Mirrors the createGapTaskFromRow flow used in hq.js so the
// resulting Action Plan entry and ClickUp task look identical.
// ================================================
function mxCreateTest(angleName, personaName, funnel, btn) {
  if (typeof createGapTaskFromRow !== 'function') {
    if (typeof toast === 'function') toast('Action Plan not available', 'error');
    return;
  }
  // Suggest the first format from FUNNEL_FORMAT_SUGGESTIONS for this funnel,
  // matching how Next Tests in HQ picks a default.
  var sugg = (typeof FUNNEL_FORMAT_SUGGESTIONS !== 'undefined' && FUNNEL_FORMAT_SUGGESTIONS[funnel])
    ? FUNNEL_FORMAT_SUGGESTIONS[funnel][0]
    : 'New ' + funnel + ' Test';

  var prio = (typeof PRIORITY !== 'undefined' && PRIORITY.COLD) ? PRIORITY.COLD : 3;
  var gap = {
    angle:    angleName,
    persona:  personaName,
    funnel:   funnel,
    format:   sugg,
    priority: prio,
    siblingWinner: false
  };
  createGapTaskFromRow(gap, btn);
}

// ================================================
// showInspoCellsPopup — list every task spawned from an inspiration.
// Called from inspiration.js's table; kept here so the matrix module
// stays the single home for cell↔task bookkeeping UI.
// ================================================
function showInspoCellsPopup(insId) {
  var ins = INSPIRATIONS.find(function (i) { return i.id === insId; });
  var insLabel = insId + (ins ? ' — ' + esc(ins.brand || ins.formatName || '') : '');

  var linked = ADS.filter(function (a) { return a._fromInspoId === insId; });

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
