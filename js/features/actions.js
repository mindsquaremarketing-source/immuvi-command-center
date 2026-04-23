// ── 4f. ACTION PLAN ──

function renderActionPlan() {
  var container = document.getElementById('actionsContainer');
  if (!container) return;

  var html = '';

  // ── Section 1: Manual Tasks ──
  html += '<div class="ap-section">';
  html += '<div class="ap-section-hdr">';
  html += '<span class="ap-section-title">Manual Tasks</span>';
  html += '<span class="ap-section-count">' + MANUAL_ACTIONS.length + '</span>';
  html += '</div>';

  if (MANUAL_ACTIONS.length === 0) {
    html += '<div class="empty-state" style="padding:24px 0">';
    html += '<div class="empty-state-icon">&#9654;</div>';
    html += '<div class="empty-state-text">No tasks yet.</div>';
    html += '<div class="empty-state-hint">Push tasks from the Creative Matrix using the &rarr; Action Plan button.</div>';
    html += '</div>';
  } else {
    for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
      var act = MANUAL_ACTIONS[i];
      var statusCls = act.liveStatus === 'Complete' || act.liveStatus === 'Winner' || act.liveStatus === 'Scale' ? 'done' :
                     (act.liveStatus === 'Testing' || act.liveStatus === 'In Production' || act.liveStatus === 'Ready to Launch' ? 'in-progress' : 'not-started');
      var borderColor = (act.liveStatus === 'Winner' || act.liveStatus === 'Scale' || act.liveStatus === 'Complete') ? 'var(--win)' :
        (act.liveStatus === 'Testing' || act.liveStatus === 'In Production') ? 'var(--test)' :
        (act.liveStatus === 'Ready to Launch') ? 'var(--ready)' :
        (act.liveStatus === 'Loser') ? 'var(--lose)' : 'var(--t3)';
      var funnelCls = (act.funnelStage || 'tof').toLowerCase();
      var isAiRec = act.tag === 'ai-recommended';

      // Find source AD for inspo/ref detection
      var srcAd = null;
      for (var si = 0; si < ADS.length; si++) {
        if (ADS[si].id === (act.sourceAdId || act.adId)) { srcAd = ADS[si]; break; }
      }

      // Inspo brief link
      var briefLink = '';
      if (srcAd && srcAd._fromInspoId) {
        var srcIns = INSPIRATIONS.find(function(ins){ return ins.id === srcAd._fromInspoId; });
        if (srcIns && srcIns._clickupDocPageUrl) {
          briefLink = '<a class="ap-brief-pill" href="' + escAttr(srcIns._clickupDocPageUrl) + '" target="_blank" rel="noopener">&#128204; Brief</a>';
        }
      }

      // Tracker reference link
      var refLink = '';
      if (srcAd && srcAd._fromTrackerAdId) {
        var refAd = ADS.find(function(a){ return a.id === srcAd._fromTrackerAdId; });
        if (refAd && refAd._clickupId) {
          refLink = '<a class="ap-ref-pill" href="https://app.clickup.com/t/' + escAttr(refAd._clickupId) + '" target="_blank" rel="noopener">&#128279; Ref Task</a>';
        }
      }

      // "From" pill — shows source format task this action was created from
      var fromLink = '';
      if (srcAd && !srcAd._fromInspoId) {
        var fromName = srcAd.formatName || srcAd.id;
        if (srcAd._clickupId) {
          fromLink = '<a class="ap-from-pill" href="https://app.clickup.com/t/' + escAttr(srcAd._clickupId) + '" target="_blank" rel="noopener" title="Open source format task in ClickUp">&#128204; From: ' + esc(fromName) + ' &#8599;</a>';
        } else {
          fromLink = '<span class="ap-from-pill no-link" title="Source format: ' + escAttr(fromName) + '">&#128204; From: ' + esc(fromName) + '</span>';
        }
      }

      // ClickUp link or create button.
      // Three mutually-exclusive render states:
      //   1. Task already in ClickUp  → open-link pill
      //   2. Create-in-flight          → animated spinner button (disabled — survives re-render mid-fetch)
      //   3. Idle                      → "+ ClickUp" create button
      var cuControl = '';
      if (act._clickupId) {
        cuControl = '<a class="ap-cu-done-link" href="https://app.clickup.com/t/' + escAttr(act._clickupId) + '" target="_blank" rel="noopener">&#8599; ClickUp</a>';
      } else if (act._cu_creating) {
        cuControl = '<button class="ap-cu-create-btn loading" id="ap_cu_btn_' + escAttr(act.id) + '" disabled aria-busy="true">Creating</button>';
      } else {
        cuControl = '<button class="ap-cu-create-btn" id="ap_cu_btn_' + escAttr(act.id) + '" onclick="createClickUpTaskFromAction(\'' + escAttr(act.id) + '\')">&#43; ClickUp</button>';
      }

      html += '<div class="ap-task-card stagger" style="--i:' + i + ';border-left-color:' + borderColor + '">';

      html += '<div style="display:flex;align-items:flex-start;gap:8px">';
      // Checkbox for bulk selection
      html += '<input type="checkbox" class="ap-card-cb" ' +
        (selectedActions.has(act.id) ? 'checked' : '') +
        ' onchange="toggleActionSelect(\'' + escAttr(act.id) + '\',this.checked)">';

      html += '<div class="ap-task-card-body" style="flex:1;min-width:0">';
      if (act.sourceAdId || act.adId) {
        html += '<div class="ap-task-adid">' + esc(act.sourceAdId || act.adId) + '</div>';
      }
      html += '<div class="ap-task-title">' + esc(act.title) + '</div>';
      html += '<div class="ap-task-meta">';
      if (act.angle) html += '<span class="ai-tag">' + esc(act.angle) + '</span>';
      if (act.persona) html += '<span style="font-size:0.6rem;color:var(--t3)">&times;</span><span class="ai-tag">' + esc(act.persona) + '</span>';
      if (act.format) html += '<span class="ai-tag">' + esc(act.format) + '</span>';
      if (act.funnelStage) html += '<span class="bdg ' + funnelCls + ' bdg-xs bdg-sm">' + esc(act.funnelStage) + '</span>';
      if (isAiRec) html += '<span class="ap-task-tag ai">AI Recommended</span>';
      if (briefLink) html += '&nbsp;' + briefLink;
      if (refLink)   html += '&nbsp;' + refLink;
      if (fromLink)  html += '&nbsp;' + fromLink;
      html += '</div>';
      html += '</div>';
      html += '</div>';

      html += '<div class="ap-task-controls">';
      html += cuControl;
      html += '<input type="date" class="date-inp" value="' + escAttr(act.dueDate || '') + '" onchange="updateManualActionDate(\'' + escAttr(act.id) + '\', this.value)" title="Due date">';
      html += '<select class="ap-status-sel ' + statusCls + '" onchange="updateManualActionStatus(\'' + escAttr(act.id) + '\', this.value)">';
      html += '<option value="Untested"' + (act.liveStatus === 'Untested' ? ' selected' : '') + '>Untested</option>';
      html += '<option value="Approved"' + (act.liveStatus === 'Approved' ? ' selected' : '') + '>Approved</option>';
      html += '<option value="In Production"' + (act.liveStatus === 'In Production' ? ' selected' : '') + '>In Production</option>';
      html += '<option value="Ready to Launch"' + (act.liveStatus === 'Ready to Launch' ? ' selected' : '') + '>Ready to Launch</option>';
      html += '<option value="Testing"' + (act.liveStatus === 'Testing' ? ' selected' : '') + '>Testing</option>';
      html += '<option value="Winner"' + (act.liveStatus === 'Winner' ? ' selected' : '') + '>Winner</option>';
      html += '<option value="Loser"' + (act.liveStatus === 'Loser' ? ' selected' : '') + '>Loser</option>';
      html += '<option value="Scale"' + (act.liveStatus === 'Scale' ? ' selected' : '') + '>Scale</option>';
      html += '<option value="Complete"' + (act.liveStatus === 'Complete' ? ' selected' : '') + '>Complete</option>';
      html += '</select>';
      html += '<button class="btn-icon btn-del btn-sm" onclick="deleteManualAction(\'' + escAttr(act.id) + '\')" title="Delete">&#128465;</button>';
      html += '</div>';

      html += '</div>';
    }
  }
  html += '</div>';

  // ── Section 2: Recommendations ──
  // Only show auto-generated actions (exclude manual ones already merged in)
  var recItems = [];
  for (var i = 0; i < ACTIONS.length; i++) {
    var a = ACTIONS[i];
    // Only auto-generated: no sourceAdId, or tag is not manual/variation/ai-recommended
    if (a.tag !== 'manual' && a.tag !== 'variation' && a.tag !== 'ai-recommended') {
      recItems.push(a);
    }
  }

  html += '<div class="ap-section">';
  html += '<div class="ap-section-hdr">';
  html += '<span class="ap-section-title">Recommendations</span>';
  html += '<span class="ap-section-count">' + recItems.length + '</span>';
  html += '</div>';

  if (recItems.length === 0) {
    html += '<div class="empty-state" style="padding:24px 0"><div class="empty-state-text">No recommendations</div></div>';
  } else {
    for (var i = 0; i < recItems.length; i++) {
      var rec = recItems[i];
      html += '<div class="rec-card stagger" style="--i:' + i + '">';
      html += '<span class="pip pip-' + escAttr(rec.priority) + '" style="margin-top:4px;flex-shrink:0"></span>';
      html += '<div class="rec-card-body">';
      html += '<div class="rec-card-title">' + esc(rec.title) + '</div>';
      html += '<div class="rec-card-reason">' + esc(rec.reason) + '</div>';
      html += '<div class="rec-card-tags">';
      if (rec.angle) html += '<span class="ai-tag">' + esc(rec.angle) + '</span>';
      if (rec.persona) html += '<span class="ai-tag">' + esc(rec.persona) + '</span>';
      if (rec.funnelStage) html += '<span class="bdg ' + (rec.funnelStage || '').toLowerCase() + ' bdg-xs bdg-sm">' + esc(rec.funnelStage) + '</span>';
      html += '</div>';
      html += '</div>';
      html += '<button class="btn-add-to-plan" onclick="addRecToplan(\'' + escAttr(rec.id) + '\')">Add to Plan</button>';
      html += '</div>';
    }
  }
  html += '</div>';

  container.innerHTML = html;

  // Update toolbar counts
  var countEl = document.getElementById('selectedCount');
  if (countEl) countEl.textContent = '0 selected';
  var btnDate = document.getElementById('btnBulkDate');
  var btnCU = document.getElementById('btnBulkClickUp');
  if (btnDate) btnDate.disabled = true;
  if (btnCU) btnCU.disabled = true;

  // Update tab count
  var el = document.getElementById('actionsCount');
  if (el) el.innerHTML = MANUAL_ACTIONS.length;
}

