// ============================================================
//  5. DATA MUTATION FUNCTIONS
// ============================================================

// Auto-derive angle status from the highest-priority status of its ads
function deriveAngleStatus(angleName) {
  var ads = ADS.filter(function(a) { return a.angle === angleName && !a.parentAdId; });
  if (ads.length === 0) return 'Untested';
  var statuses = ads.map(function(a) { return a.status || 'Untested'; });
  var priority = ['Winner', 'Scale', 'Testing', 'Ready to Launch', 'In Production', 'Approved', 'Complete', 'Loser', 'Untested'];
  for (var pi = 0; pi < priority.length; pi++) {
    if (statuses.indexOf(priority[pi]) !== -1) return priority[pi];
  }
  return 'Untested';
}

// Auto-derive persona status from the highest-priority status of its ads
function derivePersonaStatus(personaName) {
  var ads = ADS.filter(function(a) { return a.persona === personaName && !a.parentAdId; });
  if (ads.length === 0) return 'Untested';
  var statuses = ads.map(function(a) { return a.status || 'Untested'; });
  var priority = ['Winner', 'Scale', 'Testing', 'Ready to Launch', 'In Production', 'Approved', 'Complete', 'Loser', 'Untested'];
  for (var pi = 0; pi < priority.length; pi++) {
    if (statuses.indexOf(priority[pi]) !== -1) return priority[pi];
  }
  return 'Untested';
}

function updateAngleStatus(idx, newStatus) {
  ANGLES[idx].status = newStatus;
  P = process(ADS);
  renderAll();
  saveState();
}

function updateAngleNotes(idx, text) {
  ANGLES[idx].notes = text;
  saveState();
}

function updateAngleName(idx, text) {
  var newName = text.trim();
  if (!newName || newName === ANGLES[idx].name) return;
  var oldName = ANGLES[idx].name;
  ANGLES[idx].name = newName;
  // Sync to ADS
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].angle === oldName) ADS[i].angle = newName;
  }
  // Sync to INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (INSPIRATIONS[i].angle === oldName) INSPIRATIONS[i].angle = newName;
  }
  // Sync to ANGLE_PERSONAS
  if (ANGLE_PERSONAS[oldName] !== undefined) {
    ANGLE_PERSONAS[newName] = ANGLE_PERSONAS[oldName];
    delete ANGLE_PERSONAS[oldName];
  }
  // Sync to CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META
  renameAngleInMatrixKeys(oldName, newName);
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();
  toast('Angle renamed to "' + newName + '"');
}

function addAngleRow() {
  ANGLES.push({
    id: 'ang-' + (ANGLES.length + 1),
    name: 'New Angle',
    status: 'Untested',
    sourceLink: '',
    notes: '',
    _localNew: true   // so saveProductData doesn't prune this before first persist
  });
  renderAngles();
  updateTabCounts();
  saveState();
  toast('Angle added');
}

function deleteAngle(idx) {
  var name = ANGLES[idx].name;
  if (!confirm('Delete angle "' + name + '"? This will clear it from all creatives and inspirations.')) return;
  ANGLES.splice(idx, 1);
  // Clear from ADS
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].angle === name) ADS[i].angle = '';
  }
  // Clear from INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (INSPIRATIONS[i].angle === name) INSPIRATIONS[i].angle = '';
  }
  // Remove from ANGLE_PERSONAS + matrix keys
  delete ANGLE_PERSONAS[name];
  deleteAngleFromMatrixKeys(name);
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();
  toast('Deleted angle: ' + name);
}

function openEditAngle(idx) {
  var ang = ANGLES[idx];
  var body = '<div class="form-group"><label>Angle Name</label><input type="text" class="f-inp" id="editAngleName" value="' + escAttr(ang.name) + '"></div>' +
    '<div class="form-group"><label>Source Link</label><input type="text" class="f-inp" id="editAngleLink" value="' + escAttr(ang.sourceLink || '') + '"></div>' +
    '<div class="form-group"><label>Notes</label><textarea class="f-inp" id="editAngleNotes" rows="3">' + esc(ang.notes || '') + '</textarea></div>';
  var foot = '<button class="btn-add" onclick="saveEditAngle(' + idx + ')">Save</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Edit Angle', body, foot);
}

