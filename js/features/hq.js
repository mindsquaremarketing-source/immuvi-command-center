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

// Module-level cache: last computed gap rows (with competitor signal) — populated
// by renderGapBox after sort, consumed by renderCompetitorIntel which runs later
// in the same renderHQ pass and needs the same scored data without recomputing it.
var _lastGaps = [];

// Token-set Jaccard with ≥4-char filter — used by both the gap table's competitor
// signal and the Competitor Intel panel to align inspiration rows to taxonomy
// entries when classifier output isn't a verbatim match.
function wordOverlap(a, b) {
  var wa = (a||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>=4;});
  var wb = (b||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>=4;});
  if (!wa.length || !wb.length) return 0;
  var inter = 0;
  for (var i = 0; i < wa.length; i++)
    for (var j = 0; j < wb.length; j++)
      if (wa[i] === wb[j]) { inter++; break; }
  return inter / (wa.length + wb.length - inter);
}

// Winner Variations — 5 element-isolation tests spawned from each winner ad.
// Tier (Massive / Good / Mild) is read from parent.winnerTier if present;
// falls back to 'normal' priority when absent (no tier system yet in WINNERS).
var WINNER_VARIATION_TYPES = [
  { key: 'Visual Hook', desc: 'Test a new opening visual while keeping the same hook line and body' },
  { key: 'Hook Line',   desc: 'Test a new spoken/text hook while keeping the same visual and body' },
  { key: 'Body',        desc: 'Test a new body sequence while keeping the same hook' },
  { key: 'CTA',         desc: 'Test a new call-to-action end card while keeping the hook and body' },
  { key: 'Music',       desc: 'Test a new background track while keeping all other elements' }
];

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

  // Scale Winners — explicit MOF/BOF suggestions per winner ad. Runs BEFORE
  // renderGapBox so the panel sits visually above the (broader) gap table.
  renderScaleWinners(WINNERS);

  // Gap Box — Next Tests recommender (renderGapBox defined below)
  renderGapBox(ADS, ANGLES, PERSONAS);

  // Winner Variations — 5-element isolation tasks per winner ad
  renderWinnerVariations(WINNERS);

  // Competitor Intel — uses _lastGaps populated by renderGapBox above
  renderCompetitorIntel(typeof INSPIRATIONS !== 'undefined' ? INSPIRATIONS : []);

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

  // ── Competitor signal: score each gap against classified inspirations ──
  // After DB.listInspirations spreads the `data` jsonb blob onto the row, fields
  // sit at the top level — but legacy rows / partial spreads may still nest them
  // under .data, so read both.
  var inspos = (typeof INSPIRATIONS !== 'undefined') ? INSPIRATIONS : [];
  function _insGet(ins, key) {
    if (!ins) return '';
    if (ins[key] != null && ins[key] !== '') return ins[key];
    if (ins.data && ins.data[key] != null && ins.data[key] !== '') return ins.data[key];
    return '';
  }
  for (var qi = 0; qi < gaps.length; qi++) {
    var gp = gaps[qi];
    var brands = {};
    var formats = {};
    var matchCount = 0;
    for (var ii = 0; ii < inspos.length; ii++) {
      var ins = inspos[ii];
      var insAng = _insGet(ins, 'angle');
      var insFun = (_insGet(ins, 'funnelStage') || '').toString().toUpperCase();
      if (!insAng || !insFun) continue;
      if (insFun !== gp.funnel) continue;
      if (wordOverlap(insAng, gp.angle) < 0.6) continue;
      matchCount++;
      var br = _insGet(ins, 'brand');
      if (br) brands[br] = (brands[br] || 0) + 1;
      var fmt = _insGet(ins, 'creativeStructure');
      if (fmt) formats[fmt] = (formats[fmt] || 0) + 1;
    }
    gp.competitorCount = matchCount;
    gp.competitorBrands = Object.keys(brands).sort(function(a, b){ return brands[b] - brands[a]; }).slice(0, 5);
    gp.competitorFormats = Object.keys(formats);

    // Smarter format suggestion: prefer the most-frequent competitor structure
    // over the deterministic hash-pool default when we have any signal.
    if (gp.competitorFormats.length > 0) {
      var _topFmt = '', _maxCount = 0;
      for (var fk in formats) {
        if (Object.prototype.hasOwnProperty.call(formats, fk) && formats[fk] > _maxCount) {
          _maxCount = formats[fk]; _topFmt = fk;
        }
      }
      if (_topFmt) gp.format = _topFmt;
    }
  }

  // Cache for renderCompetitorIntel — must be set BEFORE any early returns below
  _lastGaps = gaps;

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
          '<th>Suggested Format</th><th>Why</th><th>Competitor Signal</th><th></th>' +
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
          (function(){
            var c = row.competitorCount || 0;
            if (c > 0) {
              var brandTitle = (row.competitorBrands || []).join(', ');
              return '<td><span class="nt-comp-badge" title="' + esc(brandTitle) + '">' + esc(c + ' competitor ad' + (c===1?'':'s')) + '</span></td>';
            }
            return '<td><span class="nt-comp-empty">—</span></td>';
          })() +
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
  // All rules scoped under .next-tests-wrapper. Uses the app's real design tokens
  // (--card, --b, --bh, --t1/t2/t3, --test, --holo, --r, --rs) plus the exact
  // per-pill hex palette spec'd for Next Tests.
  return (
    '<style>' +

    /* ── Wrapper card — matches .kpi-strip / .cov-card pattern ── */
    '.next-tests-wrapper{' +
      'background:var(--card);' +
      'border:1px solid var(--b);' +
      'border-radius:var(--r);' +
      'box-shadow:0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);' +
      'overflow:hidden;' +
      'margin-top:16px;' +
      'color:var(--t1);' +
      'font-family:inherit;' +
      'position:relative;' +
    '}' +
    /* holo top accent — matches .cov-card and other primary cards */
    '.next-tests-wrapper::before{' +
      'content:"";' +
      'position:absolute;' +
      'top:0;left:0;right:0;' +
      'height:2px;' +
      'background:var(--holo);' +
      'pointer-events:none;' +
      'z-index:2;' +
    '}' +

    /* ── Header: title + count + meta chips + coverage bar ── */
    '.next-tests-wrapper .nt-header{' +
      'display:flex;flex-direction:column;gap:10px;' +
      'padding:16px 18px 14px;' +
      'background:transparent;border:none;' +
    '}' +
    '.next-tests-wrapper .nt-title-row{display:flex;align-items:center;gap:10px;}' +
    '.next-tests-wrapper .nt-title{' +
      'margin:0;' +
      'font-size:0.85rem;font-weight:600;' +
      'color:var(--t1);' +
    '}' +
    '.next-tests-wrapper .nt-gap-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 9px;border-radius:10px;' +
      'background:var(--test);color:#fff;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +

    /* Meta chips — order is fixed in render (adjacent / proven / cold). Colors apply by position. */
    '.next-tests-wrapper .nt-meta-row{display:flex;flex-wrap:wrap;gap:6px;}' +
    '.next-tests-wrapper .nt-meta-chip{' +
      'display:inline-flex;align-items:center;gap:5px;' +
      'padding:3px 10px;border-radius:10px;' +
      'font-size:0.7rem;font-weight:500;' +
    '}' +
    '.next-tests-wrapper .nt-meta-chip:nth-child(1){background:#fffbeb;color:#b45309;}' +
    '.next-tests-wrapper .nt-meta-chip:nth-child(2){background:#f5f3ff;color:#6d28d9;}' +
    '.next-tests-wrapper .nt-meta-chip:nth-child(3){background:#f1f5f9;color:#64748b;}' +
    '.next-tests-wrapper .nt-meta-icon{font-size:0.72rem;line-height:1;}' +

    /* Coverage bar — full-width, 6px, indigo fill */
    '.next-tests-wrapper .nt-coverage{display:flex;align-items:center;gap:10px;}' +
    '.next-tests-wrapper .nt-coverage-bar{' +
      'flex:1;height:6px;' +
      'background:#e2e8f0;border-radius:3px;overflow:hidden;' +
    '}' +
    '.next-tests-wrapper .nt-coverage-fill{' +
      'height:100%;background:var(--test);' +
      'transition:width 0.3s ease;' +
    '}' +
    '.next-tests-wrapper .nt-coverage-text{' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.7rem;color:var(--t2);white-space:nowrap;' +
    '}' +

    /* ── Filter chip row ── */
    '.next-tests-wrapper .nt-filters{' +
      'display:flex;flex-wrap:wrap;gap:6px;' +
      'padding:0 18px 12px;' +
      'background:transparent;border:none;' +
    '}' +
    '.next-tests-wrapper .nt-chip{' +
      'padding:4px 12px;border-radius:14px;' +
      'border:none;' +
      'background:#f1f5f9;color:#64748b;' +
      'font-family:inherit;' +
      'font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;' +
      'transition:background .15s, color .15s, transform .1s;' +
    '}' +
    '.next-tests-wrapper .nt-chip:hover{background:#e2e8f0;color:var(--t1);}' +
    '.next-tests-wrapper .nt-chip:active{transform:scale(0.97);}' +
    '.next-tests-wrapper .nt-chip.active{background:var(--test);color:#fff;}' +
    '.next-tests-wrapper .nt-chip.active:hover{background:#4338ca;}' +

    /* ── Table — no outer border; wrapper handles enclosure ── */
    '.next-tests-wrapper .nt-table-wrap{' +
      'max-height:480px;overflow:auto;' +
      'background:transparent;' +
      'border:none;border-radius:0;' +
    '}' +
    '.next-tests-wrapper .nt-table{' +
      'width:100%;border-collapse:collapse;' +
      'font-size:0.75rem;' +
    '}' +
    '.next-tests-wrapper .nt-table thead th{' +
      'position:sticky;top:0;' +
      'background:var(--card);' +
      'padding:10px 14px;' +
      'text-align:left;' +
      'font-size:0.65rem;font-weight:500;' +
      'text-transform:uppercase;letter-spacing:0.06em;' +
      'color:#94a3b8;' +
      'border-bottom:1px solid #e2e8f0;' +
      'white-space:nowrap;' +
      'z-index:1;' +
    '}' +
    '.next-tests-wrapper .nt-table tbody td{' +
      'padding:10px 14px;' +
      'border-bottom:1px solid #f1f5f9;' +
      'vertical-align:middle;' +
      'color:var(--t1);' +
    '}' +
    '.next-tests-wrapper .nt-table tbody tr:last-child td{border-bottom:none;}' +
    '.next-tests-wrapper .nt-table tbody tr:hover td{background:#f8fafc;}' +
    '.next-tests-wrapper .nt-row-hidden{display:none;}' +

    /* ── Priority pills ── */
    '.next-tests-wrapper .nt-pri-tag{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'font-size:0.65rem;font-weight:600;' +
      'letter-spacing:0.01em;white-space:nowrap;' +
    '}' +
    '.next-tests-wrapper .nt-pri-adj{background:#fef3c7;color:#92400e;}' +
    '.next-tests-wrapper .nt-pri-prov{background:#ede9fe;color:#5b21b6;}' +
    '.next-tests-wrapper .nt-pri-cold{background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0;}' +

    /* ── Funnel pills (soft palette per spec) ── */
    '.next-tests-wrapper .nt-funnel-tag{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 7px;border-radius:4px;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.next-tests-wrapper .nt-funnel-TOF{background:#dcfce7;color:#15803d;}' +
    '.next-tests-wrapper .nt-funnel-MOF{background:#dbeafe;color:#1d4ed8;}' +
    '.next-tests-wrapper .nt-funnel-BOF{background:#fce7f3;color:#be185d;}' +

    /* ── Why column ── */
    '.next-tests-wrapper .nt-why{' +
      'color:var(--t2);' +
      'font-size:0.72rem;line-height:1.45;' +
      'max-width:280px;' +
    '}' +

    /* ── Create Task button — outlined → indigo on hover ── */
    '.next-tests-wrapper .nt-create-btn{' +
      'padding:5px 12px;border-radius:6px;' +
      'border:1px solid #e2e8f0;' +
      'background:#fff;color:#64748b;' +
      'font-family:inherit;' +
      'font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;white-space:nowrap;' +
      'transition:background .15s, border-color .15s, color .15s, transform .1s;' +
    '}' +
    '.next-tests-wrapper .nt-create-btn:hover:not(:disabled){' +
      'background:var(--test);border-color:var(--test);color:#fff;' +
    '}' +
    '.next-tests-wrapper .nt-create-btn:active:not(:disabled){transform:scale(0.97);}' +
    '.next-tests-wrapper .nt-create-btn:disabled{cursor:default;}' +
    '.next-tests-wrapper .nt-create-btn.nt-creating{' +
      'background:#f1f5f9;border-color:#e2e8f0;color:#64748b;opacity:0.7;' +
    '}' +
    '.next-tests-wrapper .nt-create-btn.nt-success{' +
      'background:#dcfce7;border-color:#bbf7d0;color:#15803d;' +
    '}' +
    '.next-tests-wrapper .nt-create-btn.nt-failed{' +
      'background:#fee2e2;border-color:#fecaca;color:#dc2626;' +
    '}' +

    /* ── Empty state ── */
    '.next-tests-wrapper .nt-empty{' +
      'padding:40px 20px;text-align:center;' +
      'color:var(--t3);' +
      'font-size:0.82rem;' +
      'background:transparent;border:none;border-radius:0;' +
    '}' +

    /* ── Competitor signal badge (teal pill) ── */
    '.next-tests-wrapper .nt-comp-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'background:#f0fdfa;color:#0d9488;' +
      'font-size:11px;font-weight:600;letter-spacing:0.01em;white-space:nowrap;' +
    '}' +
    '.next-tests-wrapper .nt-comp-empty{' +
      'color:var(--t3);font-size:0.72rem;' +
    '}' +

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

// ── 4a-1c. SCALE WINNERS ──
// Per the product spec: "We got the winner ad of a funnel supposed TOF, so our
// tool analyzes it & tells us to use the angle, persona for MOF, BOF ads."
// The Gap Analysis table already ranks these as winner-adjacent at PRIORITY 1,
// but burying them in 8+ rows of generic gaps loses the "scale this proven
// angle×persona to other funnel stages" intent. This panel surfaces it directly.

function renderScaleWinners(winners) {
  winners = winners || (typeof WINNERS !== 'undefined' ? WINNERS : []);
  var el = document.getElementById('scaleWinnersBox');
  if (!el) return;

  // Build a set of "angle::persona::funnel" keys present in ADS for "tested?"
  // checks. Any ad in the cell counts — its status is irrelevant; what matters
  // is that we already have a creative slated for that combination.
  var adsArr = (typeof ADS !== 'undefined' && Array.isArray(ADS)) ? ADS : [];
  var testedCells = {};
  for (var ai = 0; ai < adsArr.length; ai++) {
    var ad = adsArr[ai];
    if (!ad || !ad.angle || !ad.persona || !ad.funnelStage) continue;
    var key = ad.angle.trim() + '::' + ad.persona.trim() + '::' + ad.funnelStage.trim().toUpperCase();
    testedCells[key] = true;
  }

  // For each winner, compute which OTHER funnel stages are still untested.
  var cards = [];
  var totalUntested = 0;
  for (var wi = 0; wi < winners.length; wi++) {
    var w = winners[wi];
    if (!w || !w.parent) continue;
    var p = w.parent;
    var winFunnel = (p.funnelStage || '').toString().trim().toUpperCase();
    var ang = (p.angle || '').trim();
    var per = (p.persona || '').trim();
    if (!winFunnel || !ang || !per) continue;

    var untested = [];
    for (var fi = 0; fi < FUNNEL_STAGES.length; fi++) {
      var fs = FUNNEL_STAGES[fi];
      if (fs === winFunnel) continue;
      var ck = ang + '::' + per + '::' + fs;
      if (!testedCells[ck]) untested.push(fs);
    }
    if (untested.length === 0) continue; // fully scaled — skip

    totalUntested += untested.length;
    cards.push({ winner: w, winFunnel: winFunnel, angle: ang, persona: per, untested: untested });
  }

  // ── Build HTML ──
  var html = '<div class="scale-winners-wrapper">';
  html += renderScaleWinnersStyle();

  html +=
    '<div class="sw-header">' +
      '<h3 class="sw-title">Scale Winners</h3>' +
      '<span class="sw-count-badge">' + mono(totalUntested) + ' untested funnel' + (totalUntested === 1 ? '' : 's') + '</span>' +
    '</div>';

  // Empty state — distinguish "no winners exist" from "all winners are scaled".
  var anyWinners = false;
  for (var qi = 0; qi < winners.length; qi++) {
    if (winners[qi] && winners[qi].parent) { anyWinners = true; break; }
  }
  if (!anyWinners) {
    html += '<div class="sw-empty">No winner ads yet — once an ad reaches Winner status, scale suggestions for the other funnel stages will appear here.</div>';
    html += '</div>';
    el.innerHTML = html;
    return;
  }
  if (cards.length === 0) {
    html += '<div class="sw-empty">🎯 All winners are fully scaled across TOF/MOF/BOF — great work!</div>';
    html += '</div>';
    el.innerHTML = html;
    return;
  }

  // ── One card per winner with untested adjacent funnels ──
  for (var ci = 0; ci < cards.length; ci++) {
    var c = cards[ci];
    var p2 = c.winner.parent;
    var tier = (p2.winnerTier || '').trim();
    var tierCls = tier === 'Massive' ? 'sw-tier-massive' :
                  tier === 'Good'    ? 'sw-tier-good' :
                  tier === 'Mild'    ? 'sw-tier-mild' : '';
    var urgencyCls   = c.untested.length === 2 ? 'sw-urg-high' : 'sw-urg-med';
    var urgencyLabel = c.untested.length === 2 ? 'High Urgency' : 'Medium Urgency';

    html += '<div class="sw-card ' + urgencyCls + '" data-winner-id="' + esc(p2.id) + '">';

    // Card head — title + winning funnel badge + tier + urgency
    html += '<div class="sw-card-head">';
    html += '<div class="sw-card-title">' + esc(p2.formatName || p2.id) + '</div>';
    html += '<span class="sw-funnel-tag sw-funnel-' + c.winFunnel + '">' + esc(c.winFunnel) + ' Winner</span>';
    if (tierCls) html += '<span class="sw-tier-badge ' + tierCls + '">' + esc(tier) + '</span>';
    html += '<span class="sw-urgency-badge ' + urgencyCls + '">' + esc(urgencyLabel) + '</span>';
    html += '</div>';

    // Meta tags
    html += '<div class="sw-meta-row">';
    html += '<span class="sw-meta">Angle: <strong>' + esc(c.angle) + '</strong></span>';
    html += '<span class="sw-meta">Persona: <strong>' + esc(c.persona) + '</strong></span>';
    html += '</div>';

    // Suggestions header
    html += '<div class="sw-section-title">Next Funnel Steps</div>';

    // One row per untested adjacent funnel
    html += '<div class="sw-rows">';
    for (var ui = 0; ui < c.untested.length; ui++) {
      var fnl  = c.untested[ui];
      var pool = FUNNEL_FORMAT_SUGGESTIONS[fnl] || [];
      var suggested = pool.length > 0 ? pool[hashStr(c.angle + c.persona) % pool.length] : '';
      html += '<div class="sw-row">';
      html +=   '<span class="sw-funnel-tag sw-funnel-' + fnl + '">' + esc(fnl) + '</span>';
      html +=   '<span class="sw-row-format">' + esc(suggested) + '</span>';
      html +=   '<span class="sw-row-desc">Test <strong>' + esc(c.angle) + '</strong> × <strong>' + esc(c.persona) + '</strong> at ' + esc(fnl) + '</span>';
      html +=   '<button type="button" class="sw-create-btn" ' +
                  'data-card-idx="' + ci + '" ' +
                  'data-funnel="' + esc(fnl) + '" ' +
                  'data-format="' + esc(suggested) + '">Create Task</button>';
      html += '</div>';
    }
    html += '</div>';

    html += '</div>'; // .sw-card
  }

  html += '</div>'; // .scale-winners-wrapper
  el.innerHTML = html;

  // Wire Create Task buttons — reuse createGapTaskFromRow exactly as the gap
  // table does. The function toggles .nt-creating / .nt-success / .nt-failed
  // on the button; styles for those state classes are mirrored under
  // .scale-winners-wrapper in renderScaleWinnersStyle below.
  var btns = el.querySelectorAll('.sw-create-btn');
  for (var bi = 0; bi < btns.length; bi++) {
    btns[bi].addEventListener('click', function(e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      var cardIdx = parseInt(btn.getAttribute('data-card-idx'), 10);
      var card = cards[cardIdx];
      if (!card) return;
      var fnl = btn.getAttribute('data-funnel');
      var fmt = btn.getAttribute('data-format');
      var gap = {
        angle:    card.angle,
        persona:  card.persona,
        funnel:   fnl,
        format:   fmt,
        priority: PRIORITY.WINNER_ADJACENT,
        reason:   card.winFunnel + ' winner — scale to ' + fnl,
        siblingWinner: true
      };
      createGapTaskFromRow(gap, btn);
    });
  }
}

function renderScaleWinnersStyle() {
  // Scoped under .scale-winners-wrapper. Uses real app tokens (--card, --b,
  // --t1/t2/t3, --test, --holo, --r, --rs); tier/funnel pills mirror the
  // Winner Variations and Gap Box palettes for visual parity.
  return (
    '<style>' +

    /* ── Wrapper card — matches .next-tests-wrapper / .winner-variations-wrapper ── */
    '.scale-winners-wrapper{' +
      'background:var(--card);' +
      'border:1px solid var(--b);' +
      'border-radius:var(--r);' +
      'box-shadow:0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);' +
      'overflow:hidden;margin-top:16px;' +
      'color:var(--t1);font-family:inherit;position:relative;' +
    '}' +
    '.scale-winners-wrapper::before{' +
      'content:"";position:absolute;top:0;left:0;right:0;height:2px;' +
      'background:var(--holo);pointer-events:none;z-index:2;' +
    '}' +

    /* ── Header ── */
    '.scale-winners-wrapper .sw-header{' +
      'display:flex;align-items:center;gap:10px;' +
      'padding:16px 18px 14px;' +
      'border-bottom:1px solid var(--b);' +
    '}' +
    '.scale-winners-wrapper .sw-title{' +
      'margin:0;font-size:0.85rem;font-weight:600;color:var(--t1);' +
    '}' +
    '.scale-winners-wrapper .sw-count-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 9px;border-radius:10px;' +
      'background:var(--test);color:#fff;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +

    /* ── Empty state ── */
    '.scale-winners-wrapper .sw-empty{' +
      'padding:32px 20px;text-align:center;' +
      'color:var(--t3);font-size:0.82rem;' +
    '}' +

    /* ── Winner card ── */
    '.scale-winners-wrapper .sw-card{' +
      'padding:16px 20px;border-bottom:1px solid var(--b);' +
    '}' +
    '.scale-winners-wrapper .sw-card:last-child{border-bottom:none;}' +
    '.scale-winners-wrapper .sw-card-head{' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:10px;' +
      'margin-bottom:8px;' +
    '}' +
    '.scale-winners-wrapper .sw-card-title{' +
      'font-size:0.82rem;font-weight:600;color:var(--t1);' +
    '}' +
    '.scale-winners-wrapper .sw-meta-row{' +
      'display:flex;flex-wrap:wrap;gap:14px;' +
      'margin-bottom:14px;' +
    '}' +
    '.scale-winners-wrapper .sw-meta{' +
      'font-size:0.72rem;color:var(--t2);' +
    '}' +
    '.scale-winners-wrapper .sw-meta strong{color:var(--t1);font-weight:600;}' +

    /* ── Section header ── */
    '.scale-winners-wrapper .sw-section-title{' +
      'font-size:0.65rem;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:0.06em;color:var(--t3);' +
      'margin-bottom:8px;' +
    '}' +

    /* ── Suggestion rows — subtle indigo wash + left border in --test ── */
    '.scale-winners-wrapper .sw-rows{display:flex;flex-direction:column;gap:8px;}' +
    '.scale-winners-wrapper .sw-row{' +
      'display:grid;grid-template-columns:auto 180px 1fr auto;' +
      'gap:12px;align-items:center;' +
      'padding:10px 12px;' +
      'background:rgba(79,70,229,0.04);' +
      'border-left:3px solid var(--test);' +
      'border-radius:var(--rs);' +
      'font-size:0.75rem;' +
    '}' +
    '.scale-winners-wrapper .sw-row-format{' +
      'font-weight:500;color:var(--t1);' +
    '}' +
    '.scale-winners-wrapper .sw-row-desc{' +
      'color:var(--t2);font-size:0.72rem;line-height:1.4;' +
    '}' +
    '.scale-winners-wrapper .sw-row-desc strong{color:var(--t1);font-weight:600;}' +

    /* ── Funnel pills (same palette as .nt-funnel-XXX / .wv-funnel-XXX) ── */
    '.scale-winners-wrapper .sw-funnel-tag{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 7px;border-radius:4px;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.scale-winners-wrapper .sw-funnel-TOF{background:#dcfce7;color:#15803d;}' +
    '.scale-winners-wrapper .sw-funnel-MOF{background:#dbeafe;color:#1d4ed8;}' +
    '.scale-winners-wrapper .sw-funnel-BOF{background:#fce7f3;color:#be185d;}' +

    /* ── Tier badges (mirror .wv-tier-*) ── */
    '.scale-winners-wrapper .sw-tier-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.scale-winners-wrapper .sw-tier-massive{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}' +
    '.scale-winners-wrapper .sw-tier-good{background:#fffbeb;color:#b45309;border:1px solid #fde68a;}' +
    '.scale-winners-wrapper .sw-tier-mild{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;}' +

    /* ── Urgency badges ── */
    '.scale-winners-wrapper .sw-urgency-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.scale-winners-wrapper .sw-urg-high{background:#fef3c7;color:#92400e;border:1px solid #fde68a;}' +
    '.scale-winners-wrapper .sw-urg-med{background:#ede9fe;color:#5b21b6;border:1px solid #ddd6fe;}' +

    /* ── Create Task button (mirrors .nt-create-btn) ── */
    '.scale-winners-wrapper .sw-create-btn{' +
      'padding:5px 12px;border-radius:6px;' +
      'border:1px solid #e2e8f0;' +
      'background:#fff;color:#64748b;' +
      'font-family:inherit;' +
      'font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;white-space:nowrap;' +
      'transition:background .15s, border-color .15s, color .15s, transform .1s;' +
    '}' +
    '.scale-winners-wrapper .sw-create-btn:hover:not(:disabled){' +
      'background:var(--test);border-color:var(--test);color:#fff;' +
    '}' +
    '.scale-winners-wrapper .sw-create-btn:active:not(:disabled){transform:scale(0.97);}' +
    '.scale-winners-wrapper .sw-create-btn:disabled{cursor:default;}' +
    /* createGapTaskFromRow toggles these state classes — keep visible styling */
    '.scale-winners-wrapper .sw-create-btn.nt-creating{' +
      'background:#f1f5f9;border-color:#e2e8f0;color:#64748b;opacity:0.7;' +
    '}' +
    '.scale-winners-wrapper .sw-create-btn.nt-success{' +
      'background:#dcfce7;border-color:#bbf7d0;color:#15803d;' +
    '}' +
    '.scale-winners-wrapper .sw-create-btn.nt-failed{' +
      'background:#fee2e2;border-color:#fecaca;color:#dc2626;' +
    '}' +

    '</style>'
  );
}

// ── 4a-2. WINNER VARIATIONS ──

function renderWinnerVariations(winners) {
  winners = winners || (typeof WINNERS !== 'undefined' ? WINNERS : []);
  var el = document.getElementById('winnerVariationsBox');
  if (!el) return;

  var actions = (typeof MANUAL_ACTIONS !== 'undefined' && Array.isArray(MANUAL_ACTIONS)) ? MANUAL_ACTIONS : [];

  // Build a per-winner index of already-created variation types
  function createdTypesFor(parentId) {
    var found = {};
    for (var mi = 0; mi < actions.length; mi++) {
      var ma = actions[mi];
      if (ma && ma.sourceAdId === parentId && ma.tag && String(ma.tag).indexOf('winner-variation') !== -1) {
        if (ma.variationType) found[ma.variationType] = true;
      }
    }
    return found;
  }

  // Count pending across all winners (for the header badge)
  var totalPending = 0;
  for (var wi = 0; wi < winners.length; wi++) {
    var wEntry = winners[wi];
    if (!wEntry || !wEntry.parent) continue;
    var created = createdTypesFor(wEntry.parent.id);
    for (var ti = 0; ti < WINNER_VARIATION_TYPES.length; ti++) {
      if (!created[WINNER_VARIATION_TYPES[ti].key]) totalPending++;
    }
  }

  var html = '<div class="winner-variations-wrapper">';
  html += renderWinnerVariationsStyle();

  html +=
    '<div class="wv-header">' +
      '<h3 class="wv-title">Winner Variations</h3>' +
      '<span class="wv-pending-badge">' + mono(totalPending) + ' pending</span>' +
    '</div>';

  if (!winners || !winners.length) {
    html += '<div class="wv-empty">No winner ads yet — once an ad reaches Winner status, variation suggestions will appear here.</div>';
    html += '</div>';
    el.innerHTML = html;
    return;
  }

  for (var wi2 = 0; wi2 < winners.length; wi2++) {
    var w = winners[wi2];
    if (!w || !w.parent) continue;
    var p = w.parent;
    var tier = (p.winnerTier || '').trim();
    var tierCls = tier === 'Massive' ? 'wv-tier-massive' :
                  tier === 'Good'    ? 'wv-tier-good' :
                  tier === 'Mild'    ? 'wv-tier-mild' : '';
    var funnel = (p.funnelStage || '').toUpperCase();
    var createdMap = createdTypesFor(p.id);
    var createdCount = 0;
    for (var ck in createdMap) if (Object.prototype.hasOwnProperty.call(createdMap, ck)) createdCount++;
    var pct = Math.round(createdCount / WINNER_VARIATION_TYPES.length * 100);
    var remaining = WINNER_VARIATION_TYPES.length - createdCount;

    html += '<div class="wv-card" data-winner-id="' + esc(p.id) + '">';

    // Header row
    html += '<div class="wv-card-head">';
    html += '<div class="wv-card-title">' + esc(p.formatName || p.id) + '</div>';
    if (tierCls) html += '<span class="wv-tier-badge ' + tierCls + '">' + esc(tier) + ' Winner</span>';
    if (funnel) html += '<span class="wv-funnel-tag wv-funnel-' + funnel + '">' + funnel + '</span>';
    if (p.angle)   html += '<span class="wv-meta">Angle: ' + esc(p.angle) + '</span>';
    if (p.persona) html += '<span class="wv-meta">Persona: ' + esc(p.persona) + '</span>';
    html += '</div>';

    // Progress bar
    html += '<div class="wv-progress">' +
      '<div class="wv-progress-bar"><div class="wv-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="wv-progress-text">' + mono(createdCount) + ' / ' + mono(WINNER_VARIATION_TYPES.length) + ' variations</div>' +
    '</div>';

    // 5 variation rows
    html += '<div class="wv-rows">';
    for (var ti2 = 0; ti2 < WINNER_VARIATION_TYPES.length; ti2++) {
      var vt = WINNER_VARIATION_TYPES[ti2];
      var queued = !!createdMap[vt.key];
      html += '<div class="wv-row">';
      html +=   '<div class="wv-row-elem">' + esc(vt.key) + '</div>';
      html +=   '<div class="wv-row-desc">' + esc(vt.desc) + '</div>';
      html +=   '<div class="wv-row-action">';
      if (queued) {
        html += '<button type="button" class="wv-create-btn wv-queued" disabled>&#10003; Queued</button>';
      } else {
        html += '<button type="button" class="wv-create-btn" ' +
                  'data-winner-id="' + esc(p.id) + '" ' +
                  'data-var-type="' + esc(vt.key) + '">Create Task</button>';
      }
      html +=   '</div>';
      html += '</div>';
    }
    html += '</div>';

    // Create All Remaining row
    html += '<div class="wv-all-row">';
    if (remaining > 0) {
      html += '<button type="button" class="wv-all-btn" data-winner-id="' + esc(p.id) + '">Create All Remaining (' + mono(remaining) + ')</button>';
    } else {
      html += '<span class="wv-all-done">&#10003; All 5 variations queued</span>';
    }
    html += '</div>';

    html += '</div>'; // .wv-card
  }

  html += '</div>'; // .winner-variations-wrapper
  el.innerHTML = html;

  // Wire per-row Create Task buttons
  var createBtns = el.querySelectorAll('.wv-create-btn:not(.wv-queued)');
  for (var bi = 0; bi < createBtns.length; bi++) {
    createBtns[bi].addEventListener('click', function(e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      var wid = btn.getAttribute('data-winner-id');
      var vtKey = btn.getAttribute('data-var-type');
      var winner = findWinnerById(wid);
      if (!winner) return;
      createWinnerVariationTask(winner, vtKey, btn, null);
    });
  }

  // Wire Create All Remaining buttons
  var allBtns = el.querySelectorAll('.wv-all-btn');
  for (var ai = 0; ai < allBtns.length; ai++) {
    allBtns[ai].addEventListener('click', function(e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      var wid = btn.getAttribute('data-winner-id');
      var winner = findWinnerById(wid);
      if (!winner) return;
      createAllRemainingForWinner(winner, btn);
    });
  }
}

function findWinnerById(id) {
  if (typeof WINNERS === 'undefined' || !Array.isArray(WINNERS)) return null;
  for (var i = 0; i < WINNERS.length; i++) {
    if (WINNERS[i] && WINNERS[i].parent && WINNERS[i].parent.id === id) return WINNERS[i];
  }
  return null;
}

function winnerVariationExists(parentId, varType) {
  if (typeof MANUAL_ACTIONS === 'undefined' || !Array.isArray(MANUAL_ACTIONS)) return false;
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    var ma = MANUAL_ACTIONS[i];
    if (ma && ma.sourceAdId === parentId &&
        ma.tag && String(ma.tag).indexOf('winner-variation') !== -1 &&
        ma.variationType === varType) {
      return true;
    }
  }
  return false;
}

