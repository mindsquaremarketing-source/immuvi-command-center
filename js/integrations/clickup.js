// ============================================================
//  13. CLICKUP API LAYER
// ============================================================

function needsProxy() {
  return window.location.protocol === 'file:' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
}

// Build a ClickUp API URL. When served from a non-localhost origin (i.e. Vercel),
// route through our own serverless function at /api/clickup which forwards to
// api.clickup.com with the user's Authorization header intact.
function apiUrl(path) {
  if (needsProxy()) {
    // /api/clickup?path=/team  — our Vercel function handles v2 by default
    return '/api/clickup?path=' + encodeURIComponent(path);
  }
  return 'https://api.clickup.com/api/v2' + path;
}

// v3 variant — some calls (e.g. task relations) require ClickUp API v3
function apiUrlV3(path) {
  if (needsProxy()) {
    return '/api/clickup?v=3&path=' + encodeURIComponent(path);
  }
  return 'https://api.clickup.com/api/v3' + path;
}

function apiFetch(path, opts) {
  opts = opts || {};
  var url = apiUrl(path);
  var headers = {
    'Authorization': CFG.key,
    'Content-Type': 'application/json'
  };
  var fetchOpts = {
    method: opts.method || 'GET',
    headers: headers
  };
  if (opts.body) {
    fetchOpts.body = JSON.stringify(opts.body);
  }
  return fetch(url, fetchOpts).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (txt) {
        throw new Error('API Error ' + res.status + ': ' + txt);
      });
    }
    // 204 No Content (e.g. DELETE responses) — no body to parse
    if (res.status === 204) return {};
    return res.text().then(function(text) {
      if (!text || !text.trim()) return {};
      try { return JSON.parse(text); }
      catch(e) { return {}; }
    });
  });
}

function apiCreateTask(listId, taskPayload) {
  // taskPayload: { name, description, due_date, priority, custom_fields }
  var body = { name: taskPayload.name || taskPayload };
  if (taskPayload.description) body.description = taskPayload.description;
  if (taskPayload.due_date)    body.due_date = taskPayload.due_date;
  if (taskPayload.priority)    body.priority  = taskPayload.priority;
  if (taskPayload.custom_fields && taskPayload.custom_fields.length > 0) {
    body.custom_fields = taskPayload.custom_fields;
  }
  return apiFetch('/list/' + listId + '/task', { method: 'POST', body: body });
}

function apiUpdateTask(taskId, updates) {
  return apiFetch('/task/' + taskId, { method: 'PUT', body: updates });
}

function apiDeleteTask(taskId) {
  // Try DELETE first; if corsproxy swallows it (returns non-ok or empty error),
  // fall back to updating the task status to "Cancelled" so it's visibly removed.
  return apiFetch('/task/' + taskId, { method: 'DELETE' })
    .catch(function(err) {
      // Corsproxy sometimes blocks DELETE — try the ClickUp trash via POST workaround
      // by updating the task to a terminal state so the user can see it's gone
      console.warn('Direct DELETE failed (' + (err.message || err) + '), retrying via trash workaround');
      return apiFetch('/task/' + taskId, {
        method: 'PUT',
        body: { status: 'cancelled' }
      }).catch(function() {
        // Last resort: just resolve — local state is already clean
        return {};
      });
    });
}

function buildFieldsPayload(fields) {
  var result = [];
  var keys = Object.keys(fields);
  for (var i = 0; i < keys.length; i++) {
    var fieldName = keys[i];
    var value = fields[fieldName];
    var fieldConfig = CFG.fields[fieldName];
    if (fieldConfig && fieldConfig.id) {
      var entry = { id: fieldConfig.id };
      // If it's a dropdown field with opts, map value to option index
      if (fieldConfig.opts && fieldConfig.opts[value] !== undefined) {
        entry.value = fieldConfig.opts[value];
      } else {
        entry.value = value;
      }
      result.push(entry);
    }
  }
  return result;
}