function saveEditAngle(idx) {
  var oldName = ANGLES[idx].name;
  var newName = document.getElementById('editAngleName').value.trim() || oldName;
  ANGLES[idx].name = newName;
  ANGLES[idx].sourceLink = document.getElementById('editAngleLink').value.trim();
  ANGLES[idx].notes = document.getElementById('editAngleNotes').value.trim();
  // Cascade rename to ADS, INSPIRATIONS, ANGLE_PERSONAS, matrix keys
  if (newName !== oldName) {
    for (var i = 0; i < ADS.length; i++) {
      if (ADS[i].angle === oldName) ADS[i].angle = newName;
    }
    for (var i = 0; i < INSPIRATIONS.length; i++) {
      if (INSPIRATIONS[i].angle === oldName) INSPIRATIONS[i].angle = newName;
    }
    if (ANGLE_PERSONAS[oldName] !== undefined) {
      ANGLE_PERSONAS[newName] = ANGLE_PERSONAS[oldName];
      delete ANGLE_PERSONAS[oldName];
    }
    renameAngleInMatrixKeys(oldName, newName);
  }
  closeModal();
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();
  toast(newName !== oldName ? 'Angle renamed to "' + newName + '"' : 'Angle updated');
}

function updatePersonaStatus(idx, newStatus) {
  PERSONAS[idx].status = newStatus;
  P = process(ADS);
  renderAll();
  saveState();
}

function updatePersonaNotes(idx, text) {
  PERSONAS[idx].notes = text;
  saveState();
}

function updatePersonaName(idx, text) {
  var newName = text.trim();
  if (!newName || newName === PERSONAS[idx].name) return;
  var oldName = PERSONAS[idx].name;
  PERSONAS[idx].name = newName;
  // Sync to ADS
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].persona === oldName) ADS[i].persona = newName;
  }
  // Sync to INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (INSPIRATIONS[i].persona === oldName) INSPIRATIONS[i].persona = newName;
  }
  // Sync to ANGLE_PERSONAS
  for (var key in ANGLE_PERSONAS) {
    var idx2 = ANGLE_PERSONAS[key].indexOf(oldName);
    if (idx2 !== -1) ANGLE_PERSONAS[key][idx2] = newName;
  }
  // Sync to CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META
  renamePersonaInMatrixKeys(oldName, newName);
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();
  toast('Persona renamed to "' + newName + '"');
}

function addPersonaRow() {
  PERSONAS.push({
    id: 'per-' + (PERSONAS.length + 1),
    name: 'New Persona',
    status: 'Untested',
    sourceLink: '',
    notes: '',
    _localNew: true   // so saveProductData doesn't prune this before first persist
  });
  renderPersonas();
  updateTabCounts();
  saveState();
  toast('Persona added');
}

function deletePersona(idx) {
  var name = PERSONAS[idx].name;
  if (!confirm('Delete persona "' + name + '"? This will clear it from all creatives and inspirations.')) return;
  PERSONAS.splice(idx, 1);
  // Clear from ADS
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].persona === name) ADS[i].persona = '';
  }
  // Clear from INSPIRATIONS
  for (var i = 0; i < INSPIRATIONS.length; i++) {
    if (INSPIRATIONS[i].persona === name) INSPIRATIONS[i].persona = '';
  }
  // Remove from ANGLE_PERSONAS
  for (var key in ANGLE_PERSONAS) {
    var idx2 = ANGLE_PERSONAS[key].indexOf(name);
    if (idx2 !== -1) ANGLE_PERSONAS[key].splice(idx2, 1);
  }
  // Remove from CELL_CREATIVE_ASSIGNMENTS + MATRIX_CELL_META
  deletePersonaFromMatrixKeys(name);
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  renderAll();
  saveInspirations();
  saveState();
  toast('Deleted persona: ' + name);
}

function openEditPersona(idx) {
  var per = PERSONAS[idx];
  var body = '<div class="form-group"><label>Persona Name</label><input type="text" class="f-inp" id="editPersonaName" value="' + escAttr(per.name) + '"></div>' +
    '<div class="form-group"><label>Source Link</label><input type="text" class="f-inp" id="editPersonaLink" value="' + escAttr(per.sourceLink || '') + '"></div>' +
    '<div class="form-group"><label>Notes</label><textarea class="f-inp" id="editPersonaNotes" rows="3">' + esc(per.notes || '') + '</textarea></div>';
  var foot = '<button class="btn-add" onclick="saveEditPersona(' + idx + ')">Save</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Edit Persona', body, foot);
}

function saveEditPersona(idx) {
  var oldName = PERSONAS[idx].name;
  var newName = document.getElementById('editPersonaName').value.trim() || oldName;
  PERSONAS[idx].name = newName;
  PERSONAS[idx].sourceLink = document.getElementById('editPersonaLink').value.trim();
  PERSONAS[idx].notes = document.getElementById('editPersonaNotes').value.trim();
  // Cascade rename to ADS, INSPIRATIONS, ANGLE_PERSONAS, matrix keys
  if (newName !== oldName) {
    for (var i = 0; i < ADS.length; i++) {
      if (ADS[i].persona === oldName) ADS[i].persona = newName;
    }
    for (var i = 0; i < INSPIRATIONS.length; i++) {
      if (INSPIRATIONS[i].persona === oldName) INSPIRATIONS[i].persona = newName;
    }
    for (var key in ANGLE_PERSONAS) {
      var idx2 = ANGLE_PERSONAS[key].indexOf(oldName);
      if (idx2 !== -1) ANGLE_PERSONAS[key][idx2] = newName;
    }
    renamePersonaInMatrixKeys(oldName, newName);
  }
  closeModal();
  P = process(ADS);
  deriveWinners();
  genActions();
  renderAll();
  saveInspirations();
  saveState();
  toast(newName !== oldName ? 'Persona renamed to "' + newName + '"' : 'Persona updated');
}

