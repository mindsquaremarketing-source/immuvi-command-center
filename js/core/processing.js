// ============================================================
//  3. CORE PROCESSING
// ============================================================

function process(ads) {
  if (!ads) ads = ADS;
  var byCreativeStructure = {}, byHookType = {}, byProductionStyle = {};
  var result = {
    tasks: ads,
    byAngle: {},
    byPersona: {},
    byFormat: {},
    byStage: {},
    byCell: {},
    byCreativeStructure: byCreativeStructure,
    byHookType: byHookType,
    byProductionStyle: byProductionStyle,
    s: { total: 0, winners: 0, testing: 0, notStarted: 0, inProgress: 0, ready: 0, losers: 0, winRate: 0 }
  };

  for (var i = 0; i < ads.length; i++) {
    var ad = ads[i];
    result.s.total++;
    if (ad.status === 'Winner' || ad.status === 'Scale') result.s.winners++;
    else if (ad.status === 'Testing') result.s.testing++;
    else if (ad.status === 'Untested') result.s.notStarted++;
    else if (ad.status === 'In Production') result.s.inProgress++;
    else if (ad.status === 'Ready to Launch') result.s.ready++;
    else if (ad.status === 'Loser') result.s.losers++;

    var ang = ad.angle || 'Unknown';
    var per = ad.persona || 'Unknown';
    var fmt = ad.formatName || 'Unknown';
    var stg = ad.funnelStage || 'Unknown';
    var cell = ang + '||' + per;

    if (!result.byAngle[ang]) result.byAngle[ang] = [];
    result.byAngle[ang].push(ad);

    if (!result.byPersona[per]) result.byPersona[per] = [];
    result.byPersona[per].push(ad);

    if (!result.byFormat[fmt]) result.byFormat[fmt] = [];
    result.byFormat[fmt].push(ad);

    if (!result.byStage[stg]) result.byStage[stg] = [];
    result.byStage[stg].push(ad);

    if (!result.byCell[cell]) result.byCell[cell] = [];
    result.byCell[cell].push(ad);

    if (!byCreativeStructure[ad.creativeStructure || 'Unknown']) byCreativeStructure[ad.creativeStructure || 'Unknown'] = [];
    byCreativeStructure[ad.creativeStructure || 'Unknown'].push(ad);

    if (!byHookType[ad.hookType || 'Unknown']) byHookType[ad.hookType || 'Unknown'] = [];
    byHookType[ad.hookType || 'Unknown'].push(ad);

    if (!byProductionStyle[ad.productionStyle || 'Unknown']) byProductionStyle[ad.productionStyle || 'Unknown'] = [];
    byProductionStyle[ad.productionStyle || 'Unknown'].push(ad);
  }

  result.s.winRate = result.s.total > 0 ? (result.s.winners / result.s.total * 100) : 0;
  return result;
}

function deriveWinners() {
  console.log('[deriveWinners] ADS.length =', ADS.length);
  console.log('[deriveWinners] ADS statuses =', ADS.map(function(a){ return a && a.status; }));
  console.log('[deriveWinners] ADS parentAdIds =', ADS.map(function(a){ return a && a.parentAdId; }));
  WINNERS = [];
  for (var i = 0; i < ADS.length; i++) {
    var ad = ADS[i];
    if ((ad.status === 'Winner' || ad.status === 'Scale') && !ad.parentAdId) {
      var variations = [];
      for (var j = 0; j < ADS.length; j++) {
        if (ADS[j].parentAdId === ad.id) {
          variations.push(ADS[j]);
        }
      }
      WINNERS.push({ parent: ad, variations: variations });
    }
  }
  console.log('[deriveWinners] WINNERS built =', WINNERS.length, JSON.stringify(WINNERS.map(function(w){ return { id: w.parent.id, status: w.parent.status, parentAdId: w.parent.parentAdId }; })));
}

