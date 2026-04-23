// ============================================================
//  7. SORTING & FILTERING
// ============================================================

function setSort(col) {
  if (trackerSort.col === col) {
    trackerSort.dir = trackerSort.dir * -1;
  } else {
    trackerSort.col = col;
    trackerSort.dir = 1;
  }
  renderCreatives();
}

function applyFilters() {
  trackerFilters.angle = document.getElementById('fAngle').value;
  trackerFilters.persona = document.getElementById('fPersona').value;
  trackerFilters.format = document.getElementById('fFormat').value;
  trackerFilters.adType = document.getElementById('fAdType').value;
  trackerFilters.funnelStage = document.getElementById('fFunnel').value;
  trackerFilters.status = document.getElementById('fStatus').value;
  var fStructure = document.getElementById('fStructure');
  var fHook = document.getElementById('fHook');
  var fProduction = document.getElementById('fProduction');
  if (fStructure) trackerFilters.structure = fStructure.value;
  if (fHook) trackerFilters.hookType = fHook.value;
  if (fProduction) trackerFilters.productionStyle = fProduction.value;
  var fDate = document.getElementById('fDate');
  if (fDate) trackerFilters.dateRange = fDate.value;
  _saveTrackerFilters();
  renderCreatives();
}

function setTrackerTaskType(type) {
  trackerFilters.taskType = type;
  // Update toggle button active state
  var btns = document.querySelectorAll('#taskTypeToggle .tt-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-type') === type);
  }
  _saveTrackerFilters();
  renderCreatives();
}

function populateFilterOptions() {
  // Save current values
  var curAngle = document.getElementById('fAngle').value;
  var curPersona = document.getElementById('fPersona').value;
  var curFormat = document.getElementById('fFormat').value;

  // Angle filter
  var fAngle = document.getElementById('fAngle');
  var angHtml = '<option value="">All Angles</option>';
  for (var i = 0; i < ANGLES.length; i++) {
    var sel = ANGLES[i].name === curAngle ? ' selected' : '';
    angHtml += '<option value="' + escAttr(ANGLES[i].name) + '"' + sel + '>' + esc(ANGLES[i].name) + '</option>';
  }
  fAngle.innerHTML = angHtml;

  // Persona filter
  var fPersona = document.getElementById('fPersona');
  var perHtml = '<option value="">All Personas</option>';
  for (var i = 0; i < PERSONAS.length; i++) {
    var sel = PERSONAS[i].name === curPersona ? ' selected' : '';
    perHtml += '<option value="' + escAttr(PERSONAS[i].name) + '"' + sel + '>' + esc(PERSONAS[i].name) + '</option>';
  }
  fPersona.innerHTML = perHtml;

  // Format filter
  var fFormat = document.getElementById('fFormat');
  var fmtHtml = '<option value="">All Formats</option>';
  for (var i = 0; i < SD_FORMATS.length; i++) {
    var sel = SD_FORMATS[i] === curFormat ? ' selected' : '';
    fmtHtml += '<option value="' + escAttr(SD_FORMATS[i]) + '"' + sel + '>' + esc(SD_FORMATS[i]) + '</option>';
  }
  fFormat.innerHTML = fmtHtml;

  // Creative Structure filter
  var fStr = document.getElementById('fStructure');
  if (fStr) {
    var csNames = getFieldNames('creativeStructure');
    fStr.innerHTML = '<option value="">All Structures</option>';
    for (var i = 0; i < csNames.length; i++) {
      fStr.innerHTML += '<option value="' + escAttr(csNames[i]) + '">' + esc(csNames[i]) + '</option>';
    }
  }

  // Hook Type filter
  var fHookEl = document.getElementById('fHook');
  if (fHookEl) {
    var htNames = getFieldNames('hookType');
    fHookEl.innerHTML = '<option value="">All Hooks</option>';
    for (var i = 0; i < htNames.length; i++) {
      fHookEl.innerHTML += '<option value="' + escAttr(htNames[i]) + '">' + esc(htNames[i]) + '</option>';
    }
  }

  // Production Style filter
  var fProd = document.getElementById('fProduction');
  if (fProd) {
    var psNames = getFieldNames('productionStyle');
    fProd.innerHTML = '<option value="">All Production</option>';
    for (var i = 0; i < psNames.length; i++) {
      fProd.innerHTML += '<option value="' + escAttr(psNames[i]) + '">' + esc(psNames[i]) + '</option>';
    }
  }

  // Ad Type filter
  var curAdType = document.getElementById('fAdType').value;
  var fAdType = document.getElementById('fAdType');
  var adTypeSet = {};
  for (var i = 0; i < ADS.length; i++) {
    if (ADS[i].adType) adTypeSet[ADS[i].adType] = true;
  }
  var atHtml = '<option value="">All Ad Types</option>';
  var adTypes = Object.keys(adTypeSet).sort();
  for (var i = 0; i < adTypes.length; i++) {
    var sel = adTypes[i] === curAdType ? ' selected' : '';
    atHtml += '<option value="' + escAttr(adTypes[i]) + '"' + sel + '>' + esc(adTypes[i]) + '</option>';
  }
  fAdType.innerHTML = atHtml;

  _filtersPopulated = true;
}