function updateCreativeStatus(idx, newStatus) {
  ADS[idx].status = newStatus;
  P = process(ADS);
  deriveWinners();
  genActions();
  renderAll();
  saveState();
}

// ── TAXONOMY RICH PICKER ──────────────────────────────────────
// Renders a custom dropdown showing option name + description
function buildTaxoPicker(pickerId, options, descMap, placeholder) {
  var html = '<div class="taxo-picker" id="tp_' + escAttr(pickerId) + '">' +
    '<input type="hidden" id="' + escAttr(pickerId) + '" value="">' +
    '<button type="button" class="taxo-trigger" onclick="toggleTaxoPicker(\'' + escAttr(pickerId) + '\')">' +
      '<span class="taxo-trigger-label">' +
        '<span class="taxo-trigger-name" id="tp_name_' + escAttr(pickerId) + '" style="color:var(--t3)">' + esc(placeholder || 'Select...') + '</span>' +
        '<span class="taxo-trigger-desc" id="tp_desc_' + escAttr(pickerId) + '"></span>' +
      '</span>' +
      '<span class="taxo-trigger-arrow">▼</span>' +
    '</button>' +
    '<div class="taxo-dropdown" id="tp_drop_' + escAttr(pickerId) + '" style="display:none">';
  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    var desc = descMap ? (descMap[opt] || '') : '';
    html += '<div class="taxo-option" onclick="selectTaxoOption(\'' + escJs(pickerId) + '\',\'' + escJs(opt) + '\',\'' + escJs(desc) + '\')">' +
      '<span class="taxo-option-name">' + esc(opt) + '</span>' +
      (desc ? '<span class="taxo-option-desc">' + esc(desc) + '</span>' : '') +
      '</div>';
  }
  html += '</div></div>';
  return html;
}

function toggleTaxoPicker(pickerId) {
  var drop = document.getElementById('tp_drop_' + pickerId);
  var trigger = document.querySelector('#tp_' + pickerId + ' .taxo-trigger');
  if (!drop) return;
  var isOpen = drop.style.display !== 'none';
  // Close all other pickers first
  document.querySelectorAll('.taxo-dropdown').forEach(function(d) { d.style.display = 'none'; });
  document.querySelectorAll('.taxo-trigger').forEach(function(t) { t.classList.remove('open'); });
  if (!isOpen) {
    drop.style.display = 'block';
    if (trigger) trigger.classList.add('open');
  }
}

function selectTaxoOption(pickerId, value, desc) {
  var input = document.getElementById(pickerId);
  var nameEl = document.getElementById('tp_name_' + pickerId);
  var descEl = document.getElementById('tp_desc_' + pickerId);
  var drop = document.getElementById('tp_drop_' + pickerId);
  var trigger = document.querySelector('#tp_' + pickerId + ' .taxo-trigger');
  if (input) input.value = value;
  if (nameEl) { nameEl.textContent = value; nameEl.style.color = ''; }
  if (descEl) descEl.textContent = desc || '';
  if (drop) drop.style.display = 'none';
  if (trigger) trigger.classList.remove('open');
  // Update selected state in list
  var opts = drop ? drop.querySelectorAll('.taxo-option') : [];
  opts.forEach(function(o) {
    o.classList.toggle('selected', o.querySelector('.taxo-option-name').textContent === value);
  });
}

// Close picker when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.taxo-picker')) {
    document.querySelectorAll('.taxo-dropdown').forEach(function(d) { d.style.display = 'none'; });
    document.querySelectorAll('.taxo-trigger').forEach(function(t) { t.classList.remove('open'); });
  }
});

// ── Merge Angles Modal ─────────────────────────────────────────────────────────
function openMergeAnglesModal() {
  if (ANGLES.length < 2) { toast('Need at least 2 angles to merge', 'warn'); return; }
  _renderMergeModal('angle');
}

function openMergePersonasModal() {
  if (PERSONAS.length < 2) { toast('Need at least 2 personas to merge', 'warn'); return; }
  _renderMergeModal('persona');
}