// Keep renderActions as alias for backward compat (bulk ops still call it)
function renderActions() { renderActionPlan(); }

function updateManualActionDate(id, date) {
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].id === id) {
      MANUAL_ACTIONS[i].dueDate = date;
      break;
    }
  }
  saveState();
}

function updateManualActionStatus(id, newStatus) {
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].id === id) {
      MANUAL_ACTIONS[i].liveStatus = newStatus;
      // Also update MATRIX_CELL_META actionStatus if sourceAdId exists
      var act = MANUAL_ACTIONS[i];
      if (act.sourceAdId && act.sourceAngle && act.sourcePersona) {
        var cellAdKey = act.sourceAdId + '||' + act.sourceAngle + '||' + act.sourcePersona;
        if (!MATRIX_CELL_META[cellAdKey]) MATRIX_CELL_META[cellAdKey] = {};
        MATRIX_CELL_META[cellAdKey].actionStatus = newStatus;
      }
      break;
    }
  }
  rebuildProdFromManual();
  renderActionPlan();
  renderProduction();
  saveState();
}

function deleteManualAction(id) {
  var act = null;
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].id === id) { act = MANUAL_ACTIONS[i]; break; }
  }
  if (!act) return;

  var sourceId = act.sourceAdId || act.adId;
  var sourceAd = null;
  if (sourceId) {
    for (var j = 0; j < ADS.length; j++) {
      if (ADS[j].id === sourceId) { sourceAd = ADS[j]; break; }
    }
  }

  var cuId = act._clickupId;

  // ── Fallback: if the action had no sourceAdId (e.g. AI recommendation pushed
  // to ClickUp and later synced back as a fresh AD), look up the AD by its
  // _clickupId. Without this, deleting such an action leaves an orphan AD in
  // the Creative Tracker / Matrix after sync. ────────────────────────────────
  if (!sourceAd && cuId) {
    for (var jj = 0; jj < ADS.length; jj++) {
      if (ADS[jj]._clickupId === cuId) { sourceAd = ADS[jj]; break; }
    }
  }

  // ── No source AD anywhere: just remove action + ClickUp task ─────────────
  if (!sourceAd) {
    _rememberManualActionDeletion(act.id, act._dbId);
    MANUAL_ACTIONS = MANUAL_ACTIONS.filter(function(a) { return a.id !== id; });
    // Full re-derive + render so Creative Tracker / Matrix / counts all update
    P = process(ADS);
    deriveWinners();
    genActions();
    buildCreativeUsageIndex();
    rebuildProdFromManual();
    populateFilterOptions();
    renderAll();
    saveState();
    if (cuId) {
      apiDeleteTask(cuId)
        .then(function() { toast('Action removed + ClickUp task deleted ✓', 'ok'); })
        .catch(function() { toast('Action removed (ClickUp delete failed)', 'warn'); });
    } else {
      toast('Action removed', 'ok');
    }
    return;
  }

  // ── Classify the source AD ────────────────────────────────────────────────────
  // A "tracker format" is an existing winning/testing format that has its own
  // independent ClickUp task (different from the action's production task).
  // These should NEVER be deleted when the action plan card is removed — they are
  // source material that lives independently in the Creative Tracker.
  var isTrackerFormat = !sourceAd._fromInspoId &&
                        sourceAd.taskType !== 'production' &&
                        sourceAd._clickupId && cuId &&
                        sourceAd._clickupId !== cuId;

  if (isTrackerFormat) {
    // ── Tracker-format source: delete production clone(s) + action only ─────────
    // Find any production clones spawned from this format (created via addFormatToCell)
    var cloneIds = [];
    ADS.forEach(function(a) {
      if (a.sourceFormatId === sourceAd.id && a.taskType === 'production') {
        cloneIds.push(a.id);
      }
    });

    // Collect ClickUp IDs to delete: action's own task + any clone tasks
    var cuIdsToDelete = [];
    if (cuId) cuIdsToDelete.push(cuId);
    cloneIds.forEach(function(cid) {
      var clone = null;
      for (var ci = 0; ci < ADS.length; ci++) {
        if (ADS[ci].id === cid) { clone = ADS[ci]; break; }
      }
      if (clone && clone._clickupId && clone._clickupId !== sourceAd._clickupId &&
          cuIdsToDelete.indexOf(clone._clickupId) === -1) {
        cuIdsToDelete.push(clone._clickupId);
      }
    });

    // Remove clones + the action from all arrays
    ADS            = ADS.filter(function(a) { return cloneIds.indexOf(a.id) === -1; });
    _rememberManualActionDeletion(act.id, act._dbId);
    MANUAL_ACTIONS = MANUAL_ACTIONS.filter(function(a) { return a.id !== id; });
    PROD           = PROD.filter(function(p) {
      return cloneIds.indexOf(p.adId) === -1 && cloneIds.indexOf(p.sourceAdId) === -1;
    });

    purgeOrphanedMatrixKeys();
    P = process(ADS);
    deriveWinners();
    genActions();
    buildCreativeUsageIndex();
    populateFilterOptions();
    renderAll();
    saveState();

    // Delete production ClickUp task(s) — never touch the original tracker task
    if (cuIdsToDelete.length > 0) {
      cuIdsToDelete.forEach(function(cid, idx) {
        setTimeout(function() { apiDeleteTask(cid).catch(function(){}); }, idx * 300);
      });
      toast('Action removed + ClickUp task deleted ✓', 'ok');
    } else {
      toast('Action removed', 'ok');
    }

  } else {
    // ── Inspo-sourced or production-clone: full cleanup via deleteAdEverywhere ───
    // deleteAdEverywhere handles: ADS removal, MANUAL_ACTIONS cleanup, PROD cleanup,
    // inspiration unlinking, ClickUp deletion, and full re-render.
    deleteAdEverywhere(sourceAd.id);
  }
}

