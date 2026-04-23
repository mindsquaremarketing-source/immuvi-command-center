// ============================================================
//  FIELD OPTIONS — init, save, helpers
// ============================================================

function initFieldOptions() {
  // Try loading from localStorage first
  try {
    var raw = localStorage.getItem(LS_FIELD_OPTIONS_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved && saved.creativeStructure && saved.creativeStructure.length > 0) {
        FIELD_OPTIONS = saved;
        return;
      }
    }
  } catch(e) {}
  // Build from hardcoded constants + desc maps
  FIELD_OPTIONS.creativeStructure = CREATIVE_STRUCTURES.map(function(name) {
    return { name: name, desc: CREATIVE_STRUCTURE_DESC[name] || '' };
  });
  FIELD_OPTIONS.hookType = HOOK_TYPES.map(function(name) {
    return { name: name, desc: HOOK_TYPE_DESC[name] || '' };
  });
  FIELD_OPTIONS.productionStyle = PRODUCTION_STYLES.map(function(name) {
    return { name: name, desc: PRODUCTION_STYLE_DESC[name] || '' };
  });
}

function saveFieldOptions() {
  try { localStorage.setItem(LS_FIELD_OPTIONS_KEY, JSON.stringify(FIELD_OPTIONS)); } catch(e) {}
}

function getFieldNames(fieldKey) {
  return FIELD_OPTIONS[fieldKey].map(function(o) { return o.name; });
}

function getFieldDescMap(fieldKey) {
  var map = {};
  FIELD_OPTIONS[fieldKey].forEach(function(o) { map[o.name] = o.desc; });
  return map;
}