function _renderMergeModal(type) {
  var items = type === 'angle' ? ANGLES : PERSONAS;
  var title = type === 'angle' ? '⇢ Merge Angles' : '⇢ Merge Personas';

  // Build checklist
  var listHtml = '';
  items.forEach(function(item, idx) {
    var adCount = ADS.filter(function(a){ return a[type] === item.name && !a.parentAdId; }).length;
    listHtml +=
      '<div class="merge-check-row" onclick="_mergeToggleCheck(this,\'merge_cb_' + idx + '\',\'' + type + '\')">' +
        '<input type="checkbox" id="merge_cb_' + idx + '" value="' + escAttr(item.name) + '" onchange="_mergeOnCheck(\'' + type + '\')" onclick="event.stopPropagation()">' +
        '<label for="merge_cb_' + idx + '">' + esc(item.name) + '</label>' +
        '<span class="merge-row-meta">' + adCount + ' creative' + (adCount !== 1 ? 's' : '') + '</span>' +
      '</div>';
  });

  var body =
    '<p style="font-size:0.76rem;color:var(--t2);margin:0 0 10px">Select <strong>2 or more</strong> similar ' + type + 's to combine into one. All creatives, matrix cells, inspirations and ClickUp tasks update automatically.</p>' +
    '<div class="merge-checklist" id="mergeCheckList">' + listHtml + '</div>' +
    '<div id="mergeSurvivorSection" style="display:none">' +
      '<div class="merge-survivor-section">' +
        '<div class="merge-survivor-label">Which name should survive?</div>' +
        '<div class="merge-survivor-list" id="mergeSurvivorList"></div>' +
        '<div class="merge-custom-row">' +
          '<label>Or type a new name:</label>' +
          '<input type="text" class="f-inp" id="mergeCustomName" placeholder="Custom merged name…" oninput="_mergeUpdatePreview(\'' + type + '\')" style="flex:1;font-size:0.78rem;padding:5px 8px">' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="mergePreviewBox"></div>';

  var foot =
    '<button class="btn-add" id="mergeCancelBtn" onclick="_executeMergeFromModal(\'' + type + '\')">Merge →</button>' +
    ' <button class="btn-ghost" onclick="closeModal()">Cancel</button>';

  openModal(title, body, foot);
}

function _mergeToggleCheck(row, cbId, type) {
  var cb = document.getElementById(cbId);
  if (!cb) return;
  cb.checked = !cb.checked;
  _mergeOnCheck(type || 'angle');
}

function _mergeOnCheck(type) {
  var checked = Array.from(document.querySelectorAll('#mergeCheckList input[type=checkbox]:checked'));
  var survivorSection = document.getElementById('mergeSurvivorSection');
  var survivorList    = document.getElementById('mergeSurvivorList');
  if (!survivorSection || !survivorList) return;

  if (checked.length < 2) {
    survivorSection.style.display = 'none';
    document.getElementById('mergePreviewBox').innerHTML = '';
    return;
  }

  survivorSection.style.display = '';

  // Build radio list from checked items
  var radioHtml = '';
  checked.forEach(function(cb, i) {
    var name = cb.value;
    var adCount = ADS.filter(function(a){ return a[type] === name && !a.parentAdId; }).length;
    radioHtml +=
      '<div class="merge-survivor-row' + (i === 0 ? ' selected' : '') + '" onclick="_mergeSelectSurvivor(this)">' +
        '<input type="radio" name="mergeSurvivor" value="' + escAttr(name) + '"' + (i === 0 ? ' checked' : '') + ' onchange="_mergeUpdatePreview(\'' + type + '\')" onclick="event.stopPropagation()">' +
        '<label>' + esc(name) + '</label>' +
        '<span class="merge-row-meta">' + adCount + ' creative' + (adCount !== 1 ? 's' : '') + '</span>' +
      '</div>';
  });
  survivorList.innerHTML = radioHtml;
  _mergeUpdatePreview(type);
}

function _mergeSelectSurvivor(row) {
  // Toggle selected class + check the radio inside
  document.querySelectorAll('.merge-survivor-row').forEach(function(r){ r.classList.remove('selected'); });
  row.classList.add('selected');
  var radio = row.querySelector('input[type=radio]');
  if (radio) { radio.checked = true; }
  // clear custom name input
  var customIn = document.getElementById('mergeCustomName');
  if (customIn) customIn.value = '';
  // detect type from modal title text
  var modalTitleEl = document.getElementById('modalTitle');
  var t = modalTitleEl && modalTitleEl.textContent.indexOf('Persona') !== -1 ? 'persona' : 'angle';
  _mergeUpdatePreview(t);
}

