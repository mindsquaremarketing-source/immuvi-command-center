// ============================================================
//  4. RENDER FUNCTIONS
// ============================================================

// Next Tests recommender — gap table shown in the HQ tab.
// FUNNEL_STAGES (['TOF','MOF','BOF']) is already declared globally in js/core/db.js; reused here.
const FUNNEL_FORMAT_SUGGESTIONS = {
  TOF: ['UGC Hook Video', 'Scroll-Stop Static', 'Problem-Aware Reel', 'Curiosity Hook'],
  MOF: ['Comparison Ad', 'Testimonial Carousel', 'Demo/Explainer Video', 'Before & After'],
  BOF: ['Offer + Urgency CTA', 'Retargeting Video', 'Social Proof Bundle', 'Direct Response']
};
const PRIORITY = { WINNER_ADJACENT: 1, WINNING_ELEMENT: 2, COLD: 3 };

function renderAll() {
  renderHQ();
  renderProductProfile();
  renderAngles();
  renderPersonas();
  renderCreatives();
  renderWinners();
  renderActionPlan();
  renderProduction();
  renderMatrix();
  renderInspirations();
  updateTabCounts();
}

// ── 4a. COMMAND HQ ──

function renderHQ() {
  if (!P) return;
  var s = P.s;

  // KPI Strip
  var kpiEl = document.getElementById('kpiStrip');
  kpiEl.innerHTML =
    '<div class="kpi-strip">' +
      '<div class="kpi-item"><div class="kpi-val">' + mono(s.total) + '</div><div class="kpi-lbl">Total Creatives</div></div>' +
      '<div class="kpi-item"><div class="kpi-val kpi-win">' + mono(s.winners) + '</div><div class="kpi-lbl">Winners</div></div>' +
      '<div class="kpi-item"><div class="kpi-val kpi-test">' + mono(s.testing) + '</div><div class="kpi-lbl">Testing</div></div>' +
      '<div class="kpi-item"><div class="kpi-val kpi-ready">' + mono(s.ready) + '</div><div class="kpi-lbl">Ready to Launch</div></div>' +
      '<div class="kpi-item"><div class="kpi-val kpi-untested">' + mono(s.notStarted) + '</div><div class="kpi-lbl">Untested</div></div>' +
      '<div class="kpi-item"><div class="kpi-val kpi-rate">' + mono(s.winRate.toFixed(1) + '%') + '</div><div class="kpi-lbl">Win Rate</div></div>' +
      '<div class="kpi-item"><div class="kpi-val">' + mono(ANGLES.length) + '</div><div class="kpi-lbl">Angles</div></div>' +
      '<div class="kpi-item"><div class="kpi-val">' + mono(PERSONAS.length) + '</div><div class="kpi-lbl">Personas</div></div>' +
    '</div>';

  // Coverage Grid
  var covEl = document.getElementById('covGrid');

  // Angle coverage
  var anglesWithAds = 0;
  for (var i = 0; i < ANGLES.length; i++) {
    if (P.byAngle[ANGLES[i].name] && P.byAngle[ANGLES[i].name].length > 0) anglesWithAds++;
  }
  var angPct = ANGLES.length > 0 ? Math.round(anglesWithAds / ANGLES.length * 100) : 0;

  var angItems = '';
  for (var i = 0; i < ANGLES.length; i++) {
    var count = (P.byAngle[ANGLES[i].name] || []).length;
    var dotCls = count > 0 ? 'dot-active' : 'dot-empty';
    angItems += '<div class="cov-item"><span class="cov-dot ' + dotCls + '"></span>' + esc(ANGLES[i].name) + ' <span class="cov-cnt">' + mono(count) + '</span></div>';
  }

  // Persona coverage
  var persWithAds = 0;
  for (var i = 0; i < PERSONAS.length; i++) {
    if (P.byPersona[PERSONAS[i].name] && P.byPersona[PERSONAS[i].name].length > 0) persWithAds++;
  }
  var persPct = PERSONAS.length > 0 ? Math.round(persWithAds / PERSONAS.length * 100) : 0;

  var persItems = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    var count = (P.byPersona[PERSONAS[i].name] || []).length;
    var dotCls = count > 0 ? 'dot-active' : 'dot-empty';
    persItems += '<div class="cov-item"><span class="cov-dot ' + dotCls + '"></span>' + esc(PERSONAS[i].name) + ' <span class="cov-cnt">' + mono(count) + '</span></div>';
  }

  // Creative Structure coverage
  var csNames = getFieldNames('creativeStructure');
  var csWithAds = 0;
  for (var i = 0; i < csNames.length; i++) {
    if (P.byCreativeStructure[csNames[i]] && P.byCreativeStructure[csNames[i]].length > 0) csWithAds++;
  }
  var csPct = csNames.length > 0 ? Math.round(csWithAds / csNames.length * 100) : 0;

  var csItems = '';
  for (var i = 0; i < csNames.length; i++) {
    var count = (P.byCreativeStructure[csNames[i]] || []).length;
    var dotCls = count > 0 ? 'dot-active' : 'dot-empty';
    csItems += '<div class="cov-item"><span class="cov-dot ' + dotCls + '"></span>' + esc(csNames[i]) + ' <span class="cov-cnt">' + mono(count) + '</span></div>';
  }

  // Hook Type coverage
  var htNames = getFieldNames('hookType');
  var htWithAds = 0;
  for (var i = 0; i < htNames.length; i++) {
    if (P.byHookType[htNames[i]] && P.byHookType[htNames[i]].length > 0) htWithAds++;
  }
  var htPct = htNames.length > 0 ? Math.round(htWithAds / htNames.length * 100) : 0;

  var htItems = '';
  for (var i = 0; i < htNames.length; i++) {
    var count = (P.byHookType[htNames[i]] || []).length;
    var dotCls = count > 0 ? 'dot-active' : 'dot-empty';
    htItems += '<div class="cov-item"><span class="cov-dot ' + dotCls + '"></span>' + esc(htNames[i]) + ' <span class="cov-cnt">' + mono(count) + '</span></div>';
  }

  // Production Style coverage
  var psNames = getFieldNames('productionStyle');
  var psWithAds = 0;
  for (var i = 0; i < psNames.length; i++) {
    if (P.byProductionStyle[psNames[i]] && P.byProductionStyle[psNames[i]].length > 0) psWithAds++;
  }
  var psPct = psNames.length > 0 ? Math.round(psWithAds / psNames.length * 100) : 0;

  var psItems = '';
  for (var i = 0; i < psNames.length; i++) {
    var count = (P.byProductionStyle[psNames[i]] || []).length;
    var dotCls = count > 0 ? 'dot-active' : 'dot-empty';
    psItems += '<div class="cov-item"><span class="cov-dot ' + dotCls + '"></span>' + esc(psNames[i]) + ' <span class="cov-cnt">' + mono(count) + '</span></div>';
  }

  covEl.innerHTML =
    '<div class="cov-card">' +
      '<div class="cov-card-title">Angles</div>' +
      '<div class="cov-bar-wrap"><div class="cov-bar" style="width:' + angPct + '%"></div></div>' +
      '<div class="cov-pct">' + mono(angPct + '%') + ' coverage (' + anglesWithAds + '/' + ANGLES.length + ')</div>' +
      '<div class="cov-list">' + angItems + '</div>' +
    '</div>' +
    '<div class="cov-card">' +
      '<div class="cov-card-title">Personas</div>' +
      '<div class="cov-bar-wrap"><div class="cov-bar" style="width:' + persPct + '%"></div></div>' +
      '<div class="cov-pct">' + mono(persPct + '%') + ' coverage (' + persWithAds + '/' + PERSONAS.length + ')</div>' +
      '<div class="cov-list">' + persItems + '</div>' +
    '</div>' +
    '<div class="cov-card">' +
      '<div class="cov-card-title">Creative Structure</div>' +
      '<div class="cov-bar-wrap"><div class="cov-bar" style="width:' + csPct + '%"></div></div>' +
      '<div class="cov-pct">' + mono(csPct + '%') + ' coverage (' + csWithAds + '/' + csNames.length + ')</div>' +
      '<div class="cov-list">' + csItems + '</div>' +
    '</div>' +
    '<div class="cov-card">' +
      '<div class="cov-card-title">Hook Type</div>' +
      '<div class="cov-bar-wrap"><div class="cov-bar" style="width:' + htPct + '%"></div></div>' +
      '<div class="cov-pct">' + mono(htPct + '%') + ' coverage (' + htWithAds + '/' + htNames.length + ')</div>' +
      '<div class="cov-list">' + htItems + '</div>' +
    '</div>' +
    '<div class="cov-card">' +
      '<div class="cov-card-title">Production Style</div>' +
      '<div class="cov-bar-wrap"><div class="cov-bar" style="width:' + psPct + '%"></div></div>' +
      '<div class="cov-pct">' + mono(psPct + '%') + ' coverage (' + psWithAds + '/' + psNames.length + ')</div>' +
      '<div class="cov-list">' + psItems + '</div>' +
    '</div>';

  // Gap Box — Next Tests recommender (renderGapBox defined below)
  renderGapBox(ADS, ANGLES, PERSONAS);

  renderProductProfile();
}

