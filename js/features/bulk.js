// ============================================================
//  11. BULK OPERATIONS
// ============================================================

function toggleSelectAll(checked) {
  selectedActions = new Set();
  if (checked) {
    for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
      if (!MANUAL_ACTIONS[i]._clickupId) {
        selectedActions.add(MANUAL_ACTIONS[i].id);
      }
    }
  }
  var countEl = document.getElementById('selectedCount');
  if (countEl) countEl.textContent = selectedActions.size + ' selected';
  var btnCU   = document.getElementById('btnBulkClickUp');
  var btnDate = document.getElementById('btnBulkDate');
  if (btnCU)   btnCU.disabled   = selectedActions.size === 0;
  if (btnDate) btnDate.disabled = selectedActions.size === 0;
  renderActionPlan();
  // Re-check the select all box
  var saEl = document.getElementById('selectAllActions');
  if (saEl) saEl.checked = checked;
}

function toggleActionSelect(id, checked) {
  if (checked) {
    selectedActions.add(id);
  } else {
    selectedActions.delete(id);
  }
  var countEl = document.getElementById('selectedCount');
  if (countEl) countEl.textContent = selectedActions.size + ' selected';
  var btnCU   = document.getElementById('btnBulkClickUp');
  var btnDate = document.getElementById('btnBulkDate');
  var hasUnlinked = false;
  selectedActions.forEach(function(sid) {
    var act = MANUAL_ACTIONS.find(function(a){ return a.id === sid; });
    if (act && !act._clickupId) hasUnlinked = true;
  });
  if (btnCU)   btnCU.disabled   = !hasUnlinked;
  if (btnDate) btnDate.disabled = selectedActions.size === 0;
}

function updateActionDate(id, date) {
  for (var i = 0; i < ACTIONS.length; i++) {
    if (ACTIONS[i].id === id) {
      ACTIONS[i].dueDate = date;
      break;
    }
  }
}

function openBulkDateModal() {
  var body = '<div class="form-group"><label>Set due date for ' + selectedActions.size + ' selected actions</label><input type="date" class="f-inp" id="bulkDateInput" value="' + escAttr(todayISO()) + '"></div>';
  var foot = '<button class="btn-add" onclick="applyBulkDate()">Apply to ' + selectedActions.size + ' tasks</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Bulk Set Date', body, foot);
}

function applyBulkDate() {
  var date = document.getElementById('bulkDateInput').value;
  if (!date) { toast('Select a date', 'err'); return; }

  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (selectedActions.has(MANUAL_ACTIONS[i].id)) {
      MANUAL_ACTIONS[i].dueDate = date;
    }
  }
  closeModal();
  saveState();
  renderActionPlan();
  toast('Date updated for ' + selectedActions.size + ' actions');
}

// ── Build ClickUp task description — full table + linked sections ──
function buildTaskDescription(ad) {
  var lines = [];

  // Always-on table rows
  var tableRows = [
    ['Angle',   ad.angle   || '—'],
    ['Persona', ad.persona || '—'],
    ['Funnel',  ad.funnelStage || '—'],
    ['Ad Type', ad.adType  || '—']
  ];
  // Conditional rows — only add if value is not empty
  if (ad.hookType)          tableRows.push(['Hook Type',           ad.hookType]);
  if (ad.creativeStructure) tableRows.push(['Creative Structure',  ad.creativeStructure]);
  if (ad.productionStyle)   tableRows.push(['Production Style',    ad.productionStyle]);
  if (ad.creativeUSP)       tableRows.push(['Creative USP',        ad.creativeUSP]);
  if (ad.adLink)            tableRows.push(['Inspiration Link',    ad.adLink]);
  if (ad.driveLink)         tableRows.push(['Drive Link',          ad.driveLink]);

  // Build markdown table
  lines.push('📋 CREATIVE BRIEF');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  for (var i = 0; i < tableRows.length; i++) {
    lines.push('| ' + tableRows[i][0] + ' | ' + tableRows[i][1] + ' |');
  }
  lines.push('');

  // Creative Hypothesis
  if (ad.creativeHypothesis && ad.creativeHypothesis.trim()) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🧠 Creative Hypothesis');
    lines.push(ad.creativeHypothesis.trim());
    lines.push('');
  }

  // Inspo scenario: add doc brief link
  if (ad._fromInspoId) {
    var ins = INSPIRATIONS.find(function(ins){ return ins.id === ad._fromInspoId; });
    if (ins) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (ins._clickupDocPageUrl) {
        lines.push('📌 Inspiration Brief: ' + ins._clickupDocPageUrl);
      }
      if (ins.sourceUrl) {
        lines.push('🔗 Source Ad: ' + ins.sourceUrl);
      }
    }
  }

  // Tracker-ref scenario: add reference task link
  var isTrackerRef = !ad._fromInspoId && ad._clickupId;
  if (!isTrackerRef && ad._fromTrackerAdId) {
    var refAd = ADS.find(function(a){ return a.id === ad._fromTrackerAdId; });
    if (refAd && refAd._clickupId) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('🔗 Reference Task: https://app.clickup.com/t/' + refAd._clickupId);
    }
  }

  return lines.join('\n');
}