function _mergeUpdatePreview(type) {
  var checked = Array.from(document.querySelectorAll('#mergeCheckList input[type=checkbox]:checked'));
  if (checked.length < 2) return;

  var customName = (document.getElementById('mergeCustomName') || {}).value || '';
  var survivorRadio = document.querySelector('input[name=mergeSurvivor]:checked');
  var survivorName = customName.trim() || (survivorRadio ? survivorRadio.value : checked[0].value);

  var losingNames = checked.map(function(cb){ return cb.value; }).filter(function(n){ return n !== survivorName; });
  if (customName.trim()) losingNames = checked.map(function(cb){ return cb.value; }); // all become losers if custom name

  // Count affected creatives
  var affectedAds = ADS.filter(function(a){ return losingNames.indexOf(a[type]) !== -1 && !a.parentAdId; });
  var affectedCu  = affectedAds.filter(function(a){ return !!a._clickupId; });

  var preview = document.getElementById('mergePreviewBox');
  if (!preview) return;
  if (losingNames.length === 0) { preview.innerHTML = ''; return; }

  preview.innerHTML =
    '<div class="merge-preview-box">' +
      '<strong>What will happen:</strong><br>' +
      '• ' + losingNames.map(function(n){ return '"' + esc(n) + '"'; }).join(', ') + ' will be deleted<br>' +
      '• All their creatives (' + affectedAds.length + ') → reassigned to <strong>"' + esc(survivorName) + '"</strong><br>' +
      '• Matrix cells merged automatically<br>' +
      (affectedCu.length > 0 ? '• ' + affectedCu.length + ' ClickUp task' + (affectedCu.length !== 1 ? 's' : '') + ' will be updated' : '') +
    '</div>';
}

function _executeMergeFromModal(type) {
  var checked = Array.from(document.querySelectorAll('#mergeCheckList input[type=checkbox]:checked'));
  if (checked.length < 2) { toast('Select at least 2 ' + type + 's to merge', 'warn'); return; }

  var customName = (document.getElementById('mergeCustomName') || {}).value || '';
  var survivorRadio = document.querySelector('input[name=mergeSurvivor]:checked');
  var survivorName = customName.trim() || (survivorRadio ? survivorRadio.value : '');

  if (!survivorName) { toast('Pick a survivor name first', 'warn'); return; }

  var allCheckedNames = checked.map(function(cb){ return cb.value; });
  var losingNames = allCheckedNames.filter(function(n){ return n !== survivorName; });

  // If custom name — all checked become losers, survivor is brand new
  if (customName.trim()) {
    losingNames = allCheckedNames;
    // Insert survivor into ANGLES/PERSONAS array if not already present
    if (type === 'angle') {
      var exists = ANGLES.some(function(a){ return a.name === survivorName; });
      if (!exists) ANGLES.push({ id: 'ang-merge-' + Date.now(), name: survivorName, status: 'Untested', sourceLink: '', notes: '', _localNew: true });
    } else {
      var exists = PERSONAS.some(function(p){ return p.name === survivorName; });
      if (!exists) PERSONAS.push({ id: 'per-merge-' + Date.now(), name: survivorName, status: 'Untested', sourceLink: '', notes: '', _localNew: true });
    }
  }

  if (losingNames.length === 0) { toast('Survivor must be different from the only selected item', 'warn'); return; }

  closeModal();

  if (type === 'angle') {
    executeMergeAngles(losingNames, survivorName);
  } else {
    executeMergePersonas(losingNames, survivorName);
  }
}

