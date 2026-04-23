// ── 4e. WINNERS HUB ──

function renderWinners() {
  // Skip if Winners Hub panel doesn't exist (replaced by Creative Matrix)
  if (!document.getElementById('winnersContainer')) return;
  // Chip palettes
  var angleChips = document.getElementById('angleChips');
  var personaChips = document.getElementById('personaChips');
  var formatChips = document.getElementById('formatChips');

  var acHtml = '';
  for (var i = 0; i < ANGLES.length; i++) {
    acHtml += '<div class="chip angle" draggable="true" ondragstart="handleChipDragStart(event, \'angle\', \'' + escAttr(ANGLES[i].name) + '\')">' + esc(ANGLES[i].name) + '</div>';
  }
  angleChips.innerHTML = acHtml;

  var pcHtml = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    pcHtml += '<div class="chip persona" draggable="true" ondragstart="handleChipDragStart(event, \'persona\', \'' + escAttr(PERSONAS[i].name) + '\')">' + esc(PERSONAS[i].name) + '</div>';
  }
  personaChips.innerHTML = pcHtml;

  var fcHtml = '';
  for (var i = 0; i < SD_FORMATS.length; i++) {
    fcHtml += '<div class="chip format" draggable="true" ondragstart="handleChipDragStart(event, \'format\', \'' + escAttr(SD_FORMATS[i]) + '\')">' + esc(SD_FORMATS[i]) + '</div>';
  }
  formatChips.innerHTML = fcHtml;

  // Winner cards
  var container = document.getElementById('winnersContainer');
  if (WINNERS.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127942;</div><div class="empty-text">No winners yet</div><div class="empty-hint">Change a creative\'s status to "Winner" to see it here</div></div>';
    return;
  }

  var html = '';
  for (var w = 0; w < WINNERS.length; w++) {
    var item = WINNERS[w];
    var parent = item.parent;
    var vars = item.variations;
    var c = classify(parent.status);
    var funnelCls = (parent.funnelStage || '').toLowerCase();

    // Find missing stages for this combo
    var cellKey = parent.angle + '||' + parent.persona;
    var cellAds = P.byCell[cellKey] || [];
    var existingStages = {};
    for (var a = 0; a < cellAds.length; a++) existingStages[cellAds[a].funnelStage] = true;
    var missingStages = [];
    for (var f = 0; f < FUNNEL_STAGES.length; f++) {
      if (!existingStages[FUNNEL_STAGES[f]]) missingStages.push(FUNNEL_STAGES[f]);
    }

    // Variation dots (5 slots)
    var dotsHtml = '<div class="var-dots">';
    for (var d = 0; d < 5; d++) {
      var filled = d < vars.length ? ' filled' : '';
      dotsHtml += '<div class="vdot' + filled + '"></div>';
    }
    dotsHtml += '</div>';

    // Variation rows
    var varRowsHtml = '';
    for (var v = 0; v < vars.length; v++) {
      var vAd = vars[v];
      var vc = classify(vAd.status);
      var vLink = truncateUrl(vAd.adLink);
      varRowsHtml += '<div class="var-row">' +
        mono(vAd.id) +
        ' <span>' + esc(vAd.formatName) + '</span>' +
        ' <span class="bdg ' + vc.cls + '">' + esc(vc.lbl) + '</span>' +
        (vAd.adLink ? ' <a class="link-cell" href="' + escAttr(vAd.adLink) + '" target="_blank" rel="noopener">' + esc(vLink) + '</a>' : '') +
        (vAd.driveLink ? ' <a class="drive-link-cell" href="' + escAttr(vAd.driveLink) + '" target="_blank" rel="noopener">Drive Link</a>' : '') +
      '</div>';
    }

    // Funnel expand button
    var funnelBtn = '';
    if (missingStages.length > 0) {
      funnelBtn = ' <button class="btn-ghost btn-sm" onclick="createFunnelExpansion(\'' + escAttr(parent.id) + '\')">Funnel Expand (' + missingStages.join(', ') + ')</button>';
    }

    html += '<div class="winner-card stagger" style="--i:' + w + '" draggable="true" ondragstart="handleWinnerDragStart(event, ' + w + ')" ondragover="handleWinnerDragOver(event, ' + w + ')" ondrop="handleWinnerDrop(event, ' + w + ')">' +
      '<div class="winner-card-hdr">' +
        '<span class="drag-grip">&#10495;</span>' +
        '<span class="winner-name">' + esc(parent.formatName) + ' (' + esc(parent.id) + ')</span>' +
        '<span class="bdg ' + c.cls + '">' + esc(c.lbl) + '</span>' +
        '<span class="bdg ' + funnelCls + '">' + esc(parent.funnelStage) + '</span>' +
      '</div>' +
      '<div class="winner-meta">' +
        '<span class="winner-meta-item">Angle: ' + esc(parent.angle) + '</span>' +
        '<span class="winner-meta-item">Persona: ' + esc(parent.persona) + '</span>' +
      '</div>' +
      dotsHtml +
      (varRowsHtml ? '<div class="var-rows">' + varRowsHtml + '</div>' : '') +
      '<div class="winner-card-actions">' +
        '<button class="btn-add btn-sm" onclick="createVariationsForWinner(\'' + escAttr(parent.id) + '\')">Create Variations</button>' +
        funnelBtn +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