function getWinnerVariationPriority(tier) {
  if (tier === 'Massive') return 'urgent';
  if (tier === 'Good')    return 'high';
  return 'normal'; // Mild + unknown both map here
}

function createWinnerVariationTask(winner, varType, btn, onDone) {
  if (!winner || !winner.parent) { if (onDone) onDone(false); return; }

  if (btn) {
    btn.disabled = true;
    btn.classList.remove('wv-success', 'wv-failed');
    btn.classList.add('wv-creating');
    btn.textContent = 'Creating…';
  }

  if (typeof MANUAL_ACTIONS === 'undefined' || typeof createClickUpTaskFromAction !== 'function') {
    console.error('[winnerVariations] MANUAL_ACTIONS or createClickUpTaskFromAction unavailable');
    if (btn) {
      btn.classList.remove('wv-creating');
      btn.classList.add('wv-failed');
      btn.textContent = '✗ Failed';
      btn.disabled = false;
    }
    if (onDone) onDone(false);
    return;
  }

  var p = winner.parent;
  var tier = (p.winnerTier || '').trim();
  var priorityStr = getWinnerVariationPriority(tier);
  var vtObj = null;
  for (var ti = 0; ti < WINNER_VARIATION_TYPES.length; ti++) {
    if (WINNER_VARIATION_TYPES[ti].key === varType) { vtObj = WINNER_VARIATION_TYPES[ti]; break; }
  }
  var descText = (vtObj && vtObj.desc) || '';

  // [VAR] prefix is in-app display only — bulk.js:238 rewrites the ClickUp name
  // to the standardized "angle - ICP: persona - funnel - format" form.
  var newAction = {
    id: 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    priority: priorityStr,
    title: '[VAR][' + varType + '] ' + (p.angle || '') + ' × ' + (p.persona || '') + ' — ' + (p.funnelStage || ''),
    reason: 'Winner variation test: change ' + varType + ' on winner ' + p.id,
    tag: 'winner-variation',
    angle: p.angle || '',
    persona: p.persona || '',
    funnelStage: p.funnelStage || '',
    format: p.formatName || '',
    dueDate: typeof todayISO === 'function' ? todayISO() : new Date().toISOString().split('T')[0],
    description: descText,
    adId: p.id,
    adLink: p.adLink || '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: p.id,
    sourceAngle: p.angle || '',
    sourcePersona: p.persona || '',
    isWinnerVariation: true,
    variationType: varType
  };
  MANUAL_ACTIONS.push(newAction);
  if (typeof saveState === 'function')            saveState();
  if (typeof genActions === 'function')           genActions();
  if (typeof rebuildProdFromManual === 'function') rebuildProdFromManual();
  if (typeof renderActionPlan === 'function')     renderActionPlan();
  if (typeof renderProduction === 'function')     renderProduction();

  createClickUpTaskFromAction(newAction.id, function(ok) {
    if (btn) {
      btn.classList.remove('wv-creating');
      if (ok) {
        btn.classList.add('wv-success');
        btn.textContent = '✓ Created';
      } else {
        btn.classList.add('wv-failed');
        btn.textContent = '✗ Failed';
        btn.disabled = false;
        console.error('[winnerVariations] createClickUpTaskFromAction failed for', newAction.id);
      }
    }
    if (onDone) onDone(!!ok);
  });
}