function openAddCreative() {
  // Ad type options
  var atOpts = '';
  for (var i = 0; i < AD_TYPES.length; i++) {
    atOpts += '<option value="' + escAttr(AD_TYPES[i]) + '">' + esc(AD_TYPES[i]) + '</option>';
  }
  // Funnel options
  var fnOpts = '';
  for (var i = 0; i < FUNNEL_STAGES.length; i++) {
    fnOpts += '<option value="' + escAttr(FUNNEL_STAGES[i]) + '">' + esc(FUNNEL_STAGES[i]) + '</option>';
  }
  // Status options
  var stOpts = '';
  for (var i = 0; i < STATUSES.length; i++) {
    stOpts += '<option value="' + escAttr(STATUSES[i]) + '">' + esc(STATUSES[i]) + '</option>';
  }
  // Angle options
  var angOpts = '';
  for (var i = 0; i < ANGLES.length; i++) {
    angOpts += '<option value="' + escAttr(ANGLES[i].name) + '">' + esc(ANGLES[i].name) + '</option>';
  }
  // Persona options
  var perOpts = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    perOpts += '<option value="' + escAttr(PERSONAS[i].name) + '">' + esc(PERSONAS[i].name) + '</option>';
  }

  var body =
    '<div class="form-group"><label>Ad Name / Title</label><input type="text" class="f-inp" id="ncFormatName" placeholder="e.g. POV angle video"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="form-group" style="margin:0"><label>Inspiration Link <span style="color:var(--t3);font-weight:400">— reference / inspo URL</span></label><input type="text" class="f-inp" id="ncAdLink" placeholder="https://facebook.com/ads/..."></div>' +
      '<div class="form-group" style="margin:0"><label>Drive Link <span style="color:var(--t3);font-weight:400">— GDrive production file</span></label><input type="text" class="f-inp" id="ncDriveLink" placeholder="https://drive.google.com/..."></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">' +
      '<div class="form-group" style="margin:0"><label>Ad Type</label><select class="f-inp" id="ncAdType">' + atOpts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Funnel Stage</label><select class="f-inp" id="ncFunnelStage">' + fnOpts + '</select></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">' +
      '<div class="form-group" style="margin:0"><label>Angle</label><select class="f-inp" id="ncAngle">' + angOpts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Persona</label><select class="f-inp" id="ncPersona">' + perOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><label>Status</label><select class="f-inp" id="ncStatus">' + stOpts + '</select></div>' +
    '<div style="border-top:1px solid var(--b);padding-top:14px;margin-top:4px">' +
      '<div style="font-size:0.7rem;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Creative Taxonomy</div>' +
      '<div class="form-group"><label>Creative Structure <span style="color:var(--t3);font-weight:400">— the skeleton of this ad</span></label>' +
        buildTaxoPicker('ncCreativeStructure', getFieldNames('creativeStructure'), getFieldDescMap('creativeStructure'), 'Select structure...') +
      '</div>' +
      '<div class="form-group"><label>Hook Type <span style="color:var(--t3);font-weight:400">— what the first 3 seconds do</span></label>' +
        buildTaxoPicker('ncHookType', getFieldNames('hookType'), getFieldDescMap('hookType'), 'Select hook type...') +
      '</div>' +
      '<div class="form-group"><label>Production Style <span style="color:var(--t3);font-weight:400">— how it was made</span></label>' +
        buildTaxoPicker('ncProductionStyle', getFieldNames('productionStyle'), getFieldDescMap('productionStyle'), 'Select production style...') +
      '</div>' +
      '<div class="form-group"><label>Creative USP <span style="color:var(--t3);font-weight:400">— the unique selling point of this creative</span></label>' +
        '<input type="text" class="f-inp" id="ncCreativeUSP" placeholder="e.g. Airplane Window Text \u2014 hooked by curiosity gap" />' +
      '</div>' +
      '<div class="form-group"><label>Winning Element <span style="color:var(--t3);font-weight:400">— what made it win (optional)</span></label>' +
        '<input type="text" class="f-inp" id="ncWinningElement" placeholder="e.g. Strong visual hook, relatable scenario" />' +
      '</div>' +
    '</div>';

  var foot = '<button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-add" onclick="saveNewCreative()">Save Creative</button>';
  openModal('Add Creative', body, foot);
}

function saveNewCreative() {
  var manualName = document.getElementById('ncFormatName').value.trim();
  var newAd = {
    id: nextSerialId(),
    formatName: manualName || generateTaskName('manual'),
    adLink: document.getElementById('ncAdLink').value.trim(),
    driveLink: document.getElementById('ncDriveLink') ? document.getElementById('ncDriveLink').value.trim() : '',
    adType: document.getElementById('ncAdType').value,
    funnelStage: document.getElementById('ncFunnelStage').value,
    status: document.getElementById('ncStatus').value,
    angle: document.getElementById('ncAngle').value,
    persona: document.getElementById('ncPersona').value,
    creativeStructure: document.getElementById('ncCreativeStructure') ? document.getElementById('ncCreativeStructure').value : '',
    hookType: document.getElementById('ncHookType') ? document.getElementById('ncHookType').value : '',
    productionStyle: document.getElementById('ncProductionStyle') ? document.getElementById('ncProductionStyle').value : '',
    creativeUSP: document.getElementById('ncCreativeUSP') ? document.getElementById('ncCreativeUSP').value.trim() : '',
    winningElement: document.getElementById('ncWinningElement') ? document.getElementById('ncWinningElement').value.trim() : '',
    parentAdId: null,
    variationNumber: null,
    adOrigin: 'Manual'
  };
  ADS.push(newAd);
  closeModal();
  P = process(ADS);
  deriveWinners();
  genActions();
  populateFilterOptions();
  renderAll();
  toast('Creative ' + newAd.id + ' created');
}

