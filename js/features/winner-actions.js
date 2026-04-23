// ============================================================
//  6. WINNER ACTIONS
// ============================================================

function createVariationsForWinner(parentId) {
  var parent = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === parentId) { parent = ADS[i]; break; }
  }
  if (!parent) return;

  // Count existing variations
  var existingVars = 0;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].parentAdId === parentId) existingVars++;
  }
  var needed = 5 - existingVars;
  if (needed <= 0) {
    toast('Already has 5+ variations', 'warn');
    return;
  }

  for (var v = 0; v < needed; v++) {
    var varNum = existingVars + v + 1;
    ADS.push({
      id: nextSerialId(),
      formatName: parent.formatName,
      adLink: '',
      driveLink: '',
      adType: parent.adType,
      funnelStage: parent.funnelStage,
      status: 'Untested',
      angle: parent.angle,
      persona: parent.persona,
      parentAdId: parentId,
      variationNumber: varNum
    });
  }

  // Also create production tasks
  PROD.push({
    id: 'prod-' + (PROD.length + 1),
    name: 'Create ' + needed + ' variations of Winner ' + parentId,
    status: 'to do',
    angle: parent.angle,
    persona: parent.persona,
    format: parent.formatName,
    dueDate: todayISO()
  });

  P = process(ADS);
  deriveWinners();
  genActions();
  renderAll();
  toast(needed + ' variations created for ' + parentId);
}

function createFunnelExpansion(parentId) {
  var parent = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === parentId) { parent = ADS[i]; break; }
  }
  if (!parent) return;

  var cellKey = parent.angle + '||' + parent.persona;
  var cellAds = P.byCell[cellKey] || [];
  var existingStages = {};
  for (var a = 0; a < cellAds.length; a++) existingStages[cellAds[a].funnelStage] = true;

  var created = 0;
  for (var f = 0; f < FUNNEL_STAGES.length; f++) {
    var stage = FUNNEL_STAGES[f];
    if (!existingStages[stage]) {
      ADS.push({
        id: nextSerialId(),
        formatName: parent.formatName,
        adLink: '',
        driveLink: '',
        adType: parent.adType,
        funnelStage: stage,
        status: 'Untested',
        angle: parent.angle,
        persona: parent.persona,
        parentAdId: null,
        variationNumber: null
      });
      PROD.push({
        id: 'prod-' + (PROD.length + 1),
        name: 'Create ' + stage + ' ad for ' + parent.angle + ' x ' + parent.persona,
        status: 'to do',
        angle: parent.angle,
        persona: parent.persona,
        format: parent.formatName,
        dueDate: todayISO()
      });
      created++;
    }
  }

  P = process(ADS);
  deriveWinners();
  genActions();
  renderAll();
  toast(created + ' funnel expansion ads created');
}