function createAllRemainingForWinner(winner, allBtn) {
  if (!winner || !winner.parent) return;
  var p = winner.parent;

  var pending = [];
  for (var ti = 0; ti < WINNER_VARIATION_TYPES.length; ti++) {
    var vtKey = WINNER_VARIATION_TYPES[ti].key;
    if (!winnerVariationExists(p.id, vtKey)) pending.push(vtKey);
  }
  if (pending.length === 0) {
    allBtn.disabled = true;
    allBtn.textContent = '✓ All Created';
    return;
  }

  allBtn.disabled = true;
  allBtn.classList.add('wv-creating');

  var idx = 0;
  var total = pending.length;
  var allOk = true;

  function next() {
    if (idx >= pending.length) {
      allBtn.classList.remove('wv-creating');
      allBtn.textContent = allOk ? '✓ All Created' : 'Some tasks failed';
      // Re-render so the per-row "Queued" badges reflect reality and progress bar updates
      if (typeof renderWinnerVariations === 'function') {
        renderWinnerVariations(typeof WINNERS !== 'undefined' ? WINNERS : []);
      }
      return;
    }
    var vtKey = pending[idx];
    allBtn.textContent = 'Creating ' + (idx + 1) + '/' + total + '…';
    createWinnerVariationTask(winner, vtKey, null, function(ok) {
      if (!ok) allOk = false;
      idx++;
      // 300ms pause between sequential ClickUp task creates to avoid rate-limiting
      setTimeout(next, 300);
    });
  }
  next();
}