// ── Central delete: removes AD + all linked actions + production cards + ClickUp tasks ──
function deleteAdEverywhere(adId) {
  var ad = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === adId) { ad = ADS[i]; break; }
  }

  var cuIdsToDelete = [];

  // Collect ClickUp task IDs: the AD itself
  if (ad && ad._clickupId) cuIdsToDelete.push(ad._clickupId);

  // Collect IDs of production clones spawned from this AD (they get deleted too)
  var cloneIds = [];
  for (var ci = 0; ci < ADS.length; ci++) {
    if (ADS[ci].sourceFormatId === adId) cloneIds.push(ADS[ci].id);
  }

  // Collect ClickUp task IDs from action plan items sourced from this AD OR its clones
  var allSourceIds = [adId].concat(cloneIds);
  for (var j = 0; j < MANUAL_ACTIONS.length; j++) {
    var act = MANUAL_ACTIONS[j];
    if (allSourceIds.indexOf(act.sourceAdId) !== -1 || allSourceIds.indexOf(act.adId) !== -1) {
      if (act._clickupId && cuIdsToDelete.indexOf(act._clickupId) === -1) {
        cuIdsToDelete.push(act._clickupId);
      }
    }
  }

  // Also collect ClickUp IDs from the clones themselves
  for (var ci2 = 0; ci2 < ADS.length; ci2++) {
    if (cloneIds.indexOf(ADS[ci2].id) !== -1 && ADS[ci2]._clickupId &&
        cuIdsToDelete.indexOf(ADS[ci2]._clickupId) === -1) {
      cuIdsToDelete.push(ADS[ci2]._clickupId);
    }
  }

  // If this AD was spawned from an inspiration, unlink it —
  // keep the inspiration intact but revert its status to "Classified"
  // (only if no other ADs still reference that inspiration)
  var unlinkedInspoId = null;
  if (ad && ad._fromInspoId) {
    unlinkedInspoId = ad._fromInspoId;
  }

  // Remove from all local arrays — includes the AD itself, its clones, and all related actions
  ADS            = ADS.filter(function(a)  { return a.id !== adId && a.sourceFormatId !== adId; });

  // Filter 1: explicit ID match — remove actions whose sourceAdId/adId is in the deleted set
  // Tombstone each action being removed so realtime merge doesn't resurrect them.
  MANUAL_ACTIONS.forEach(function(a){
    if (allSourceIds.indexOf(a.sourceAdId) !== -1 || allSourceIds.indexOf(a.adId) !== -1) {
      _rememberManualActionDeletion(a.id, a._dbId);
    }
  });
  MANUAL_ACTIONS = MANUAL_ACTIONS.filter(function(a) {
    return allSourceIds.indexOf(a.sourceAdId) === -1 && allSourceIds.indexOf(a.adId) === -1;
  });
  // Filter 2: orphan cleanup — belt-and-suspenders, removes any action whose source AD
  // no longer exists in ADS (catches all edge cases not covered by Filter 1).
  // AI recommendations have sourceAdId=null and adId=null — those are always kept.
  var _survivingAdIds = {};
  ADS.forEach(function(a) { _survivingAdIds[a.id] = true; });
  MANUAL_ACTIONS.forEach(function(a){
    var srcId = a.sourceAdId != null ? a.sourceAdId : (a.adId != null ? a.adId : null);
    if (srcId != null && _survivingAdIds[srcId] !== true) {
      _rememberManualActionDeletion(a.id, a._dbId);
    }
  });
  MANUAL_ACTIONS = MANUAL_ACTIONS.filter(function(a) {
    var srcId = a.sourceAdId != null ? a.sourceAdId : (a.adId != null ? a.adId : null);
    if (srcId == null) return true; // AI recommendation — keep it
    return _survivingAdIds[srcId] === true;
  });

  PROD           = PROD.filter(function(p) {
    return allSourceIds.indexOf(p.adId) === -1 && allSourceIds.indexOf(p.sourceAdId) === -1;
  });

  // Clean up any orphaned entries in CELL_CREATIVE_ASSIGNMENTS / MATRIX_CELL_META
  // (IDs that are no longer in ADS) — prevents ghost entries in the matrix
  purgeOrphanedMatrixKeys();

  // Unlink inspiration: revert status if nothing else still references it
  if (unlinkedInspoId) {
    var stillLinked = ADS.some(function(a) { return a._fromInspoId === unlinkedInspoId; });
    if (!stillLinked) {
      var ins = INSPIRATIONS.find(function(i) { return i.id === unlinkedInspoId; });
      if (ins && ins.status === 'Testing') {
        ins.status = 'Classified';
        saveInspirations();
      }
    }
  }

  // Re-process and render everything
  P = process(ADS);
  deriveWinners();
  genActions();
  buildCreativeUsageIndex();
  populateFilterOptions();
  renderAll();
  saveState();

  // Fire ClickUp deletes (fire-and-forget, staggered to avoid rate limits)
  if (cuIdsToDelete.length > 0) {
    cuIdsToDelete.forEach(function(cuId, idx) {
      setTimeout(function() { apiDeleteTask(cuId).catch(function(){}); }, idx * 300);
    });
    var suffix = unlinkedInspoId ? ' · inspiration unlinked' : '';
    toast('Deleted ' + adId + ' everywhere (' + cuIdsToDelete.length + ' ClickUp task' + (cuIdsToDelete.length > 1 ? 's' : '') + ')' + suffix, 'ok');
  } else {
    var suffix2 = unlinkedInspoId ? ' · inspiration unlinked' : '';
    toast('Deleted ' + adId + ' everywhere' + suffix2, 'ok');
  }
}