function addRecToplan(recId) {
  var rec = null;
  for (var i = 0; i < ACTIONS.length; i++) {
    if (ACTIONS[i].id === recId) { rec = ACTIONS[i]; break; }
  }
  if (!rec) return;

  // Check if cell exists in CELL_CREATIVE_ASSIGNMENTS
  var cellKey = rec.angle + '||' + rec.persona;
  var cellExists = !!CELL_CREATIVE_ASSIGNMENTS[cellKey];
  if (!cellExists && rec.angle && rec.persona) {
    var confirmed = confirm('This will create the cell [' + rec.angle + ' \u00D7 ' + rec.persona + '] in the Creative Matrix. Continue?');
    if (!confirmed) return;
    // Add cell to assignments and angle-personas
    CELL_CREATIVE_ASSIGNMENTS[cellKey] = CELL_CREATIVE_ASSIGNMENTS[cellKey] || [];
    if (!ANGLE_PERSONAS[rec.angle]) ANGLE_PERSONAS[rec.angle] = [];
    if (ANGLE_PERSONAS[rec.angle].indexOf(rec.persona) === -1) {
      ANGLE_PERSONAS[rec.angle].push(rec.persona);
    }
  }

  var newAction = {
    id: 'manual-' + Date.now(),
    priority: rec.priority,
    title: rec.title,
    reason: rec.reason,
    tag: 'ai-recommended',
    angle: rec.angle,
    persona: rec.persona,
    format: rec.format || '',
    funnelStage: rec.funnelStage || 'TOF',
    dueDate: rec.dueDate || todayISO(),
    description: '',
    adId: null,
    adLink: '',
    _clickupId: null,
    liveStatus: 'Untested',
    sourceAdId: null,
    sourceAngle: rec.angle,
    sourcePersona: rec.persona
  };
  MANUAL_ACTIONS.push(newAction);
  genActions();
  rebuildProdFromManual();
  renderActionPlan();
  renderProduction();
  saveState();
  toast('Recommendation added to plan', 'ok');
}

function rebuildProdFromManual() {
  // Sync PROD array from MANUAL_ACTIONS
  PROD = [];
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    var act = MANUAL_ACTIONS[i];
    var prodStatus = (act.liveStatus === 'Winner' || act.liveStatus === 'Scale' || act.liveStatus === 'Complete' || act.liveStatus === 'Loser') ? 'complete' :
      (act.liveStatus === 'In Production' || act.liveStatus === 'Ready to Launch' || act.liveStatus === 'Testing') ? 'in progress' : 'to do';
    PROD.push({
      id: act.id,
      name: act.title,
      status: prodStatus,
      angle: act.angle || '',
      persona: act.persona || '',
      format: act.format || '',
      funnelStage: act.funnelStage || '',
      dueDate: act.dueDate || '',
      tag: act.tag || ''
    });
  }
}