function renderWinnerVariationsStyle() {
  // Scoped under .winner-variations-wrapper. Uses only real app tokens
  // (--card, --b, --t1/t2/t3, --test, --holo, --r, --rs) + hardcoded palette
  // for tier/funnel pills and state colors.
  return (
    '<style>' +

    /* ── Wrapper card ── */
    '.winner-variations-wrapper{' +
      'background:var(--card);' +
      'border:1px solid var(--b);' +
      'border-radius:var(--r);' +
      'box-shadow:0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);' +
      'overflow:hidden;margin-top:16px;' +
      'color:var(--t1);font-family:inherit;position:relative;' +
    '}' +
    '.winner-variations-wrapper::before{' +
      'content:"";position:absolute;top:0;left:0;right:0;height:2px;' +
      'background:var(--holo);pointer-events:none;z-index:2;' +
    '}' +

    /* ── Header ── */
    '.winner-variations-wrapper .wv-header{' +
      'display:flex;align-items:center;gap:10px;' +
      'padding:16px 18px 14px;' +
      'border-bottom:1px solid var(--b);' +
    '}' +
    '.winner-variations-wrapper .wv-title{' +
      'margin:0;font-size:0.85rem;font-weight:600;color:var(--t1);' +
    '}' +
    '.winner-variations-wrapper .wv-pending-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 9px;border-radius:10px;' +
      'background:var(--test);color:#fff;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +

    /* ── Empty state ── */
    '.winner-variations-wrapper .wv-empty{' +
      'padding:32px 20px;text-align:center;' +
      'color:var(--t3);font-size:0.82rem;' +
    '}' +

    /* ── Winner card ── */
    '.winner-variations-wrapper .wv-card{' +
      'padding:16px 20px;border-bottom:1px solid var(--b);' +
    '}' +
    '.winner-variations-wrapper .wv-card:last-child{border-bottom:none;}' +
    '.winner-variations-wrapper .wv-card-head{' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:10px;' +
      'margin-bottom:12px;' +
    '}' +
    '.winner-variations-wrapper .wv-card-title{' +
      'font-size:0.82rem;font-weight:600;color:var(--t1);' +
    '}' +
    '.winner-variations-wrapper .wv-meta{' +
      'font-size:0.7rem;color:var(--t2);' +
    '}' +

    /* ── Tier badges ── */
    '.winner-variations-wrapper .wv-tier-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.winner-variations-wrapper .wv-tier-massive{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}' +
    '.winner-variations-wrapper .wv-tier-good{background:#fffbeb;color:#b45309;border:1px solid #fde68a;}' +
    '.winner-variations-wrapper .wv-tier-mild{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;}' +

    /* ── Funnel pills (match gap box palette) ── */
    '.winner-variations-wrapper .wv-funnel-tag{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 7px;border-radius:4px;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.winner-variations-wrapper .wv-funnel-TOF{background:#dcfce7;color:#15803d;}' +
    '.winner-variations-wrapper .wv-funnel-MOF{background:#dbeafe;color:#1d4ed8;}' +
    '.winner-variations-wrapper .wv-funnel-BOF{background:#fce7f3;color:#be185d;}' +

    /* ── Progress bar ── */
    '.winner-variations-wrapper .wv-progress{' +
      'display:flex;align-items:center;gap:10px;margin-bottom:12px;' +
    '}' +
    '.winner-variations-wrapper .wv-progress-bar{' +
      'flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;' +
    '}' +
    '.winner-variations-wrapper .wv-progress-fill{' +
      'height:100%;background:var(--test);transition:width 0.3s ease;' +
    '}' +
    '.winner-variations-wrapper .wv-progress-text{' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.7rem;color:var(--t2);white-space:nowrap;' +
    '}' +

    /* ── Variation rows ── */
    '.winner-variations-wrapper .wv-rows{margin-bottom:12px;}' +
    '.winner-variations-wrapper .wv-row{' +
      'display:grid;grid-template-columns:110px 1fr auto;' +
      'gap:12px;align-items:center;' +
      'padding:8px 0;' +
      'border-bottom:1px solid var(--b);' +
      'font-size:0.78rem;' +
    '}' +
    '.winner-variations-wrapper .wv-row:last-child{border-bottom:none;}' +
    '.winner-variations-wrapper .wv-row-elem{' +
      'font-weight:500;color:var(--t1);' +
    '}' +
    '.winner-variations-wrapper .wv-row-desc{' +
      'color:var(--t2);line-height:1.4;' +
    '}' +
    '.winner-variations-wrapper .wv-row-action{text-align:right;}' +

    /* ── Create Task button ── */
    '.winner-variations-wrapper .wv-create-btn{' +
      'padding:5px 12px;border-radius:6px;' +
      'border:1px solid #e2e8f0;' +
      'background:#fff;color:#64748b;' +
      'font-family:inherit;' +
      'font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;white-space:nowrap;' +
      'transition:background .15s, border-color .15s, color .15s, transform .1s;' +
    '}' +
    '.winner-variations-wrapper .wv-create-btn:hover:not(:disabled){' +
      'background:var(--test);border-color:var(--test);color:#fff;' +
    '}' +
    '.winner-variations-wrapper .wv-create-btn:active:not(:disabled){transform:scale(0.97);}' +
    '.winner-variations-wrapper .wv-create-btn:disabled{cursor:default;}' +
    '.winner-variations-wrapper .wv-create-btn.wv-creating{' +
      'background:#f1f5f9;border-color:#e2e8f0;color:#64748b;opacity:0.7;' +
    '}' +
    '.winner-variations-wrapper .wv-create-btn.wv-success,' +
    '.winner-variations-wrapper .wv-create-btn.wv-queued{' +
      'background:#dcfce7;border-color:#bbf7d0;color:#15803d;' +
    '}' +
    '.winner-variations-wrapper .wv-create-btn.wv-failed{' +
      'background:#fee2e2;border-color:#fecaca;color:#dc2626;' +
    '}' +

    /* ── Create All Remaining ── */
    '.winner-variations-wrapper .wv-all-row{margin-top:10px;text-align:center;}' +
    '.winner-variations-wrapper .wv-all-btn{' +
      'display:block;width:100%;' +
      'padding:8px 16px;border-radius:6px;' +
      'border:1px solid var(--test);' +
      'background:#fff;color:var(--test);' +
      'font-family:inherit;' +
      'font-size:0.75rem;font-weight:600;' +
      'cursor:pointer;' +
      'transition:background .15s, color .15s, transform .1s;' +
    '}' +
    '.winner-variations-wrapper .wv-all-btn:hover:not(:disabled){' +
      'background:var(--test);color:#fff;' +
    '}' +
    '.winner-variations-wrapper .wv-all-btn:active:not(:disabled){transform:scale(0.98);}' +
    '.winner-variations-wrapper .wv-all-btn:disabled{cursor:default;}' +
    '.winner-variations-wrapper .wv-all-btn.wv-creating{' +
      'background:#f1f5f9;border-color:#e2e8f0;color:#64748b;' +
    '}' +
    '.winner-variations-wrapper .wv-all-done{' +
      'display:inline-block;padding:6px 14px;' +
      'color:#15803d;font-size:0.72rem;font-weight:500;' +
    '}' +

    '</style>'
  );
}