// Per-card: create a single action plan task in ClickUp
function createClickUpTaskFromAction(actionId, onDone) {
  if (!CFG.key) { toast('Enter ClickUp API key first', 'err'); return; }

  var act = null;
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (MANUAL_ACTIONS[i].id === actionId) { act = MANUAL_ACTIONS[i]; break; }
  }
  if (!act) return;
  if (act._clickupId) { toast('Already in ClickUp', 'warn'); return; }
  // Action-level in-flight lock — DOM disable alone isn't enough because the
  // Action Plan can re-render mid-fetch (saveState, auto-sync, realtime echo),
  // reviving an enabled button. This guard survives any re-render because
  // it lives on the action object, not the button.
  if (act._cu_creating) { return; }
  act._cu_creating = true;

  var activeProd = getActiveProduct();
  var listId = activeProd && activeProd.clickupListId;
  if (!listId) { toast('Link a ClickUp list first', 'err'); return; }

  // Find source AD
  var sourceAd = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === (act.sourceAdId || act.adId)) { sourceAd = ADS[i]; break; }
  }

  // Save source AD's existing ClickUp ID BEFORE anything overwrites it
  // (for tracker-format tasks this is the parent task's ID — used for linking + description)
  var prevSourceClickupId = sourceAd ? (sourceAd._clickupId || null) : null;
  var isTrackerSource = sourceAd && !sourceAd._fromInspoId;

  // Build description
  // For tracker-source production clones: build from a synthetic AD that merges the
  // production clone's fields with the source format's drive link as "Inspiration Drive".
  // This avoids the clone inheriting the source's driveLink as its own production Drive Link.
  var descAd = sourceAd;
  if (isTrackerSource && sourceAd && sourceAd.sourceFormatId) {
    // Production clone created by addFormatToCell — look up the original tracker format
    var _srcFmt = null;
    for (var fi = 0; fi < ADS.length; fi++) {
      if (ADS[fi].id === sourceAd.sourceFormatId) { _srcFmt = ADS[fi]; break; }
    }
    // Build a merged descriptor: use clone's own fields, plus source format's driveLink
    // stored as _sourceFormatDriveLink (set in addFormatToCell) as the inspiration reference
    descAd = {
      angle:              sourceAd.angle,
      persona:            sourceAd.persona,
      funnelStage:        sourceAd.funnelStage,
      adType:             sourceAd.adType,
      hookType:           sourceAd.hookType,
      creativeStructure:  sourceAd.creativeStructure,
      productionStyle:    sourceAd.productionStyle,
      creativeUSP:        sourceAd.creativeUSP,
      creativeHypothesis: sourceAd.creativeHypothesis,
      adLink:             sourceAd.adLink || (_srcFmt && _srcFmt.adLink) || '',
      driveLink:          '',     // production clone has no Drive Link yet (team fills after shooting)
      _inspirationDriveLink: sourceAd._sourceFormatDriveLink || (_srcFmt && _srcFmt.driveLink) || '',
      _fromInspoId:       sourceAd._fromInspoId || null,
      _fromTrackerAdId:   sourceAd._fromTrackerAdId || null
    };
  }
  var desc = descAd ? buildTaskDescription(descAd) : (act.reason || '');

  // For tracker-source tasks: append Inspiration Drive link (source format's driveLink)
  // and the reference task URL to the description.
  if (isTrackerSource && desc) {
    if (descAd && descAd._inspirationDriveLink) {
      desc += '\n| Inspiration Drive | ' + descAd._inspirationDriveLink + ' |';
    }
    if (prevSourceClickupId) {
      desc += '\n| Reference Task | https://app.clickup.com/t/' + prevSourceClickupId + ' |';
    }
  }

  // Build custom fields (best-effort — skipped if IDs not configured)
  var customFields = buildFieldsPayload({
    angle:      act.angle || '',
    persona:    act.persona || '',
    funnelStage: act.funnelStage || '',
    adType:     (sourceAd && sourceAd.adType) || '',
    adLink:     (sourceAd && sourceAd.adLink) || ''
  });

  var dueTs = act.dueDate ? new Date(act.dueDate).getTime() : null;

  // Replace the idle button with the animated loading button for immediate feedback
  // (the next renderActionPlan() call will rebuild it identically via act._cu_creating).
  var btn = document.getElementById('ap_cu_btn_' + actionId);
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Creating';
    btn.setAttribute('aria-busy', 'true');
  }

  // Step 1 — create task; include description in the initial POST so it's reliably sent
  // (a separate PUT via corsproxy can silently fail, causing blank descriptions)
  var createPayload = { name: act.title };
  if (desc) createPayload.description = desc;
  if (dueTs) createPayload.due_date = dueTs;
  if (customFields && customFields.length > 0) createPayload.custom_fields = customFields;

  apiCreateTask(listId, createPayload)
  .then(function(resp) {
    if (!resp || !resp.id) { throw new Error('No task ID returned'); }

    var newId = resp.id;

    // No separate PUT needed — description was included in the POST above

    // Link _clickupId on the action
    act._clickupId = newId;
    // Only overwrite sourceAd._clickupId if it had none before
    // (inspo ADs are fresh — tracker-format ADs already have the tracker task's ID)
    if (sourceAd && !sourceAd._clickupId) {
      sourceAd._clickupId = newId;
      // IMPORTANT: also set clickupTaskId so _adToRow persists it to the
      // clickup_task_id DB column. _adToRow prefers clickupTaskId over
      // _clickupId, and _rowToAd reads FROM clickup_task_id on load — so
      // setting only _clickupId left the link ephemeral and the next sync
      // created a duplicate ad from the same ClickUp task.
      sourceAd.clickupTaskId = newId;
    }

    // Sync the task name back to the local AD so Creative Tracker + Matrix show
    // the proper full name (e.g. "AR-062-12345") instead of the inherited source name
    if (sourceAd && act.title && sourceAd.formatName !== act.title) {
      sourceAd.formatName = act.title;
      // Also update the Task Name shown in the matrix cell detail
      if (act.sourceAngle && act.sourcePersona) {
        var metaKey = sourceAd.id + '||' + act.sourceAngle + '||' + act.sourcePersona;
        if (MATRIX_CELL_META[metaKey]) {
          MATRIX_CELL_META[metaKey].uniqueName = act.title;
        }
      }
    }

    // Promote to production task — makes it visible in the "🎬 Production" view
    // of the Creative Tracker. Once a ClickUp task has been pushed from the Action
    // Plan for this AD, the AD IS a production task regardless of where it started.
    // Previously this was gated on !sourceAd.taskType, which meant plain tracker-
    // format ADs (taskType:'format') never got promoted — they'd be created in
    // ClickUp but never appear under the Production filter.
    if (sourceAd) {
      sourceAd.taskType = 'production';
    }

    // Tag this as a production task — sourced from action-plan push
    // sourceFormatId is the tracker AD that spawned this action-plan item
    PRODUCTION_CLICKUP_IDS[newId] = (sourceAd && sourceAd.id) || '';
    saveState();

    // Step 3 — push each custom field individually via pushFieldToClickUp
    // pushProxy forces _clickupId = newId so fields always go to the NEW task,
    // not to the tracker-format AD's existing ClickUp task.
    // For angle/persona/funnelStage: prefer act values (from the matrix cell) over sourceAd
    // since the action was created for a specific cell that may differ from sourceAd's stored values.
    if (sourceAd) {
      var pushProxy = { _clickupId: newId, id: sourceAd.id };
      var fieldsToSync = [
        ['angle',            act.angle            || sourceAd.angle],
        ['persona',          act.persona          || sourceAd.persona],
        ['funnelStage',      act.funnelStage      || sourceAd.funnelStage],
        ['adType',           sourceAd.adType],
        ['hookType',         sourceAd.hookType],
        ['creativeStructure',sourceAd.creativeStructure],
        ['productionStyle',  sourceAd.productionStyle],
        ['adLink',           sourceAd.adLink]
      ];

      console.log('[fieldSync] newId:', newId, '| sourceAd:', sourceAd.id, '| values:', {
        angle: fieldsToSync[0][1], persona: fieldsToSync[1][1],
        funnelStage: fieldsToSync[2][1], adType: fieldsToSync[3][1],
        hookType: fieldsToSync[4][1]
      });

      var doFieldPushes = function() {
        var fieldMap = getActiveFieldMap();
        console.log('[fieldSync] fieldMap keys:', fieldMap ? Object.keys(fieldMap) : 'NULL');
        fieldsToSync.forEach(function(pair, idx) {
          var fieldKey = pair[0];
          var value    = pair[1];
          if (!value) { console.log('[fieldSync] skip', fieldKey, '(empty)'); return; }
          setTimeout(function() {
            console.log('[fieldSync] pushing', fieldKey, '=', value, '→ task', newId);
            pushFieldToClickUp(pushProxy, fieldKey, value)
              .then(function(){ console.log('[fieldSync] ✓', fieldKey); })
              .catch(function(e){ console.warn('[fieldSync] ✗', fieldKey, e && e.message); });
          }, idx * 150);
        });
      };

      var existingMap = getActiveFieldMap();
      if (existingMap && Object.keys(existingMap).length > 0) {
        doFieldPushes();
      } else {
        console.log('[fieldSync] No field map — fetching from ClickUp first...');
        fetchAndStoreFieldMap(listId).then(function() {
          console.log('[fieldSync] Field map loaded, pushing fields...');
          doFieldPushes();
        }).catch(function() {
          doFieldPushes();
        });
      }
    }

    // Scenario 1 — Inspo-sourced AD: link the inspiration brief doc to this task
    if (sourceAd && sourceAd._fromInspoId) {
      var ins1 = INSPIRATIONS.find(function(x){ return x.id === sourceAd._fromInspoId; });
      if (ins1) {
        var briefUrl = ins1._clickupDocPageUrl || ins1.clickup_doc_page_url || '';
        var briefDocId = ins1._clickupDocId || ins1.clickup_doc_id || '';
        var srcUrl   = ins1.sourceUrl || ins1.source_url || '';
        console.log('[S1] inspo:', ins1.id, '| briefUrl:', briefUrl, '| docId:', briefDocId, '| srcUrl:', srcUrl);

        // Attempt 1 — ClickUp v3 relations API (supports task→doc linking)
        if (briefDocId) {
          apiFetch('/task/' + newId + '/link/' + briefDocId, { method: 'POST', body: {} })
            .then(function(){ console.log('[S1] v2 link created ✓'); })
            .catch(function() {
              // v2 link failed (expected for doc IDs) — try v3 relations API via our proxy
              fetch(apiUrlV3('/task/' + newId + '/relation'), {
                method: 'POST',
                headers: { 'Authorization': CFG.key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ relates_to_id: briefDocId, relates_to_type: 'doc' })
              }).then(function(r){ console.log('[S1] v3 relation status:', r.status); })
                .catch(function(e){ console.warn('[S1] v3 relation failed:', e && e.message); });
            });
        }

        // Attempt 2 — push brief URL to a dedicated "Brief Link" URL custom field if it exists
        if (briefUrl) {
          var fieldMap1 = getActiveFieldMap();
          if (fieldMap1 && (fieldMap1['briefLink'] || fieldMap1['inspoDoc'])) {
            var bKey = fieldMap1['briefLink'] ? 'briefLink' : 'inspoDoc';
            pushFieldToClickUp(pushProxy, bKey, briefUrl).catch(function(){});
          }
        }

        // Attempt 3 — post a comment (always works, shows URL in task activity)
        var commentLines = [];
        if (briefUrl) commentLines.push('📌 Inspiration Brief: ' + briefUrl);
        if (srcUrl)   commentLines.push('🔗 Source Ad: ' + srcUrl);
        if (commentLines.length > 0) {
          apiFetch('/task/' + newId + '/comment', {
            method: 'POST',
            body: { comment_text: commentLines.join('\n') }
          }).then(function(){ console.log('[S1] Comment posted ✓'); })
            .catch(function(e){ console.warn('[S1] Comment failed:', e && e.message); });
        }

        if (!briefUrl && !srcUrl) {
          console.warn('[S1] Inspiration', ins1.id, 'has no doc URL or source URL — nothing to link');
        }
      } else {
        console.warn('[S1] Inspiration not found for id:', sourceAd._fromInspoId);
      }
    }

    // Scenario 2 — Tracker-format AD: link new task to the tracker format's ClickUp task
    if (sourceAd && !sourceAd._fromInspoId && prevSourceClickupId && prevSourceClickupId !== newId) {
      var srcTaskUrl = 'https://app.clickup.com/t/' + prevSourceClickupId;
      var newTaskUrl = 'https://app.clickup.com/t/' + newId;
      var srcFmtName = sourceAd.formatName || sourceAd.id;

      // 1. Create ClickUp relationship (shows in Related Items panel)
      apiFetch('/task/' + newId + '/link/' + prevSourceClickupId, { method: 'POST', body: {} })
        .then(function(){ console.log('[S2] Task relationship created ✓'); })
        .catch(function(e){ console.warn('[S2] Task link failed:', e && e.message); });

      // 2. Comment on the NEW task — links back to the source format
      apiFetch('/task/' + newId + '/comment', {
        method: 'POST',
        body: { comment_text: '📎 Created from format: ' + srcFmtName + '\n' + srcTaskUrl }
      }).catch(function(){});

      // 3. Comment on the SOURCE task — announces the new production task
      apiFetch('/task/' + prevSourceClickupId + '/comment', {
        method: 'POST',
        body: { comment_text: '📋 Production task created: ' + newTaskUrl }
      }).catch(function(){});

    } else if (sourceAd && !sourceAd._fromInspoId && !prevSourceClickupId) {
      console.warn('[S2] Source AD has no prior ClickUp task — cannot create relationship');
    }

    // Release the in-flight lock before re-rendering so the idle "↗ ClickUp"
    // link (driven by act._clickupId) wins the render.
    act._cu_creating = false;
    saveState();
    renderActionPlan();
    // Also refresh that specific Creative Tracker row
    P = process(ADS);
    buildCreativeUsageIndex();
    renderCreatives();
    toast('Task created in ClickUp ✓', 'ok');
    if (onDone) onDone(true);
  })
  .catch(function(err) {
    // IMPORTANT: clear the action-level lock so a subsequent retry can proceed.
    // Without this, a failed create would leave the action permanently stuck.
    act._cu_creating = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.removeAttribute('aria-busy');
      btn.textContent = '+ ClickUp';
    }
    // If a re-render occurred during the fetch, this call restores the idle button.
    renderActionPlan();
    toast('ClickUp error: ' + (err.message || String(err)), 'err');
    if (onDone) onDone(false);
  });
}