function genActions() {
  // Preserve manual actions across rebuilds
  var savedManual = MANUAL_ACTIONS.slice();
  ACTIONS = [];
  var actId = 1;

  // Helper to find winner combos
  var winnerCombos = {};
  for (var w = 0; w < WINNERS.length; w++) {
    var wp = WINNERS[w].parent;
    var key = wp.angle + '||' + wp.persona;
    if (!winnerCombos[key]) {
      winnerCombos[key] = { angle: wp.angle, persona: wp.persona, ads: [], stages: {} };
    }
    winnerCombos[key].ads.push(wp);
    winnerCombos[key].stages[wp.funnelStage] = true;
  }

  // URGENT: For each winner combo, check missing funnel stages
  var comboKeys = Object.keys(winnerCombos);
  for (var c = 0; c < comboKeys.length; c++) {
    var combo = winnerCombos[comboKeys[c]];
    // Check all funnel stages across ALL ads for this combo (not just winners)
    var cellKey = combo.angle + '||' + combo.persona;
    var cellAds = P.byCell[cellKey] || [];
    var existingStages = {};
    for (var a = 0; a < cellAds.length; a++) {
      existingStages[cellAds[a].funnelStage] = true;
    }
    for (var f = 0; f < FUNNEL_STAGES.length; f++) {
      var stage = FUNNEL_STAGES[f];
      if (!existingStages[stage]) {
        ACTIONS.push({
          id: 'act-' + actId++,
          priority: 'urgent',
          title: 'Create ' + stage + ' ad for ' + combo.angle + ' x ' + combo.persona,
          reason: 'Winner combo is missing ' + stage + ' funnel stage coverage',
          tag: 'funnel-gap',
          angle: combo.angle,
          persona: combo.persona,
          format: null,
          funnelStage: stage,
          dueDate: todayISO(),
          _clickupId: null,
          liveStatus: null
        });
      }
    }
  }

  // HIGH: For each winner ad, check variation count
  for (var w = 0; w < WINNERS.length; w++) {
    var winItem = WINNERS[w];
    var varCount = winItem.variations.length;
    if (varCount < 5) {
      var needed = 5 - varCount;
      ACTIONS.push({
        id: 'act-' + actId++,
        priority: 'high',
        title: 'Need ' + needed + ' more variations of ' + winItem.parent.id,
        reason: winItem.parent.id + ' (' + winItem.parent.formatName + ') has only ' + varCount + ' of 5 variations',
        tag: 'variation-gap',
        angle: winItem.parent.angle,
        persona: winItem.parent.persona,
        format: winItem.parent.formatName,
        funnelStage: winItem.parent.funnelStage,
        dueDate: todayISO(),
        _clickupId: null,
        liveStatus: null
      });
    }
  }

  // HIGH: For each winner combo, check untested formats
  for (var c = 0; c < comboKeys.length; c++) {
    var combo = winnerCombos[comboKeys[c]];
    var cellKey = combo.angle + '||' + combo.persona;
    var cellAds = P.byCell[cellKey] || [];
    var testedFormats = {};
    for (var a = 0; a < cellAds.length; a++) {
      testedFormats[cellAds[a].formatName] = true;
    }
    for (var f = 0; f < SD_FORMATS.length; f++) {
      if (!testedFormats[SD_FORMATS[f]]) {
        ACTIONS.push({
          id: 'act-' + actId++,
          priority: 'high',
          title: 'Test "' + SD_FORMATS[f] + '" format for ' + combo.angle + ' x ' + combo.persona,
          reason: 'Format untested on winning angle-persona combination',
          tag: 'format-gap',
          angle: combo.angle,
          persona: combo.persona,
          format: SD_FORMATS[f],
          funnelStage: null,
          dueDate: todayISO(),
          _clickupId: null,
          liveStatus: null
        });
      }
    }
  }

  // MEDIUM: For angles with status=Winner, check all personas untested
  for (var i = 0; i < ANGLES.length; i++) {
    if (ANGLES[i].status === 'Winner') {
      var angName = ANGLES[i].name;
      for (var j = 0; j < PERSONAS.length; j++) {
        var perName = PERSONAS[j].name;
        var cellKey = angName + '||' + perName;
        // skip combos already in winnerCombos (already covered above)
        if (winnerCombos[cellKey]) continue;
        var cellAds = P.byCell[cellKey] || [];
        if (cellAds.length === 0) {
          ACTIONS.push({
            id: 'act-' + actId++,
            priority: 'medium',
            title: 'Test "' + angName + '" angle with "' + perName + '" persona',
            reason: 'Winning angle has not been tested with this persona',
            tag: 'combo-gap',
            angle: angName,
            persona: perName,
            format: null,
            funnelStage: 'TOF',
            dueDate: todayISO(),
            _clickupId: null,
            liveStatus: null
          });
        }
      }
    }
  }

  // LOW: All other untested angle x persona combos
  for (var i = 0; i < ANGLES.length; i++) {
    var angName = ANGLES[i].name;
    if (ANGLES[i].status === 'Winner') continue; // handled above
    for (var j = 0; j < PERSONAS.length; j++) {
      var perName = PERSONAS[j].name;
      var cellKey = angName + '||' + perName;
      var cellAds = P.byCell[cellKey] || [];
      if (cellAds.length === 0) {
        ACTIONS.push({
          id: 'act-' + actId++,
          priority: 'low',
          title: 'Test "' + angName + '" angle with "' + perName + '" persona',
          reason: 'Untested angle-persona combination',
          tag: 'explore',
          angle: angName,
          persona: perName,
          format: null,
          funnelStage: 'TOF',
          dueDate: todayISO(),
          _clickupId: null,
          liveStatus: null
        });
      }
    }
  }
  // Merge MANUAL_ACTIONS back in (from matrix)
  MANUAL_ACTIONS = savedManual;
  for (var m = 0; m < MANUAL_ACTIONS.length; m++) {
    ACTIONS.push(MANUAL_ACTIONS[m]);
  }
  // Rebuild creative usage index
  buildCreativeUsageIndex();
  return ACTIONS;
}

