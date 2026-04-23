// ── 4g. PRODUCTION ──

function renderProduction() {
  var queueBody = document.getElementById('prodQueueBody');
  var progressBody = document.getElementById('prodProgressBody');
  var doneBody = document.getElementById('prodDoneBody');
  var queueCount = document.getElementById('prodQueueCount');
  var progressCount = document.getElementById('prodProgressCount');
  var doneCount = document.getElementById('prodDoneCount');

  // Derive columns directly from MANUAL_ACTIONS
  var inQueue = [];    // Untested, Approved
  var inProd = [];     // In Production, Ready to Launch, Testing
  var done = [];       // Winner, Scale, Complete, Loser
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    var act = MANUAL_ACTIONS[i];
    var st = act.liveStatus || 'Untested';
    if (st === 'Winner' || st === 'Scale' || st === 'Complete' || st === 'Loser') {
      done.push(act);
    } else if (st === 'In Production' || st === 'Ready to Launch' || st === 'Testing') {
      inProd.push(act);
    } else {
      inQueue.push(act); // Untested, Approved
    }
  }

  function renderProdCards(items) {
    if (items.length === 0) {
      return '<div class="prod-empty">No tasks here</div>';
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      var funnelCls = (t.funnelStage || t.format || '').toLowerCase();
      var isAiRec = t.tag === 'ai-recommended';
      html += '<div class="prod-card stagger" style="--i:' + i + '" draggable="true" ondragstart="handleProdCardDragStart(event, \'' + escAttr(t.id) + '\')">';
      html += '<div class="prod-card-name">' + esc(t.title || t.name || '') + '</div>';
      html += '<div class="prod-card-meta">';
      if (t.angle) html += '<span class="bdg-sm" style="font-size:0.6rem">' + esc(t.angle) + '</span>';
      if (t.persona) html += '<span style="font-size:0.6rem;color:var(--t3)">&times;</span><span class="bdg-sm" style="font-size:0.6rem">' + esc(t.persona) + '</span>';
      html += '</div>';
      html += '<div class="prod-card-tags">';
      if (t.format) html += '<span class="bdg-sm" style="font-size:0.58rem;color:var(--t2)">' + esc(t.format) + '</span>';
      if (t.funnelStage) html += '<span class="bdg ' + (t.funnelStage || '').toLowerCase() + ' bdg-xs" style="font-size:0.58rem">' + esc(t.funnelStage) + '</span>';
      if (isAiRec) html += '<span style="font-size:0.58rem;color:var(--notstart);background:rgba(139,92,246,0.1);padding:1px 5px;border-radius:8px">AI Rec</span>';
      html += '</div>';
      if (t.dueDate) html += '<div class="prod-card-due mono" style="font-size:0.62rem;margin-top:4px">Due: ' + esc(t.dueDate) + '</div>';
      html += '</div>';
    }
    return html;
  }

  if (queueBody) queueBody.innerHTML = renderProdCards(inQueue);
  if (progressBody) progressBody.innerHTML = renderProdCards(inProd);
  if (doneBody) doneBody.innerHTML = renderProdCards(done);
  if (queueCount) queueCount.textContent = inQueue.length;
  if (progressCount) progressCount.textContent = inProd.length;
  if (doneCount) doneCount.textContent = done.length;

  // Sync PROD array too
  rebuildProdFromManual();
}


// ====================================================================
// [split.py] next slice from source file begins below
// ====================================================================

// ============================================================
//  12. PRODUCTION MANAGEMENT
// ============================================================

function openAddProdTask() {
  var angOpts = '';
  for (var i = 0; i < ANGLES.length; i++) {
    angOpts += '<option value="' + escAttr(ANGLES[i].name) + '">' + esc(ANGLES[i].name) + '</option>';
  }
  var perOpts = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    perOpts += '<option value="' + escAttr(PERSONAS[i].name) + '">' + esc(PERSONAS[i].name) + '</option>';
  }
  var fmtOpts = '';
  for (var i = 0; i < SD_FORMATS.length; i++) {
    fmtOpts += '<option value="' + escAttr(SD_FORMATS[i]) + '">' + esc(SD_FORMATS[i]) + '</option>';
  }

  var body =
    '<div class="form-group"><label>Task Name</label><input type="text" class="f-inp" id="npName" placeholder="Production task name"></div>' +
    '<div class="form-group"><label>Angle</label><select class="f-inp" id="npAngle">' + angOpts + '</select></div>' +
    '<div class="form-group"><label>Persona</label><select class="f-inp" id="npPersona">' + perOpts + '</select></div>' +
    '<div class="form-group"><label>Format</label><select class="f-inp" id="npFormat">' + fmtOpts + '</select></div>' +
    '<div class="form-group"><label>Due Date</label><input type="date" class="f-inp" id="npDue" value="' + escAttr(todayISO()) + '"></div>';

  var foot = '<button class="btn-add" onclick="saveNewProdTask()">Create Task</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Add Production Task', body, foot);
}

