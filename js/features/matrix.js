// ================================================
// Interactive Creative Matrix — Angle × Persona grid
// with per-funnel coverage dots and right-side drill panel.
// Reads from the global ADS array; row/col existence is
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
// All rules sit under #matrixGrid so the legacy matrix.css
// rules can't bleed in and dot-grid styles can't bleed out.
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
    '#matrixGrid .mx-grid-wrap{background:var(--card);border:1px solid var(--b);border-radius:var(--r);padding:0;overflow:auto;box-shadow:0 1px 3px rgba(15,23,42,0.04)}' +
    '#matrixGrid .mx-table{display:grid;gap:0;min-width:100%}' +
    '#matrixGrid .mx-corner,#matrixGrid .mx-ch,#matrixGrid .mx-rh,#matrixGrid .mx-gcell{border-bottom:1px solid var(--b);border-right:1px solid var(--b);padding:8px 10px;background:var(--card)}' +
    '#matrixGrid .mx-corner{background:rgba(0,0,0,0.02);position:sticky;top:0;left:0;z-index:3;font-size:0.62rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em;font-weight:600}' +
    '#matrixGrid .mx-ch{position:sticky;top:0;z-index:2;background:rgba(0,0,0,0.02);font-weight:600;color:var(--t1);writing-mode:vertical-rl;transform:rotate(180deg);height:100px;white-space:nowrap;font-size:0.65rem;padding:8px 6px;display:flex;align-items:flex-start;overflow:hidden}' +
    '#matrixGrid .mx-ch-win{font-family:"JetBrains Mono",monospace;font-size:0.6rem;color:var(--win);margin-left:6px;font-weight:700}' +
    '#matrixGrid .mx-legend{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:0.68rem;color:var(--t2);padding:8px 14px;background:var(--card);border:1px solid var(--b);border-radius:var(--r)}' +
    '#matrixGrid .mx-legend-item{display:flex;align-items:center;gap:5px}' +
    '#matrixGrid .mx-legend-sep{color:var(--b);font-size:1rem}' +
    '#matrixGrid .mx-legend b{color:var(--t1)}' +
    '#matrixGrid .mx-rh{position:sticky;left:0;z-index:1;background:var(--card);font-size:0.72rem;font-weight:600;color:var(--t1);white-space:nowrap;display:flex;align-items:center;gap:6px}' +
    '#matrixGrid .mx-rh-win{font-family:"JetBrains Mono",monospace;font-size:0.6rem;color:var(--win);font-weight:700}' +
    '#matrixGrid .mx-gcell{cursor:pointer;transition:background .12s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:88px;min-height:54px;position:relative}' +
    '#matrixGrid .mx-gcell:hover{background:rgba(37,99,235,0.05)}' +
    '#matrixGrid .mx-gcell.selected{background:rgba(37,99,235,0.08);box-shadow:inset 0 0 0 2px var(--test)}' +
    '#matrixGrid .mx-gcell.dim{opacity:0.28}' +
    '#matrixGrid .mx-dots{display:flex;gap:5px;align-items:center}' +
    '#matrixGrid .mx-dot{width:10px;height:10px;border-radius:50%;background:#cbd5e1;display:inline-block;position:relative}' +
    '#matrixGrid .mx-dot.win{background:var(--win);box-shadow:0 0 0 2px rgba(5,150,105,0.18)}' +
    '#matrixGrid .mx-dot.test{background:var(--test);box-shadow:0 0 0 2px rgba(79,70,229,0.18)}' +
    '#matrixGrid .mx-dot.ready{background:var(--ready);box-shadow:0 0 0 2px rgba(217,119,6,0.18)}' +
    '#matrixGrid .mx-dot.empty{background:#cbd5e1}' +
    '#matrixGrid .mx-dot.hl{transform:scale(1.45)}' +
    '#matrixGrid .mx-dot.fade{opacity:0.25}' +
    '#matrixGrid .mx-dot-lbl{font-size:0.55rem;color:var(--t3);font-family:"JetBrains Mono",monospace;letter-spacing:0.04em}' +
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

  // ── Apply search to row/col visibility ──
  var q = (_mxSearch || '').toLowerCase().trim();
  var anglesVis   = model.angles.slice();
  var personasVis = model.personas.slice();
  if (q) {
    var aMatch = model.angles.filter(function (a) { return a.toLowerCase().indexOf(q) !== -1; });
    var pMatch = model.personas.filter(function (p) { return p.toLowerCase().indexOf(q) !== -1; });
    // If the search matches angle names, restrict rows; same for personas.
    // If neither axis matches, fall through and show everything (the user
    // gets a no-result feel via the empty grid rather than a hidden state).
    if (aMatch.length || pMatch.length) {
      if (aMatch.length) anglesVis   = aMatch;
      if (pMatch.length) personasVis = pMatch;
    }
  }

  // ── Apply status filter to row/col visibility ──
  if (_mxStatusFilter !== 'all') {
    var keepAngle = {}, keepPersona = {};
    anglesVis.forEach(function (a) {
      personasVis.forEach(function (p) {
        if (mxCellMatchesStatus(model.cells[a + '||' + p])) {
          keepAngle[a] = true;
          keepPersona[p] = true;
        }
      });
    });
    anglesVis   = anglesVis.filter(function (a) { return keepAngle[a]; });
    personasVis = personasVis.filter(function (p) { return keepPersona[p]; });
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

  // Stats bar
  html += '<div class="mx-stats">' +
    '<div class="mx-stat"><span class="mx-stat-num">' + totalCombos + '</span><span class="mx-stat-lbl">Total combinations</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num full">' + fullCovered + '</span><span class="mx-stat-lbl">Fully covered</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num part">' + partialCovered + '</span><span class="mx-stat-lbl">Partially covered</span></div>' +
    '<div class="mx-stat"><span class="mx-stat-num gap">' + gapCells + '</span><span class="mx-stat-lbl">Not started</span></div>' +
    '</div>';

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

  // Grid
  html += '<div class="mx-grid-wrap">';
  if (anglesVis.length === 0 || personasVis.length === 0) {
    html += '<div style="padding:32px 16px;text-align:center;color:var(--t3);font-size:0.78rem">No combinations match the current filters.</div>';
  } else {
    var gridCols = '160px repeat(' + personasVis.length + ', 110px)';
    html += '<div class="mx-table" style="grid-template-columns:' + gridCols + '">';

    // Header row: corner + persona headers (rotated, name truncated to 15 chars,
    // full name shown on hover via title attr)
    html += '<div class="mx-corner">Angle \\ Persona</div>';
    personasVis.forEach(function (p) {
      var pw = (model.persWin[p] && model.persWin[p].winners) || 0;
      var pTrunc = p.length > 15 ? p.substring(0, 15) + '…' : p;
      html += '<div class="mx-ch" title="' + escAttr(p) + '">' + esc(pTrunc) +
        (pw ? '<span class="mx-ch-win">' + pw + 'W</span>' : '') + '</div>';
    });

    // Body rows
    anglesVis.forEach(function (a) {
      var aw = (model.angleWin[a] && model.angleWin[a].winners) || 0;
      html += '<div class="mx-rh">' + esc(a) + (aw ? '<span class="mx-rh-win">' + aw + 'W</span>' : '') + '</div>';
      personasVis.forEach(function (p) {
        html += renderMatrixCell(a, p, model.cells[a + '||' + p]);
      });
    });

    html += '</div>'; // .mx-table
  }
  html += '</div>'; // .mx-grid-wrap

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
// renderMatrixCell — one grid cell with 3 funnel dots.
// ================================================
function renderMatrixCell(angleName, personaName, cell) {
  var key = angleName + '||' + personaName;
  var stages = ['TOF', 'MOF', 'BOF'];

  var matchesStatus = mxCellMatchesStatus(cell);
  var isSelected   = (_mxSelectedKey === key);
  var dim = !matchesStatus;

  var cls = 'mx-gcell' + (isSelected ? ' selected' : '') + (dim ? ' dim' : '');

  var html = '<div class="' + cls + '" onclick="mxOpenCell(\'' + escJs(angleName) + '\',\'' + escJs(personaName) + '\')" title="' + escAttr(angleName) + ' × ' + escAttr(personaName) + '">';
  html += '<div class="mx-dots">';
  for (var i = 0; i < 3; i++) {
    var fn = stages[i];
    var st = mxFunnelDotState(cell ? cell[fn] : null);
    var dCls = 'mx-dot ' + st;
    if (_mxFunnelFilter !== 'ALL') {
      dCls += (fn === _mxFunnelFilter) ? ' hl' : ' fade';
    }
    html += '<span class="' + dCls + '" title="' + fn + ': ' + (cell && cell[fn].length ? cell[fn].length + ' ad' + (cell[fn].length > 1 ? 's' : '') : 'no ads') + '"></span>';
  }
  html += '</div>';
  html += '<div class="mx-dot-lbl">T &nbsp;M &nbsp;B</div>';
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