// Bulk create — loops through selected actions
function bulkCreateClickUp() {
  if (!CFG.key) { toast('Enter ClickUp API key first', 'err'); return; }

  var toCreate = [];
  for (var i = 0; i < MANUAL_ACTIONS.length; i++) {
    if (selectedActions.has(MANUAL_ACTIONS[i].id) && !MANUAL_ACTIONS[i]._clickupId) {
      toCreate.push(MANUAL_ACTIONS[i].id);
    }
  }
  if (toCreate.length === 0) { toast('No unlinked actions selected', 'warn'); return; }

  var prog = document.getElementById('apBulkProgress');
  var completed = 0;
  var errors = 0;

  function next(idx) {
    if (idx >= toCreate.length) {
      if (prog) prog.textContent = '';
      toast(completed + ' task' + (completed !== 1 ? 's' : '') + ' created' + (errors > 0 ? ', ' + errors + ' failed' : ''), 'ok');
      selectedActions.clear();
      renderActionPlan();
      return;
    }
    if (prog) prog.textContent = 'Creating ' + (idx + 1) + '/' + toCreate.length + '...';
    createClickUpTaskFromAction(toCreate[idx], function(ok) {
      if (ok) completed++; else errors++;
      setTimeout(function(){ next(idx + 1); }, 200);
    });
  }
  next(0);
}

