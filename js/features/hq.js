// ============================================================
//  4. RENDER FUNCTIONS
// ============================================================

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

  // Gap Box
  var gapEl = document.getElementById('gapBox');
  var gaps = [];

  // Count angles not started
  var angNotStarted = 0;
  for (var i = 0; i < ANGLES.length; i++) {
    if (ANGLES[i].status === 'Untested') angNotStarted++;
  }
  if (angNotStarted > 0) gaps.push(angNotStarted + ' angle' + (angNotStarted > 1 ? 's' : '') + ' not started.');

  // Count personas untested (no ads)
  var persUntested = PERSONAS.length - persWithAds;
  if (persUntested > 0) gaps.push(persUntested + ' persona' + (persUntested > 1 ? 's' : '') + ' untested.');

  // Winner combos missing funnel stages
  var missingFunnel = 0;
  var winnerCombos = {};
  for (var w = 0; w < WINNERS.length; w++) {
    var wp = WINNERS[w].parent;
    var key = wp.angle + '||' + wp.persona;
    if (!winnerCombos[key]) winnerCombos[key] = {};
  }
  var wKeys = Object.keys(winnerCombos);
  for (var c = 0; c < wKeys.length; c++) {
    var parts = wKeys[c].split('||');
    var cellAds = P.byCell[wKeys[c]] || [];
    var stages = {};
    for (var a = 0; a < cellAds.length; a++) stages[cellAds[a].funnelStage] = true;
    for (var f = 0; f < FUNNEL_STAGES.length; f++) {
      if (!stages[FUNNEL_STAGES[f]]) missingFunnel++;
    }
  }
  if (missingFunnel > 0) gaps.push(wKeys.length + ' winner combo' + (wKeys.length > 1 ? 's' : '') + ' missing ' + missingFunnel + ' funnel stage' + (missingFunnel > 1 ? 's' : '') + '.');

  // Winner variation gaps
  for (var w = 0; w < WINNERS.length; w++) {
    var varCount = WINNERS[w].variations.length;
    if (varCount < 5) {
      gaps.push(WINNERS[w].parent.id + ' needs ' + (5 - varCount) + ' more variation' + (5 - varCount > 1 ? 's' : '') + '.');
    }
  }

  // Untested creative structures
  var untestedStructures = 0;
  var csNamesGap = getFieldNames('creativeStructure');
  for (var i = 0; i < csNamesGap.length; i++) {
    if (!(P.byCreativeStructure[csNamesGap[i]] && P.byCreativeStructure[csNamesGap[i]].length > 0)) untestedStructures++;
  }
  if (untestedStructures > 0) gaps.push(untestedStructures + ' creative structure' + (untestedStructures > 1 ? 's' : '') + ' untested.');

  // Untested hook types
  var untestedHooks = 0;
  var htNamesGap = getFieldNames('hookType');
  for (var i = 0; i < htNamesGap.length; i++) {
    if (!(P.byHookType[htNamesGap[i]] && P.byHookType[htNamesGap[i]].length > 0)) untestedHooks++;
  }
  if (untestedHooks > 0) gaps.push(untestedHooks + ' hook type' + (untestedHooks > 1 ? 's' : '') + ' untested.');

  if (gaps.length === 0) {
    gapEl.innerHTML = '<div class="gap-box"><div class="gap-ok">All gaps covered. Great work!</div></div>';
  } else {
    var gapHtml = '<div class="gap-box"><ul class="gap-list">';
    for (var g = 0; g < gaps.length; g++) {
      gapHtml += '<li>' + esc(gaps[g]) + '</li>';
    }
    gapHtml += '</ul></div>';
    gapEl.innerHTML = gapHtml;
  }

  renderProductProfile();
}