// ── 4a-3. COMPETITOR INTEL ──

// Generic top-N frequency summarizer. Counts occurrences of items[i][key] and
// returns up to n entries shaped { name, count } sorted desc.
function topN(items, key, n) {
  var counts = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var v = it && it[key];
    if (v == null || v === '') continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  var arr = [];
  for (var k in counts) {
    if (Object.prototype.hasOwnProperty.call(counts, k)) arr.push({ name: k, count: counts[k] });
  }
  arr.sort(function(a, b){ return b.count - a.count; });
  return arr.slice(0, n);
}

function renderCompetitorIntel(inspirations) {
  var el = document.getElementById('competitorIntelBox');
  if (!el) return;

  inspirations = inspirations || (typeof INSPIRATIONS !== 'undefined' ? INSPIRATIONS : []);

  // Normalize each row to a flat shape: top-level fields take precedence, .data
  // jsonb is the fallback so the function works regardless of how listInspirations
  // last spread the row.
  function flat(ins) {
    var d = (ins && ins.data) || {};
    return {
      angle:             ins.angle || d.angle || '',
      persona:           ins.persona || d.persona || '',
      funnelStage:       (ins.funnelStage || d.funnelStage || '').toString().toUpperCase(),
      hookType:          ins.hookType || d.hookType || '',
      creativeStructure: ins.creativeStructure || d.creativeStructure || '',
      brand:             ins.brand || d.brand || '',
      status:            ins.status || d.status || ''
    };
  }
  // Only count rows with at least one taxonomy field — skips raw queued URLs
  var items = [];
  for (var ix = 0; ix < inspirations.length; ix++) {
    var f = flat(inspirations[ix]);
    if (f.angle || f.hookType || f.creativeStructure || f.brand) items.push(f);
  }

  var html = '<div class="ci-wrapper">';
  html += renderCompetitorIntelStyle();

  html +=
    '<div class="ci-header">' +
      '<h3 class="ci-title">Competitor Intel</h3>' +
      '<span class="ci-total-badge">' + mono(items.length) + ' classified</span>' +
    '</div>';

  if (items.length === 0) {
    html +=
      '<div class="ci-empty">' +
        'No competitor ads classified yet — use the Inspiration tab to queue and classify competitor ads.' +
      '</div>';
    html += '</div>';
    el.innerHTML = html;
    return;
  }

  // Per-funnel breakdown — top angles / hooks / structures
  var sectionHtml = function(title, arr) {
    if (!arr || !arr.length) {
      return '<div class="ci-section"><div class="ci-section-title">' + esc(title) + '</div>' +
             '<div class="ci-empty-line">—</div></div>';
    }
    var rows = '';
    for (var ri = 0; ri < arr.length; ri++) {
      rows += '<div class="ci-rank-row">' +
                '<span class="ci-rank-name">' + esc(arr[ri].name) + '</span>' +
                '<span class="ci-rank-count">' + mono(arr[ri].count) + '</span>' +
              '</div>';
    }
    return '<div class="ci-section"><div class="ci-section-title">' + esc(title) + '</div>' + rows + '</div>';
  };

  html += '<div class="ci-funnel-grid">';
  for (var fi = 0; fi < FUNNEL_STAGES.length; fi++) {
    var fs = FUNNEL_STAGES[fi];
    var bucket = items.filter(function(x){ return x.funnelStage === fs; });
    var topAng    = topN(bucket, 'angle', 3);
    var topHook   = topN(bucket, 'hookType', 3);
    var topStruct = topN(bucket, 'creativeStructure', 3);

    html += '<div class="ci-card">' +
              '<div class="ci-card-head">' +
                '<span class="ci-funnel-tag ci-funnel-' + fs + '">' + fs + '</span>' +
                '<span class="ci-card-count">' + mono(bucket.length) + ' ad' + (bucket.length===1?'':'s') + ' analyzed</span>' +
              '</div>' +
              sectionHtml('Top Angles',     topAng) +
              sectionHtml('Top Hooks',      topHook) +
              sectionHtml('Top Structures', topStruct) +
            '</div>';
  }
  html += '</div>'; // .ci-funnel-grid

  // Gaps vs Market — from _lastGaps, only those with competitor signal
  var gapsWithComp = (_lastGaps || []).filter(function(g){ return (g.competitorCount || 0) > 0; });
  gapsWithComp.sort(function(a, b){ return (b.competitorCount||0) - (a.competitorCount||0); });
  gapsWithComp = gapsWithComp.slice(0, 10);

  html += '<div class="ci-gaps-head">Gaps vs Market</div>';
  if (!gapsWithComp.length) {
    html += '<div class="ci-empty-line ci-gaps-empty">No matching gaps — your taxonomy is fully covered for everything competitors are running.</div>';
  } else {
    html += '<div class="ci-gaps-table-wrap"><table class="ci-gaps-table"><thead><tr>' +
              '<th>Angle</th><th>Persona</th><th>Funnel</th><th>Competitors</th><th></th>' +
            '</tr></thead><tbody>';
    for (var gi = 0; gi < gapsWithComp.length; gi++) {
      var g = gapsWithComp[gi];
      var compTitle = (g.competitorBrands || []).join(', ');
      var compText  = (g.competitorCount || 0) + ' competitor ad' + (g.competitorCount === 1 ? '' : 's');
      html += '<tr>' +
                '<td>' + esc(g.angle) + '</td>' +
                '<td>' + esc(g.persona) + '</td>' +
                '<td><span class="ci-funnel-tag ci-funnel-' + g.funnel + '">' + g.funnel + '</span></td>' +
                '<td><span class="ci-comp-badge" title="' + esc(compTitle) + '">' + esc(compText) + '</span></td>' +
                '<td><button type="button" class="ci-create-btn" data-gap-idx="' + gi + '">Create Task</button></td>' +
              '</tr>';
    }
    html += '</tbody></table></div>';
  }

  html += '</div>'; // .ci-wrapper
  el.innerHTML = html;

  // Wire Create Task buttons → reuse the existing gap-task creator
  var btns = el.querySelectorAll('.ci-create-btn');
  for (var bi = 0; bi < btns.length; bi++) {
    btns[bi].addEventListener('click', function(e){
      var btn = e.currentTarget;
      if (btn.disabled) return;
      var idx = parseInt(btn.getAttribute('data-gap-idx'), 10);
      var gap = gapsWithComp[idx];
      if (gap) createGapTaskFromRow(gap, btn);
    });
  }
}