function deleteCreative(id) {
  deleteAdEverywhere(id);
}

function openEditCreative(id) {
  var ad = null;
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === id) { ad = ADS[i]; break; }
  }
  if (!ad) return;

  var fmtOpts = '';
  for (var i = 0; i < SD_FORMATS.length; i++) {
    fmtOpts += '<option value="' + escAttr(SD_FORMATS[i]) + '"' + (SD_FORMATS[i] === ad.formatName ? ' selected' : '') + '>' + esc(SD_FORMATS[i]) + '</option>';
  }
  var atOpts = '';
  for (var i = 0; i < AD_TYPES.length; i++) {
    atOpts += '<option value="' + escAttr(AD_TYPES[i]) + '"' + (AD_TYPES[i] === ad.adType ? ' selected' : '') + '>' + esc(AD_TYPES[i]) + '</option>';
  }
  var fnOpts = '';
  for (var i = 0; i < FUNNEL_STAGES.length; i++) {
    fnOpts += '<option value="' + escAttr(FUNNEL_STAGES[i]) + '"' + (FUNNEL_STAGES[i] === ad.funnelStage ? ' selected' : '') + '>' + esc(FUNNEL_STAGES[i]) + '</option>';
  }
  var stOpts = '';
  for (var i = 0; i < STATUSES.length; i++) {
    stOpts += '<option value="' + escAttr(STATUSES[i]) + '"' + (STATUSES[i] === ad.status ? ' selected' : '') + '>' + esc(STATUSES[i]) + '</option>';
  }
  var angOpts = '';
  for (var i = 0; i < ANGLES.length; i++) {
    angOpts += '<option value="' + escAttr(ANGLES[i].name) + '"' + (ANGLES[i].name === ad.angle ? ' selected' : '') + '>' + esc(ANGLES[i].name) + '</option>';
  }
  var perOpts = '';
  for (var i = 0; i < PERSONAS.length; i++) {
    perOpts += '<option value="' + escAttr(PERSONAS[i].name) + '"' + (PERSONAS[i].name === ad.persona ? ' selected' : '') + '>' + esc(PERSONAS[i].name) + '</option>';
  }

  var body =
    '<div class="form-group"><label>Format Name</label><select class="f-inp" id="ecFormatName">' + fmtOpts + '</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="form-group" style="margin:0"><label>Inspiration Link <span style="color:var(--t3);font-weight:400">— reference / inspo URL</span></label><input type="text" class="f-inp" id="ecAdLink" value="' + escAttr(ad.adLink || '') + '"></div>' +
      '<div class="form-group" style="margin:0"><label>Drive Link <span style="color:var(--t3);font-weight:400">— GDrive production file</span></label><input type="text" class="f-inp" id="ecDriveLink" value="' + escAttr(ad.driveLink || '') + '"></div>' +
    '</div>' +
    '<div class="form-group"><label>Ad Type</label><select class="f-inp" id="ecAdType">' + atOpts + '</select></div>' +
    '<div class="form-group"><label>Funnel Stage</label><select class="f-inp" id="ecFunnelStage">' + fnOpts + '</select></div>' +
    '<div class="form-group"><label>Status</label><select class="f-inp" id="ecStatus">' + stOpts + '</select></div>' +
    '<div class="form-group"><label>Angle</label><select class="f-inp" id="ecAngle">' + angOpts + '</select></div>' +
    '<div class="form-group"><label>Persona</label><select class="f-inp" id="ecPersona">' + perOpts + '</select></div>';

  var foot = '<button class="btn-add" onclick="saveEditCreative(\'' + escAttr(ad.id) + '\')">Save</button> <button class="btn-ghost" onclick="closeModal()">Cancel</button>';
  openModal('Edit Creative ' + ad.id, body, foot);
}

function saveEditCreative(id) {
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].id === id) {
      ADS[i].formatName = document.getElementById('ecFormatName').value;
      ADS[i].adLink = document.getElementById('ecAdLink').value.trim();
      ADS[i].driveLink = document.getElementById('ecDriveLink') ? document.getElementById('ecDriveLink').value.trim() : (ADS[i].driveLink || '');
      ADS[i].adType = document.getElementById('ecAdType').value;
      ADS[i].funnelStage = document.getElementById('ecFunnelStage').value;
      ADS[i].status = document.getElementById('ecStatus').value;
      ADS[i].angle = document.getElementById('ecAngle').value;
      ADS[i].persona = document.getElementById('ecPersona').value;
      break;
    }
  }
  closeModal();
  P = process(ADS);
  deriveWinners();
  genActions();
  renderAll();
  toast('Creative ' + id + ' updated');
}

