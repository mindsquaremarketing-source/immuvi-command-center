/* ============================================
   AI CLASSIFIER — In-Dashboard Claude API
   ============================================
   Direct browser → Anthropic call. Pulls unclassified rows from Supabase,
   classifies via Claude, writes results back to Supabase + ClickUp custom
   fields. Triggered from buttons in the Creative Tracker and Inspiration
   toolbars. */

window.AIClassifier = {

  ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
  LS_KEY: 'immuvi_anthropic_key',

  // Returns the user's Anthropic key. Prompts once, caches in localStorage.
  // Browser-direct calls require the dangerous-direct-browser-access opt-in;
  // the key sits next to the existing ClickUp key (this is an internal tool).
  getApiKey() {
    var k = '';
    try { k = localStorage.getItem(AIClassifier.LS_KEY) || ''; } catch (e) {}
    if (!k) {
      k = window.prompt('Paste your Anthropic API key (sk-ant-…). Stored locally only.') || '';
      k = k.trim();
      if (k) {
        try { localStorage.setItem(AIClassifier.LS_KEY, k); } catch (e) {}
      }
    }
    return k;
  },

  async classifyCreatives(productId, tasks) {
    var apiKey = AIClassifier.getApiKey();
    if (!apiKey) {
      alert('Anthropic API key required.');
      return 0;
    }

    var BATCH = 10;
    var done = 0;

    for (var i = 0; i < tasks.length; i += BATCH) {
      var batch = tasks.slice(i, i + BATCH);

      var prompt = 'You are classifying ad creatives for a digital marketing dashboard.\n\n' +
        'For each task below, classify it based on the task name.\n' +
        'Return ONLY a JSON array, no other text.\n\n' +
        'Tasks:\n' +
        batch.map(function (t, idx) {
          return (idx + 1) + '. ID: ' + t.taskId + ' | Name: "' + (t.taskName || '') + '"';
        }).join('\n') +
        '\n\nFor each task return:\n' +
        '{\n' +
        '  "taskId": "...",\n' +
        '  "hookType": one of [Curiosity, Pain/Problem, Social Proof, Direct Offer, Aspirational, POV, Question, Pattern Interrupt, Fear],\n' +
        '  "creativeStructure": one of [UGC, Testimonial, Tutorial/How-To, Story/Narrative, Hook+Offer, Demo, Listicle, Comparison, Slideshow/Compilation],\n' +
        '  "productionStyle": one of [Polished UGC, Organic/Raw UGC, Professional Studio, Screen Record, Animation/Motion, Static Graphic, Slideshow, Repurposed Organic],\n' +
        '  "funnelType": one of [TOF, MOF, BOF],\n' +
        '  "angle": short descriptive angle (max 50 chars),\n' +
        '  "persona": short target persona (max 50 chars),\n' +
        '  "creativeUSP": one sentence USP (max 100 chars)\n' +
        '}';

      var response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: AIClassifier.ANTHROPIC_MODEL,
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          })
        });
      } catch (e) {
        console.error('[ai-classifier] network error', e);
        AIClassifier.updateProgress(done, tasks.length, 'Network error — check console.');
        break;
      }

      if (!response.ok) {
        var errText = '';
        try { errText = await response.text(); } catch (e) {}
        console.error('[ai-classifier] API ' + response.status, errText);
        AIClassifier.updateProgress(done, tasks.length, 'API error ' + response.status + ' — check console.');
        // 401 → wipe stale key so the next run can re-prompt
        if (response.status === 401) {
          try { localStorage.removeItem(AIClassifier.LS_KEY); } catch (e) {}
        }
        break;
      }

      var data = await response.json();
      var text = (data.content && data.content[0] && data.content[0].text) || '[]';

      var results;
      try {
        var clean = text.replace(/```json|```/g, '').trim();
        results = JSON.parse(clean);
      } catch (e) {
        console.error('Parse error:', e, text);
        continue;
      }

      for (var ri = 0; ri < results.length; ri++) {
        try {
          await AIClassifier.saveClassification(results[ri], productId);
          done++;
        } catch (e) {
          console.error('[ai-classifier] save failed for', results[ri], e);
        }
      }

      AIClassifier.updateProgress(done, tasks.length);

      if (i + BATCH < tasks.length) {
        await new Promise(function (res) { setTimeout(res, 1000); });
      }
    }

    return done;
  },

  async saveClassification(result, productId) {
    if (!result || !result.taskId) return;

    // Merge with existing meta — Supabase update on a jsonb column REPLACES
    // the whole blob, which would wipe taskType / _fromInspoId / etc.
    var existing = await window.SB
      .from('ads')
      .select('meta')
      .eq('clickup_task_id', result.taskId)
      .maybeSingle();
    var existingMeta = (existing && existing.data && existing.data.meta) || {};

    var meta = Object.assign({}, existingMeta, {
      hookType: result.hookType,
      creativeStructure: result.creativeStructure,
      productionStyle: result.productionStyle,
      creativeModality: existingMeta.creativeModality || 'VO + visual demo + text overlay',
      angle: result.angle,
      persona: result.persona,
      creativeUSP: result.creativeUSP,
      _classifiedBy: 'claude-dashboard-v1',
      _classifiedAt: new Date().toISOString()
    });

    await window.SB.from('ads')
      .update({
        meta: meta,
        angle: result.angle,
        persona: result.persona
      })
      .eq('clickup_task_id', result.taskId);

    // Mirror to ClickUp custom fields if we know the list.
    var product = (typeof getActiveProduct === 'function') ? getActiveProduct() : null;
    var listId = product && product.clickupListId;
    if (listId) {
      try { await AIClassifier.writeClickUpFields(result, listId); }
      catch (e) { console.warn('[ai-classifier] ClickUp field write failed for', result.taskId, e); }
    }
  },

  async writeClickUpFields(result, listId) {
    var apiKey = document.getElementById('apiKeyInput') && document.getElementById('apiKeyInput').value;
    if (!apiKey) return;

    var fieldsRes = await fetch(
      'https://api.clickup.com/api/v2/list/' + listId + '/field',
      { headers: { Authorization: apiKey } }
    );
    var payload = await fieldsRes.json();
    var fields = payload.fields || [];

    var find = function (name) {
      return fields.find(function (f) {
        return f.name && f.name.toLowerCase() === name.toLowerCase();
      });
    };

    var hookField    = find('Hook Type');
    var structField  = find('Creative Structure');
    var prodField    = find('Production Style');
    var funnelField  = find('Funnel Type');
    var angleField   = find('Angle Tag');
    var uspField     = find('Creative USP');

    var postField = async function (field, value) {
      if (!field || value == null) return;
      var val = value;
      if (field.type === 'drop_down') {
        var opts = (field.type_config && field.type_config.options) || [];
        var opt = opts.find(function (o) { return o.name && o.name.toLowerCase() === String(value).toLowerCase(); });
        val = opt && opt.id;
        if (!val) return;
      }
      await fetch(
        'https://api.clickup.com/api/v2/task/' + result.taskId + '/field/' + field.id,
        {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val })
        }
      );
    };

    await postField(hookField, result.hookType);
    await postField(structField, result.creativeStructure);
    await postField(prodField, result.productionStyle);
    await postField(funnelField, result.funnelType);
    if (angleField) await postField(angleField, result.angle);
    if (uspField)   await postField(uspField, result.creativeUSP);
  },

  updateProgress(done, total, msg) {
    var el = document.getElementById('ai-classify-progress');
    if (!el) return;
    el.textContent = msg || ('Classifying... ' + done + '/' + total);
  },

  showModal(productId, unclassified, opts) {
    opts = opts || {};
    var existing = document.getElementById('ai-classify-modal');
    if (existing) existing.remove();
    var existingBd = document.getElementById('ai-classify-backdrop');
    if (existingBd) existingBd.remove();

    var modal = document.createElement('div');
    modal.id = 'ai-classify-modal';
    modal.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:#fff;border-radius:16px;padding:32px;width:480px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.15);z-index:9999;' +
      'border:1px solid #E0E7FF;';

    var titleHtml = opts.title || '⚡ AI Classify with Claude';
    var startFn = opts.startFn || ('AIClassifier.startFromModal(\'' + productId + '\')');

    modal.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<h3 style="font-size:1rem;font-weight:700;color:#111827">' + titleHtml + '</h3>' +
        '<button onclick="document.getElementById(\'ai-classify-modal\').remove();document.getElementById(\'ai-classify-backdrop\').remove();" ' +
          'style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#6B7280">×</button>' +
      '</div>' +
      '<p style="color:#6B7280;font-size:0.85rem;margin-bottom:20px">' +
        'Found <strong style="color:#4F46E5">' + unclassified.length + ' unclassified</strong> ' +
        'item' + (unclassified.length === 1 ? '' : 's') + '. Claude will classify Hook Type, Structure, ' +
        'Production Style, Funnel, Angle, Persona and USP for each one.' +
      '</p>' +
      '<div style="background:#F8FAFF;border-radius:10px;padding:12px;margin-bottom:20px;' +
        'border:1px solid #E0E7FF;font-size:0.8rem;color:#6B7280">' +
        '⏱ Estimated time: ~' + (Math.ceil(unclassified.length / 10) * 3) + ' seconds' +
      '</div>' +
      '<div id="ai-classify-progress" style="font-size:0.85rem;color:#4F46E5;' +
        'min-height:20px;margin-bottom:16px;font-weight:600"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button id="ai-classify-start" onclick="' + startFn + '" ' +
          'style="flex:1;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;' +
          'border:none;border-radius:10px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer">' +
          '⚡ Start Classification' +
        '</button>' +
        '<button onclick="document.getElementById(\'ai-classify-modal\').remove();document.getElementById(\'ai-classify-backdrop\').remove();" ' +
          'style="padding:12px 20px;border:1px solid #E0E7FF;border-radius:10px;' +
          'background:#fff;color:#6B7280;cursor:pointer;font-weight:600">' +
          'Cancel' +
        '</button>' +
      '</div>';

    var backdrop = document.createElement('div');
    backdrop.id = 'ai-classify-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:9998';
    backdrop.onclick = function () { modal.remove(); backdrop.remove(); };

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    window._aiClassifyTasks = unclassified;
  },

  async startFromModal(productId) {
    var btn = document.getElementById('ai-classify-start');
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying...'; }

    var tasks = window._aiClassifyTasks || [];
    var done = await AIClassifier.classifyCreatives(productId, tasks);

    var progress = document.getElementById('ai-classify-progress');
    if (progress) progress.textContent = '✅ Done! ' + done + ' creatives classified.';

    if (btn) {
      btn.textContent = '✅ Complete — Close';
      btn.disabled = false;
      btn.onclick = function () {
        var m = document.getElementById('ai-classify-modal');
        var bd = document.getElementById('ai-classify-backdrop');
        if (m) m.remove();
        if (bd) bd.remove();
        if (typeof window.renderCreatives === 'function') window.renderCreatives();
        if (typeof window.renderInspirations === 'function') window.renderInspirations();
      };
    }
  },

  // Creative Tracker entry point.
  async triggerForTracker(productId) {
    productId = productId || (typeof activeProductId !== 'undefined' ? activeProductId : null);
    if (!productId) { alert('No active product selected.'); return; }

    var resp = await window.SB.from('ads')
      .select('clickup_task_id, format_name, meta')
      .eq('product_id', productId)
      .is('meta->hookType', null)
      .not('clickup_task_id', 'is', null)
      .limit(200);

    var rows = (resp && resp.data) || [];
    var unclassified = rows.map(function (a) {
      return { taskId: a.clickup_task_id, taskName: a.format_name || '' };
    });

    if (unclassified.length === 0) {
      alert('All creatives are already classified!');
      return;
    }

    AIClassifier.showModal(productId, unclassified, { title: '⚡ AI Classify Creatives' });
  },

  // Inspiration tab entry point — same flow, different data source.
  async triggerForInspiration(productId) {
    productId = productId || (typeof activeProductId !== 'undefined' ? activeProductId : null);
    if (!productId) { alert('No active product selected.'); return; }

    var resp = await window.SB.from('inspirations')
      .select('id, title, data')
      .eq('product_id', productId)
      .limit(500);

    var rows = (resp && resp.data) || [];
    var unclassified = rows
      .filter(function (r) {
        var d = r.data || {};
        return !d.hookType;
      })
      .map(function (r) {
        var d = r.data || {};
        return { taskId: r.id, taskName: r.title || d.formatName || d.sourceUrl || r.id };
      });

    if (unclassified.length === 0) {
      alert('All inspirations are already classified!');
      return;
    }

    AIClassifier.showModal(productId, unclassified, {
      title: '⚡ AI Classify Inspirations',
      startFn: 'AIClassifier.startFromModalInspiration(\'' + productId + '\')'
    });
  },

  async startFromModalInspiration(productId) {
    var btn = document.getElementById('ai-classify-start');
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying...'; }

    var tasks = window._aiClassifyTasks || [];
    var done = await AIClassifier.classifyInspirations(productId, tasks);

    var progress = document.getElementById('ai-classify-progress');
    if (progress) progress.textContent = '✅ Done! ' + done + ' inspirations classified.';

    if (btn) {
      btn.textContent = '✅ Complete — Close';
      btn.disabled = false;
      btn.onclick = function () {
        var m = document.getElementById('ai-classify-modal');
        var bd = document.getElementById('ai-classify-backdrop');
        if (m) m.remove();
        if (bd) bd.remove();
        if (typeof window.renderInspirations === 'function') window.renderInspirations();
      };
    }
  },

  // Same Claude prompt + parse as classifyCreatives, but writes to inspirations.data
  async classifyInspirations(productId, tasks) {
    var apiKey = AIClassifier.getApiKey();
    if (!apiKey) { alert('Anthropic API key required.'); return 0; }

    var BATCH = 10;
    var done = 0;

    for (var i = 0; i < tasks.length; i += BATCH) {
      var batch = tasks.slice(i, i + BATCH);

      var prompt = 'You are classifying inspiration ads for a digital marketing dashboard.\n\n' +
        'For each item below, classify it based on the title/URL.\n' +
        'Return ONLY a JSON array, no other text.\n\n' +
        'Items:\n' +
        batch.map(function (t, idx) {
          return (idx + 1) + '. ID: ' + t.taskId + ' | Name: "' + (t.taskName || '') + '"';
        }).join('\n') +
        '\n\nFor each item return the same shape as creative classification: ' +
        '{ taskId, hookType, creativeStructure, productionStyle, funnelType, angle, persona, creativeUSP }';

      var response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: AIClassifier.ANTHROPIC_MODEL,
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          })
        });
      } catch (e) {
        console.error('[ai-classifier] network error', e);
        break;
      }

      if (!response.ok) {
        var errText = '';
        try { errText = await response.text(); } catch (e) {}
        console.error('[ai-classifier] API ' + response.status, errText);
        if (response.status === 401) {
          try { localStorage.removeItem(AIClassifier.LS_KEY); } catch (e) {}
        }
        break;
      }

      var data = await response.json();
      var text = (data.content && data.content[0] && data.content[0].text) || '[]';

      var results;
      try {
        results = JSON.parse(text.replace(/```json|```/g, '').trim());
      } catch (e) {
        console.error('Parse error:', e, text);
        continue;
      }

      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        if (!r || !r.taskId) continue;

        var pre = await window.SB
          .from('inspirations')
          .select('data')
          .eq('id', r.taskId)
          .eq('product_id', productId)
          .maybeSingle();
        var blob = (pre && pre.data && pre.data.data) || {};

        var merged = Object.assign({}, blob, {
          hookType: r.hookType,
          creativeStructure: r.creativeStructure,
          productionStyle: r.productionStyle,
          funnelType: r.funnelType,
          angle: r.angle,
          persona: r.persona,
          creativeUSP: r.creativeUSP,
          _classifiedBy: 'claude-dashboard-v1',
          _classifiedAt: new Date().toISOString()
        });

        await window.SB.from('inspirations')
          .update({ data: merged })
          .eq('id', r.taskId)
          .eq('product_id', productId);

        done++;
      }

      AIClassifier.updateProgress(done, tasks.length);

      if (i + BATCH < tasks.length) {
        await new Promise(function (res) { setTimeout(res, 1000); });
      }
    }

    return done;
  }
};