// ── 4a-1. NEXT TESTS (GAP RECOMMENDER) ──

function renderGapBox(ads, angles, personas) {
  // Accepts params; falls back to the hq.js-wide globals when called with no args.
  ads      = ads      || (typeof ADS      !== 'undefined' ? ADS      : []);
  angles   = angles   || (typeof ANGLES   !== 'undefined' ? ANGLES   : []);
  personas = personas || (typeof PERSONAS !== 'undefined' ? PERSONAS : []);

  var gapEl = document.getElementById('gapBox');
  if (!gapEl) return;

  // Build a matrix keyed by "angle::persona::funnel".
  // Unique angle/persona values come from the ads array per spec (not the taxonomy tables),
  // so empty/unused angles/personas don't pollute the gap list.
  var matrix = {};
  var allAngles = {};
  var allPersonas = {};
  var winningAngles = {};
  var winningPersonas = {};
  for (var i = 0; i < ads.length; i++) {
    var ad = ads[i];
    if (!ad || !ad.angle || !ad.persona) continue;
    var fs = (ad.funnelStage || '').toString().trim().toUpperCase();
    if (!fs) continue; // skip ads without a funnel stage — can't bucket them
    var ang = ad.angle.trim();
    var per = ad.persona.trim();
    allAngles[ang] = true;
    allPersonas[per] = true;
    var cellKey = ang + '::' + per + '::' + fs;
    if (!matrix[cellKey]) matrix[cellKey] = { hasWinner: false, count: 0 };
    matrix[cellKey].count++;
    if (ad.status === 'Winner') {
      matrix[cellKey].hasWinner = true;
      winningAngles[ang] = true;
      winningPersonas[per] = true;
    }
  }

  var angleList   = Object.keys(allAngles).sort();
  var personaList = Object.keys(allPersonas).sort();
  var totalCells  = angleList.length * personaList.length * FUNNEL_STAGES.length;
  var coveredCells = Object.keys(matrix).length;
  var coveragePct = totalCells > 0 ? Math.round(coveredCells / totalCells * 100) : 0;

  // Rank every missing cell
  var gaps = [];
  for (var ai = 0; ai < angleList.length; ai++) {
    for (var pi = 0; pi < personaList.length; pi++) {
      for (var fi = 0; fi < FUNNEL_STAGES.length; fi++) {
        var angK = angleList[ai];
        var perK = personaList[pi];
        var funK = FUNNEL_STAGES[fi];
        if (matrix[angK + '::' + perK + '::' + funK]) continue;

        // Is any SIBLING funnel stage of this same angle×persona already a winner?
        var siblingWinner = false;
        for (var sfi = 0; sfi < FUNNEL_STAGES.length; sfi++) {
          if (sfi === fi) continue;
          var sibKey = angK + '::' + perK + '::' + FUNNEL_STAGES[sfi];
          if (matrix[sibKey] && matrix[sibKey].hasWinner) { siblingWinner = true; break; }
        }

        var priority;
        if (siblingWinner)                                             priority = PRIORITY.WINNER_ADJACENT;
        else if (winningAngles[angK] || winningPersonas[perK])         priority = PRIORITY.WINNING_ELEMENT;
        else                                                           priority = PRIORITY.COLD;

        // Deterministic format suggestion: same angle+persona+funnel always picks the same format
        var pool = FUNNEL_FORMAT_SUGGESTIONS[funK] || [];
        var suggestedFormat = pool.length > 0 ? pool[hashStr(angK + perK) % pool.length] : '';

        gaps.push({
          angle:   angK,
          persona: perK,
          funnel:  funK,
          format:  suggestedFormat,
          priority: priority,
          siblingWinner: siblingWinner
        });
      }
    }
  }

  // Sort: priority ASC, then TOF→MOF→BOF, then angle alpha
  var funnelOrder = { TOF: 0, MOF: 1, BOF: 2 };
  gaps.sort(function(a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    var fo = funnelOrder[a.funnel] - funnelOrder[b.funnel];
    if (fo !== 0) return fo;
    return a.angle.localeCompare(b.angle);
  });

  // Meta counts for the chip row
  var adjacent = 0, proven = 0, cold = 0;
  for (var gi = 0; gi < gaps.length; gi++) {
    if      (gaps[gi].priority === PRIORITY.WINNER_ADJACENT) adjacent++;
    else if (gaps[gi].priority === PRIORITY.WINNING_ELEMENT) proven++;
    else                                                     cold++;
  }

  // ── Build HTML ──
  var html = '<div class="next-tests-wrapper">';
  html += renderGapBoxStyle();

  html +=
    '<div class="nt-header">' +
      '<div class="nt-title-row">' +
        '<h3 class="nt-title">Next Tests</h3>' +
        '<span class="nt-gap-badge">' + mono(gaps.length) + ' gap' + (gaps.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="nt-meta-row">' +
        '<span class="nt-meta-chip"><span class="nt-meta-icon">⚡</span>' + mono(adjacent) + ' winner-adjacent</span>' +
        '<span class="nt-meta-chip"><span class="nt-meta-icon">✨</span>' + mono(proven) + ' proven</span>' +
        '<span class="nt-meta-chip"><span class="nt-meta-icon">❄️</span>' + mono(cold) + ' cold</span>' +
      '</div>' +
      '<div class="nt-coverage">' +
        '<div class="nt-coverage-bar"><div class="nt-coverage-fill" style="width:' + coveragePct + '%"></div></div>' +
        '<div class="nt-coverage-text">' + mono(coveragePct + '%') + ' coverage (' + coveredCells + '/' + totalCells + ')</div>' +
      '</div>' +
    '</div>';

  html +=
    '<div class="nt-filters">' +
      '<button type="button" class="nt-chip active" data-filter="all">All</button>' +
      '<button type="button" class="nt-chip" data-filter="TOF">TOF</button>' +
      '<button type="button" class="nt-chip" data-filter="MOF">MOF</button>' +
      '<button type="button" class="nt-chip" data-filter="BOF">BOF</button>' +
      '<button type="button" class="nt-chip" data-filter="winner-adjacent">⚡ Winner-Adjacent Only</button>' +
    '</div>';

  if (gaps.length === 0) {
    html += '<div class="nt-empty">All angle × persona × funnel cells are covered. Great coverage!</div>';
  } else {
    html +=
      '<div class="nt-table-wrap">' +
        '<table class="nt-table"><thead><tr>' +
          '<th>Priority</th><th>Angle</th><th>Persona</th><th>Funnel</th>' +
          '<th>Suggested Format</th><th>Why</th><th></th>' +
        '</tr></thead><tbody>';

    for (var ri = 0; ri < gaps.length; ri++) {
      var row = gaps[ri];
      var pLabel, pCls, whyText;
      if (row.priority === PRIORITY.WINNER_ADJACENT) {
        pLabel = '⚡ Winner-Adjacent'; pCls = 'nt-pri-adj';
        whyText = 'Sibling funnel stage already won for this angle × persona.';
      } else if (row.priority === PRIORITY.WINNING_ELEMENT) {
        pLabel = '✨ Winning Element'; pCls = 'nt-pri-prov';
        whyText = 'Angle or persona has won in another combination.';
      } else {
        pLabel = '❄️ Cold'; pCls = 'nt-pri-cold';
        whyText = 'No prior winner context — fresh exploration.';
      }
      html +=
        '<tr data-funnel="' + row.funnel + '" data-priority="' + row.priority + '">' +
          '<td><span class="nt-pri-tag ' + pCls + '">' + pLabel + '</span></td>' +
          '<td>' + esc(row.angle) + '</td>' +
          '<td>' + esc(row.persona) + '</td>' +
          '<td><span class="nt-funnel-tag nt-funnel-' + row.funnel + '">' + row.funnel + '</span></td>' +
          '<td>' + esc(row.format) + '</td>' +
          '<td class="nt-why">' + esc(whyText) + '</td>' +
          '<td><button type="button" class="nt-create-btn" data-gap-idx="' + ri + '">Create Task</button></td>' +
        '</tr>';
    }

    html += '</tbody></table></div>';
  }

  html += '</div>'; // .next-tests-wrapper

  gapEl.innerHTML = html;

  // Wire filter chips
  var chips = gapEl.querySelectorAll('.nt-chip');
  for (var ci = 0; ci < chips.length; ci++) {
    chips[ci].addEventListener('click', function(e) {
      var filter = e.currentTarget.getAttribute('data-filter');
      for (var k = 0; k < chips.length; k++) chips[k].classList.remove('active');
      e.currentTarget.classList.add('active');
      var rows = gapEl.querySelectorAll('.nt-table tbody tr');
      for (var r = 0; r < rows.length; r++) {
        var show = true;
        if (filter === 'winner-adjacent') show = rows[r].getAttribute('data-priority') === '1';
        else if (filter !== 'all')        show = rows[r].getAttribute('data-funnel')   === filter;
        if (show) rows[r].classList.remove('nt-row-hidden');
        else      rows[r].classList.add('nt-row-hidden');
      }
    });
  }

  // Wire Create Task buttons
  var createBtns = gapEl.querySelectorAll('.nt-create-btn');
  for (var bi = 0; bi < createBtns.length; bi++) {
    createBtns[bi].addEventListener('click', function(e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      var gapIdx = parseInt(btn.getAttribute('data-gap-idx'), 10);
      var gap = gaps[gapIdx];
      if (gap) createGapTaskFromRow(gap, btn);
    });
  }
}

function createGapTaskFromRow(gap, btn) {
  btn.disabled = true;
  btn.classList.remove('nt-success', 'nt-failed');
  btn.classList.add('nt-creating');
  btn.textContent = 'Creating…';

  if (typeof MANUAL_ACTIONS === 'undefined' || typeof createClickUpTaskFromAction !== 'function') {
    console.error('[renderGapBox] MANUAL_ACTIONS or createClickUpTaskFromAction is not available');
    btn.classList.remove('nt-creating');
    btn.classList.add('nt-failed');
    btn.textContent = '✗ Failed';
    btn.disabled = false;
    return;
  }

  var priorityStr = gap.priority === PRIORITY.WINNER_ADJACENT ? 'urgent' :
                    gap.priority === PRIORITY.WINNING_ELEMENT ? 'high' : 'normal';
  // [GAP] prefix is in-app only — the ClickUp task name is built by the standardized
  // builder at bulk.js:238, which will produce "angle - ICP: persona - funnel - format".
  var title = '[GAP][' + gap.funnel + '] ' + gap.angle + ' × ' + gap.persona + ' — ' + gap.format;
  var contextLabel = gap.priority === PRIORITY.WINNER_ADJACENT ? 'winner-adjacent' :
                     gap.priority === PRIORITY.WINNING_ELEMENT ? 'proven element' : 'cold exploration';
  var reason =
    'Gap Test: ' + gap.angle + ' × ' + gap.persona + ' · ' + gap.funnel + '\n' +
    'Suggested format: ' + gap.format + '\n' +
    'Priority: ' + priorityStr + ' (' + contextLabel + ')\n' +
    (gap.siblingWinner
      ? 'Sibling funnel stage already won — high-confidence adjacent test.'
      : 'Auto-suggested by Next Tests recommender.');

  var newAction = {
    id: 'manual-' + Date.now(),
    priority: priorityStr,
    title: title,
    reason: reason,
    tag: 'next-tests-auto',
    angle: gap.angle,
    persona: gap.persona,
    format: gap.format,
    funnelStage: gap.funnel,
    dueDate: typeof todayISO === 'function' ? todayISO() : new Date().toISOString().split('T')[0],
    description: '',
    adId: null,
    adLink: '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: null,
    sourceAngle: gap.angle,
    sourcePersona: gap.persona
  };
  MANUAL_ACTIONS.push(newAction);
  if (typeof genActions === 'function')           genActions();
  if (typeof rebuildProdFromManual === 'function') rebuildProdFromManual();
  if (typeof renderActionPlan === 'function')     renderActionPlan();
  if (typeof renderProduction === 'function')     renderProduction();
  if (typeof saveState === 'function')            saveState();

  createClickUpTaskFromAction(newAction.id, function(ok) {
    btn.classList.remove('nt-creating');
    if (ok) {
      btn.classList.add('nt-success');
      btn.textContent = '✓ Created';
      // stay disabled
    } else {
      btn.classList.add('nt-failed');
      btn.textContent = '✗ Failed';
      btn.disabled = false;
      console.error('[renderGapBox] createClickUpTaskFromAction reported failure for', newAction.id);
    }
  });
}

function renderGapBoxStyle() {
  return (
    '<style>' +
    '.next-tests-wrapper{font:inherit;color:var(--text-primary);display:flex;flex-direction:column;}' +
    '.next-tests-wrapper .nt-header{display:flex;flex-direction:column;gap:10px;padding:12px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px 8px 0 0;}' +
    '.next-tests-wrapper .nt-title-row{display:flex;align-items:center;gap:10px;}' +
    '.next-tests-wrapper .nt-title{margin:0;font-size:15px;font-weight:600;color:var(--text-primary);}' +
    '.next-tests-wrapper .nt-gap-badge{padding:2px 8px;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:600;}' +
    '.next-tests-wrapper .nt-meta-row{display:flex;flex-wrap:wrap;gap:8px;}' +
    '.next-tests-wrapper .nt-meta-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;background:rgba(128,128,128,0.08);border:1px solid var(--border);font-size:11px;color:var(--text-secondary);}' +
    '.next-tests-wrapper .nt-meta-icon{font-size:12px;}' +
    '.next-tests-wrapper .nt-coverage{display:flex;align-items:center;gap:10px;}' +
    '.next-tests-wrapper .nt-coverage-bar{flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;}' +
    '.next-tests-wrapper .nt-coverage-fill{height:100%;background:var(--accent);transition:width 0.3s ease;}' +
    '.next-tests-wrapper .nt-coverage-text{font-size:11px;color:var(--text-muted);white-space:nowrap;}' +
    '.next-tests-wrapper .nt-filters{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;background:var(--bg-card);border-left:1px solid var(--border);border-right:1px solid var(--border);}' +
    '.next-tests-wrapper .nt-chip{padding:4px 12px;border-radius:14px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:11px;cursor:pointer;transition:all 0.15s ease;}' +
    '.next-tests-wrapper .nt-chip:hover{background:rgba(128,128,128,0.08);color:var(--text-primary);}' +
    '.next-tests-wrapper .nt-chip.active{background:var(--accent);border-color:var(--accent);color:#fff;}' +
    '.next-tests-wrapper .nt-table-wrap{max-height:420px;overflow:auto;border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;background:var(--bg-card);}' +
    '.next-tests-wrapper .nt-table{width:100%;border-collapse:collapse;font-size:12px;}' +
    '.next-tests-wrapper .nt-table thead th{position:sticky;top:0;background:var(--bg-card);padding:8px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);z-index:1;}' +
    '.next-tests-wrapper .nt-table tbody td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text-primary);}' +
    '.next-tests-wrapper .nt-table tbody tr:last-child td{border-bottom:none;}' +
    '.next-tests-wrapper .nt-table tbody tr:hover{background:rgba(128,128,128,0.04);}' +
    '.next-tests-wrapper .nt-row-hidden{display:none;}' +
    '.next-tests-wrapper .nt-pri-tag{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap;}' +
    '.next-tests-wrapper .nt-pri-adj{background:rgba(255,180,0,0.18);color:#ffb400;border:1px solid rgba(255,180,0,0.35);}' +
    '.next-tests-wrapper .nt-pri-prov{background:rgba(120,80,255,0.15);color:#a080ff;border:1px solid rgba(120,80,255,0.3);}' +
    '.next-tests-wrapper .nt-pri-cold{background:rgba(120,160,200,0.12);color:var(--text-muted);border:1px solid var(--border);}' +
    '.next-tests-wrapper .nt-funnel-tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;}' +
    '.next-tests-wrapper .nt-funnel-TOF{background:rgba(0,180,120,0.15);color:#00b478;}' +
    '.next-tests-wrapper .nt-funnel-MOF{background:rgba(0,140,220,0.15);color:#00a0e0;}' +
    '.next-tests-wrapper .nt-funnel-BOF{background:rgba(200,80,120,0.15);color:#c85078;}' +
    '.next-tests-wrapper .nt-why{color:var(--text-muted);font-size:11px;max-width:260px;}' +
    '.next-tests-wrapper .nt-create-btn{padding:4px 10px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:11px;cursor:pointer;white-space:nowrap;transition:all 0.15s ease;}' +
    '.next-tests-wrapper .nt-create-btn:hover:not(:disabled){background:var(--accent);border-color:var(--accent);color:#fff;}' +
    '.next-tests-wrapper .nt-create-btn:disabled{cursor:default;}' +
    '.next-tests-wrapper .nt-create-btn.nt-creating{opacity:0.6;}' +
    '.next-tests-wrapper .nt-create-btn.nt-success{background:rgba(0,180,120,0.18);border-color:rgba(0,180,120,0.35);color:#00b478;}' +
    '.next-tests-wrapper .nt-create-btn.nt-failed{background:rgba(220,60,60,0.15);border-color:rgba(220,60,60,0.35);color:#dc3c3c;}' +
    '.next-tests-wrapper .nt-empty{padding:30px 14px;text-align:center;color:var(--text-muted);background:var(--bg-card);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;font-size:13px;}' +
    '</style>'
  );
}

// Deterministic 32-bit string hash — used to pick a stable suggested format per angle+persona.
function hashStr(s) {
  var h = 0;
  s = String(s || '');
  for (var i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