function renderCompetitorIntelStyle() {
  // Scoped under .ci-wrapper. Uses the app's real tokens (--card, --b, --t1/t2/t3,
  // --test, --holo, --r, --rs) plus the gap box's funnel palette for visual parity.
  return (
    '<style>' +

    /* ── Wrapper card — matches .next-tests-wrapper / .winner-variations-wrapper ── */
    '.ci-wrapper{' +
      'background:var(--card);' +
      'border:1px solid var(--b);' +
      'border-radius:var(--r);' +
      'box-shadow:0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);' +
      'overflow:hidden;margin-top:16px;' +
      'color:var(--t1);font-family:inherit;position:relative;' +
    '}' +
    '.ci-wrapper::before{' +
      'content:"";position:absolute;top:0;left:0;right:0;height:2px;' +
      'background:var(--holo);pointer-events:none;z-index:2;' +
    '}' +

    /* ── Header ── */
    '.ci-wrapper .ci-header{' +
      'display:flex;align-items:center;gap:10px;' +
      'padding:16px 18px 14px;' +
      'border-bottom:1px solid var(--b);' +
    '}' +
    '.ci-wrapper .ci-title{' +
      'margin:0;font-size:0.85rem;font-weight:600;color:var(--t1);' +
    '}' +
    '.ci-wrapper .ci-total-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 9px;border-radius:10px;' +
      'background:var(--test);color:#fff;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +

    /* ── Empty state ── */
    '.ci-wrapper .ci-empty{' +
      'padding:32px 20px;text-align:center;' +
      'color:var(--t3);font-size:0.82rem;' +
    '}' +

    /* ── Per-funnel breakdown grid ── */
    '.ci-wrapper .ci-funnel-grid{' +
      'display:grid;grid-template-columns:repeat(3, 1fr);gap:14px;' +
      'padding:16px 18px;' +
    '}' +
    '@media (max-width: 768px){' +
      '.ci-wrapper .ci-funnel-grid{grid-template-columns:1fr;}' +
    '}' +
    '.ci-wrapper .ci-card{' +
      'background:#fff;border:1px solid var(--b);border-radius:var(--rs);' +
      'padding:12px 14px;' +
    '}' +
    '.ci-wrapper .ci-card-head{' +
      'display:flex;align-items:center;gap:8px;margin-bottom:10px;' +
    '}' +
    '.ci-wrapper .ci-card-count{' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.7rem;color:var(--t2);' +
    '}' +

    /* ── Funnel pills (palette parity with Next Tests) ── */
    '.ci-wrapper .ci-funnel-tag{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 7px;border-radius:4px;' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;font-weight:600;letter-spacing:0.02em;' +
    '}' +
    '.ci-wrapper .ci-funnel-TOF{background:#dcfce7;color:#15803d;}' +
    '.ci-wrapper .ci-funnel-MOF{background:#dbeafe;color:#1d4ed8;}' +
    '.ci-wrapper .ci-funnel-BOF{background:#fce7f3;color:#be185d;}' +

    /* ── Top-N sections inside each card ── */
    '.ci-wrapper .ci-section{margin-bottom:10px;}' +
    '.ci-wrapper .ci-section:last-child{margin-bottom:0;}' +
    '.ci-wrapper .ci-section-title{' +
      'font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;' +
      'color:var(--t3);margin-bottom:4px;font-weight:500;' +
    '}' +
    '.ci-wrapper .ci-rank-row{' +
      'display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:3px 0;' +
      'font-size:0.74rem;color:var(--t1);' +
    '}' +
    '.ci-wrapper .ci-rank-name{' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'flex:1;min-width:0;' +
    '}' +
    '.ci-wrapper .ci-rank-count{' +
      'font-family:\'JetBrains Mono\',monospace;' +
      'font-size:0.65rem;color:var(--t2);' +
      'background:#f1f5f9;padding:0 6px;border-radius:8px;' +
    '}' +
    '.ci-wrapper .ci-empty-line{' +
      'color:var(--t3);font-size:0.72rem;padding:2px 0;' +
    '}' +

    /* ── Gaps vs Market ── */
    '.ci-wrapper .ci-gaps-head{' +
      'padding:12px 18px 8px;' +
      'font-size:0.75rem;font-weight:600;color:var(--t1);' +
      'border-top:1px solid var(--b);' +
    '}' +
    '.ci-wrapper .ci-gaps-empty{padding:0 18px 18px;}' +
    '.ci-wrapper .ci-gaps-table-wrap{' +
      'padding:0 18px 18px;overflow-x:auto;' +
    '}' +
    '.ci-wrapper .ci-gaps-table{' +
      'width:100%;border-collapse:collapse;font-size:0.75rem;' +
    '}' +
    '.ci-wrapper .ci-gaps-table thead th{' +
      'padding:8px 12px;text-align:left;' +
      'font-size:0.6rem;text-transform:uppercase;letter-spacing:0.06em;' +
      'color:#94a3b8;font-weight:500;' +
      'border-bottom:1px solid #e2e8f0;white-space:nowrap;' +
    '}' +
    '.ci-wrapper .ci-gaps-table tbody td{' +
      'padding:8px 12px;border-bottom:1px solid #f1f5f9;color:var(--t1);' +
    '}' +
    '.ci-wrapper .ci-gaps-table tbody tr:last-child td{border-bottom:none;}' +
    '.ci-wrapper .ci-gaps-table tbody tr:hover td{background:#f8fafc;}' +

    /* ── Competitor count badge (teal) ── */
    '.ci-wrapper .ci-comp-badge{' +
      'display:inline-flex;align-items:center;' +
      'padding:2px 8px;border-radius:10px;' +
      'background:#f0fdfa;color:#0d9488;' +
      'font-size:11px;font-weight:600;letter-spacing:0.01em;white-space:nowrap;' +
    '}' +

    /* ── Create Task button (mirrors Next Tests button) ── */
    '.ci-wrapper .ci-create-btn{' +
      'padding:5px 12px;border-radius:6px;' +
      'border:1px solid #e2e8f0;' +
      'background:#fff;color:#64748b;' +
      'font-family:inherit;' +
      'font-size:0.7rem;font-weight:500;' +
      'cursor:pointer;white-space:nowrap;' +
      'transition:background .15s, border-color .15s, color .15s, transform .1s;' +
    '}' +
    '.ci-wrapper .ci-create-btn:hover:not(:disabled){' +
      'background:var(--test);border-color:var(--test);color:#fff;' +
    '}' +
    '.ci-wrapper .ci-create-btn:active:not(:disabled){transform:scale(0.97);}' +
    '.ci-wrapper .ci-create-btn:disabled{cursor:default;}' +
    /* createGapTaskFromRow toggles these state classes — keep the visual styles */
    '.ci-wrapper .ci-create-btn.nt-creating{background:#f1f5f9;border-color:#e2e8f0;color:#64748b;opacity:0.7;}' +
    '.ci-wrapper .ci-create-btn.nt-success{background:#dcfce7;border-color:#bbf7d0;color:#15803d;}' +
    '.ci-wrapper .ci-create-btn.nt-failed{background:#fee2e2;border-color:#fecaca;color:#dc2626;}' +

    '</style>'
  );
}