function saveNewProdTask() {
  var name = document.getElementById('npName').value.trim();
  if (!name) { toast('Enter a task name', 'err'); return; }

  PROD.push({
    id: 'prod-' + (PROD.length + 1),
    name: name,
    status: 'to do',
    angle: document.getElementById('npAngle').value,
    persona: document.getElementById('npPersona').value,
    format: document.getElementById('npFormat').value,
    dueDate: document.getElementById('npDue').value
  });

  closeModal();
  renderProduction();
  updateTabCounts();
  toast('Production task created');
}

function openEditProdTask(id) {
  var task = null;
  for (var i = 0; i < PROD.length; i++) {
    if (PROD[i].id === id) { task = PROD[i]; break; }
  }
  if (!task) return;

  var stOpts = '';
  for (var i = 0; i < PROD_STATUSES.length; i++) {
    stOpts += '<option value="' + escAttr(PROD_STATUSES[i]) + '"' + (PROD_STATUSES[i] === task.status ? ' selected' : '') + '>' + esc(PROD_LABELS[PROD_STATUSES[i]] || PROD_STATUSES[i]) + '</option>';
  }

  var angOpts = '';
  for (var i = 0; i < ANGLES.length; i++) {
    angOpts += '<option value="' + escAttr(ANGLES[i].name) + '"' + (ANGLES[i].name === task.angle ? ' selected' : '') + '>' + esc(ANGLES[i].name) + '</option>';
  }
  var perOpts = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    perOpts += '<option value="' + escAttr(PERSONAS[i].name) + '"' + (PERSONAS[i].name === task.persona ? ' selected' : '') + '>' + esc(PERSONAS[i].name) + '</option>';
  }
  var fmtOpts = '';
  for (var i = 0; i < SD_FORMATS.length; i++) {
    fmtOpts += '<option value="' + escAttr(SD_FORMATS[i]) + '"' + (SD_FORMATS[i] === task.format ? ' selected' : '') + '>' + esc(SD_FORMATS[i]) + '</option>';
  }

  var body =
    '<div class="form-group"><label>Task Name</label><input type="text" class="f-inp" id="epName" value="' + escAttr(task.name) + '"></div>' +
    '<div class="form-group"><label>Status</label><select class="f-inp" id="epStatus">' + stOpts + '</select></div>' +
    '<div class="form-group"><label>Angle</label><select class="f-inp" id="epAngle">' + angOpts + '</select></div>' +
    '<div class="form-group"><label>Persona</label><select class="f-inp" id="epPersona">' + perOpts + '</select></div>' +
    '<div class="form-group"><label>Format</label><select class="f-inp" id="epFormat">' + fmtOpts + '</select></div>' +
    '<div class="form-group"><label>Due Date</label><input type="date" class="f-inp" id="epDue" value="' + escAttr(task.dueDate || '') + '"></div>';

  var foot = '<button class="btn-add" onclick="saveEditProdTask(\'' + escAttr(id) + '\')">Save</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Edit Production Task', body, foot);
}

function saveEditProdTask(id) {
  for (var i = 0; i < PROD.length; i++) {
    if (PROD[i].id === id) {
      PROD[i].name = document.getElementById('epName').value.trim() || PROD[i].name;
      PROD[i].status = document.getElementById('epStatus').value;
      PROD[i].angle = document.getElementById('epAngle').value;
      PROD[i].persona = document.getElementById('epPersona').value;
      PROD[i].format = document.getElementById('epFormat').value;
      PROD[i].dueDate = document.getElementById('epDue').value;
      break;
    }
  }
  closeModal();
  renderProduction();
  updateTabCounts();
  toast('Production task updated');
}

function deleteProdTask(id) {
  PROD = PROD.filter(function (t) { return t.id !== id; });
  renderProduction();
  updateTabCounts();
  toast('Production task deleted');
}

