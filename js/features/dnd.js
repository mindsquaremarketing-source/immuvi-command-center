// ============================================================
//  8. DRAG & DROP — VARIATION BUILDER
// ============================================================

function handleChipDragStart(event, type, value) {
  dragState = { type: type, value: value };
  event.dataTransfer.setData('text/plain', type + ':' + value);
  event.dataTransfer.effectAllowed = 'copy';
  if (event.target && event.target.classList) {
    event.target.classList.add('dragging');
    setTimeout(function () { event.target.classList.remove('dragging'); }, 200);
  }
}

function handleSlotDragOver(event) {
  event.preventDefault();
  var slot = event.currentTarget;
  var slotType = slot.getAttribute('data-slot');
  if (dragState && dragState.type === slotType) {
    slot.classList.add('active');
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleSlotDragLeave(event) {
  event.currentTarget.classList.remove('active');
}

function handleSlotDrop(event) {
  event.preventDefault();
  var slot = event.currentTarget;
  slot.classList.remove('active');

  var slotType = slot.getAttribute('data-slot');
  if (!dragState || dragState.type !== slotType) return;

  builderSlots[slotType] = dragState.value;

  // Render chip in slot
  slot.innerHTML = '<div class="chip ' + escAttr(slotType) + ' filled-chip">' + esc(dragState.value) +
    ' <button class="chip-clear" onclick="clearSlot(\'' + escAttr(slotType) + '\')">&times;</button></div>';
  slot.classList.add('filled');

  dragState = null;

  // Check if all 3 filled
  if (builderSlots.angle && builderSlots.persona && builderSlots.format) {
    document.getElementById('varBuilderAction').classList.remove('hidden');
  }
}

function clearSlot(slotType) {
  builderSlots[slotType] = null;
  var slotId = 'slot' + slotType.charAt(0).toUpperCase() + slotType.slice(1);
  var slot = document.getElementById(slotId);
  var labels = { angle: 'Drop Angle', persona: 'Drop Persona', format: 'Drop Format' };
  slot.innerHTML = '<span class="drop-slot-label">' + labels[slotType] + '</span>';
  slot.classList.remove('filled');
  document.getElementById('varBuilderAction').classList.add('hidden');
}

function createFromBuilder() {
  if (!builderSlots.angle || !builderSlots.persona || !builderSlots.format) {
    toast('Fill all slots first', 'err');
    return;
  }

  var funnelStage = document.getElementById('varBuilderFunnel').value;

  var newAd = {
    id: nextSerialId(),
    formatName: builderSlots.format,
    adLink: '',
    driveLink: '',
    adType: 'Video',
    funnelStage: funnelStage,
    status: 'Untested',
    angle: builderSlots.angle,
    persona: builderSlots.persona,
    parentAdId: null,
    variationNumber: null
  };
  ADS.push(newAd);

  PROD.push({
    id: 'prod-' + (PROD.length + 1),
    name: newAd.formatName + ' - ' + newAd.angle + ' x ' + newAd.persona + ' (' + funnelStage + ')',
    status: 'to do',
    angle: newAd.angle,
    persona: newAd.persona,
    format: newAd.formatName,
    dueDate: todayISO()
  });

  // Clear all slots
  clearSlot('angle');
  clearSlot('persona');
  clearSlot('format');

  P = process(ADS);
  deriveWinners();
  genActions();
  populateFilterOptions();
  renderAll();
  toast('Task created: ' + newAd.id);
}

// ============================================================
//  9. DRAG & DROP — PRODUCTION KANBAN
// ============================================================

function handleProdCardDragStart(event, id) {
  dragState = { type: 'prod', id: id };
  event.dataTransfer.setData('text/plain', 'prod:' + id);
  event.dataTransfer.effectAllowed = 'move';
  if (event.target && event.target.classList) {
    event.target.classList.add('drag-lifting');
    setTimeout(function () { event.target.classList.remove('drag-lifting'); }, 100);
  }
}

function handleProdDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
  event.dataTransfer.dropEffect = 'move';
}

function handleProdDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function handleProdDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');

  if (!dragState || dragState.type !== 'prod') return;

  var newStatus = event.currentTarget.getAttribute('data-status');
  if (!newStatus) return;

  // Map kanban column data-status to MANUAL_ACTIONS liveStatus
  var liveStatusMap = { 'to do': 'Untested', 'in progress': 'In Production', 'complete': 'Complete' };
  var newLiveStatus = liveStatusMap[newStatus] || 'Untested';

  var found = false;
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].id === dragState.id) {
      MANUAL_ACTIONS[i].liveStatus = newLiveStatus;
      // Update matrix cell meta if applicable
      var act = MANUAL_ACTIONS[i];
      if (act.sourceAdId && act.sourceAngle && act.sourcePersona) {
        var cellAdKey = act.sourceAdId + '||' + act.sourceAngle + '||' + act.sourcePersona;
        if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
        MATRIX_CELL_META[cellAdKey].actionStatus = newLiveStatus;
      }
      found = true;
      break;
    }
  }

  dragState = null;
  if (found) {
    renderActionPlan();
    renderProduction();
    saveState();
    toast('Moved to ' + (PROD_LABELS[newStatus] || newStatus));
  }
}

// ============================================================
//  10. DRAG & DROP — WINNER REORDER
// ============================================================

function handleWinnerDragStart(event, idx) {
  dragState = { type: 'winner', idx: idx };
  event.dataTransfer.setData('text/plain', 'winner:' + idx);
  event.dataTransfer.effectAllowed = 'move';
}

function handleWinnerDragOver(event, idx) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleWinnerDrop(event, targetIdx) {
  event.preventDefault();
  if (!dragState || dragState.type !== 'winner') return;
  var fromIdx = dragState.idx;
  if (fromIdx === targetIdx) { dragState = null; return; }

  // Splice and reinsert
  var item = WINNERS.splice(fromIdx, 1)[0];
  WINNERS.splice(targetIdx, 0, item);
  dragState = null;
  renderWinners();
}

