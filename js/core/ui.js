// ============================================================
//  2. UI UTILITIES
// ============================================================

function showTab(id, btn) {
  var panels = document.querySelectorAll('.panel');
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.remove('on');
  }
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('on');
    tabs[i].setAttribute('aria-selected', 'false');
  }
  var target = document.getElementById('panel-' + id);
  if (target) target.classList.add('on');
  if (btn) {
    btn.classList.add('on');
    btn.setAttribute('aria-selected', 'true');
  }
  if (id === 'inspiration') checkBridgeStatus();
  // Persist active tab so page refresh lands on the same tab
  try { localStorage.setItem('immuvi_active_tab', id); } catch(e) {}
}

function openModal(title, bodyHtml, footHtml) {
  document.getElementById('modalTitle').innerHTML = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFoot').innerHTML = footHtml || '';
  document.getElementById('modalOverlay').classList.add('on');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('on');
}

// ── STAT POPUP (creatives & detail panels) ──────────────────────────────────

function _openStatPopup(title, sub, bodyHtml, triggerEl) {
  var popup  = document.getElementById('statPopup');
  var bg     = document.getElementById('statPopupBg');
  document.getElementById('statPopupTitle').textContent = title;
  document.getElementById('statPopupSub').textContent   = sub || '';
  document.getElementById('statPopupBody').innerHTML    = bodyHtml;

  // Position near trigger
  popup.style.display = 'none'; // reset so we can measure
  bg.style.display    = 'block';
  popup.style.display = 'flex';

  if (triggerEl) {
    var r = triggerEl.getBoundingClientRect();
    var pw = Math.min(700, window.innerWidth * 0.94);
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    var top  = r.bottom + 6;
    if (top + 420 > window.innerHeight) top = Math.max(8, r.top - 420 - 6);
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  } else {
    popup.style.left = '50%';
    popup.style.top  = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }
}

function closeStatPopup() {
  document.getElementById('statPopup').style.display = 'none';
  document.getElementById('statPopupBg').style.display = 'none';
  document.getElementById('statPopup').style.transform = '';
}

// Creatives popup — show all creatives for an angle or persona
function showCreativesPopup(evt, filterType, filterVal) {
  evt.stopPropagation();
  var triggerEl = evt.target.closest('.tr-stat-pill') || evt.target;
  var ads = ADS.filter(function(a) {
    if (a.parentAdId || a.trackerRefId) return false;
    return filterType === 'angle' ? a.angle === filterVal : a.persona === filterVal;
  });

  var title = filterVal;
  var sub   = ads.length + ' creative' + (ads.length !== 1 ? 's' : '');

  var html = '';
  if (!ads.length) {
    html = '<div style="padding:16px;color:var(--t3);font-size:0.75rem;text-align:center">No creatives yet for this ' + filterType + '</div>';
  } else {
    // Sort by status: Winner first
    ads.sort(function(a, b) {
      var order = {Winner:0, Scale:1, Testing:2, 'In Progress':3, Untested:4, Loser:5};
      return (order[a.status]||9) - (order[b.status]||9);
    });
    html += '<div style="display:flex;flex-direction:column;gap:0">';
    ads.forEach(function(ad) {
      var cls = classify(ad.status);
      var otherVal = filterType === 'angle' ? ad.persona : ad.angle;
      html += '<div class="sp-cr-row">' +
        '<div class="sp-cr-id">' + mono(ad.id) + '</div>' +
        '<div class="sp-cr-name">' + esc(ad.formatName || '—') + '</div>' +
        '<div class="sp-cr-pills">' +
          (otherVal ? '<span class="tr-stat-pill">' + esc(otherVal) + '</span>' : '') +
          (ad.hookType ? '<span class="tr-stat-pill">' + esc(ad.hookType) + '</span>' : '') +
        '</div>' +
        '<div><span class="bdg ' + cls.cls + '">' + esc(ad.status) + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<button class="sp-nav-btn" onclick="closeStatPopup();navigateToCreative(\'' + escAttr(ad.id) + '\')" title="Go to Creative Tracker">&#128203; Tracker</button>' +
          (ad.adLink ? '<a class="tr-src-link" href="' + escAttr(ad.adLink) + '" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Ad</a>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  _openStatPopup(title, sub, html, triggerEl);
}

// Persona detail popup
function showPersonaDetailPopup(evt, personaName) {
  evt.stopPropagation();
  var triggerEl = evt.target.closest('.tr-stat-pill') || evt.target;
  var per = PERSONAS.find(function(p) { return p.name === personaName; });
  var cls = per ? classify(per.status) : classify('Untested');

  // Calculate stats inline
  var relAds = ADS.filter(function(a) { return a.persona === personaName && !a.parentAdId; });
  var winners = relAds.filter(function(a) { return a.status === 'Winner'; }).length;
  var winRate = relAds.length > 0 ? Math.round((winners / relAds.length) * 100) : 0;
  var angleSet = {};
  relAds.forEach(function(a) { if (a.angle) angleSet[a.angle] = true; });
  var angleNames = Object.keys(angleSet);

  var html = '<div class="sp-detail">';

  // Stat numbers row
  html += '<div style="display:flex;gap:20px;margin-bottom:4px">' +
    '<div class="sp-stat-num"><strong>' + relAds.length + '</strong><span>Creatives</span></div>' +
    '<div class="sp-stat-num"><strong>' + winners + '</strong><span>Winners</span></div>' +
    '<div class="sp-stat-num"><strong>' + winRate + '%</strong><span>Win Rate</span></div>' +
    '<div class="sp-stat-num"><strong>' + angleNames.length + '</strong><span>Angles</span></div>' +
  '</div>';

  // Status
  html += '<div class="sp-detail-row"><span class="sp-label">Status</span>' +
    '<span class="bdg ' + cls.cls + '">' + esc(per ? per.status : 'Untested') + '</span></div>';

  // Source link
  if (per && per.sourceLink) {
    html += '<div class="sp-detail-row"><span class="sp-label">Source</span>' +
      '<a class="sp-src-link" href="' + escAttr(per.sourceLink) + '" target="_blank" rel="noopener">' + esc(per.sourceLink) + ' ↗</a></div>';
  }

  // Notes
  if (per && per.notes) {
    html += '<div class="sp-detail-row"><span class="sp-label">Notes</span>' +
      '<span class="sp-notes-text">' + esc(per.notes) + '</span></div>';
  }

  // Angles
  if (angleNames.length) {
    html += '<div class="sp-detail-row"><span class="sp-label">Angles</span><div class="sp-pills">';
    angleNames.forEach(function(n) { html += '<span class="tr-stat-pill">' + esc(n) + '</span>'; });
    html += '</div></div>';
  }

  // Last 3 creatives
  if (relAds.length) {
    html += '<div class="sp-detail-row" style="flex-direction:column;gap:4px"><span class="sp-label">Recent Creatives</span>';
    relAds.slice(0, 4).forEach(function(ad) {
      var cl = classify(ad.status);
      html += '<div style="display:flex;align-items:center;gap:8px;font-size:0.7rem">' +
        '<span class="bdg ' + cl.cls + '" style="font-size:0.55rem">' + esc(ad.status) + '</span>' +
        '<span style="color:var(--t2)">' + esc(ad.formatName || ad.id) + '</span>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-left:auto">' +
          '<button class="sp-nav-btn" onclick="closeStatPopup();navigateToCreative(\'' + escAttr(ad.id) + '\')" title="Go to Creative Tracker">&#128203; Tracker</button>' +
          (ad.adLink ? '<a class="tr-src-link" href="' + escAttr(ad.adLink) + '" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Ad</a>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  _openStatPopup(personaName, 'Persona', html, triggerEl);
}

// Angle detail popup (from persona tab)
function showAngleDetailPopup(evt, angleName) {
  evt.stopPropagation();
  var triggerEl = evt.target.closest('.tr-stat-pill') || evt.target;
  var ang = ANGLES.find(function(a) { return a.name === angleName; });
  var cls = ang ? classify(ang.status) : classify('Untested');

  var relAds = ADS.filter(function(a) { return a.angle === angleName && !a.parentAdId; });
  var winners = relAds.filter(function(a) { return a.status === 'Winner'; }).length;
  var winRate = relAds.length > 0 ? Math.round((winners / relAds.length) * 100) : 0;
  var personaSet = {};
  relAds.forEach(function(a) { if (a.persona) personaSet[a.persona] = true; });
  var personaNames = Object.keys(personaSet);

  var html = '<div class="sp-detail">';
  html += '<div style="display:flex;gap:20px;margin-bottom:4px">' +
    '<div class="sp-stat-num"><strong>' + relAds.length + '</strong><span>Creatives</span></div>' +
    '<div class="sp-stat-num"><strong>' + winners + '</strong><span>Winners</span></div>' +
    '<div class="sp-stat-num"><strong>' + winRate + '%</strong><span>Win Rate</span></div>' +
    '<div class="sp-stat-num"><strong>' + personaNames.length + '</strong><span>Personas</span></div>' +
  '</div>';

  html += '<div class="sp-detail-row"><span class="sp-label">Status</span>' +
    '<span class="bdg ' + cls.cls + '">' + esc(ang ? ang.status : 'Untested') + '</span></div>';

  if (ang && ang.sourceLink) {
    html += '<div class="sp-detail-row"><span class="sp-label">Source</span>' +
      '<a class="sp-src-link" href="' + escAttr(ang.sourceLink) + '" target="_blank" rel="noopener">' + esc(ang.sourceLink) + ' ↗</a></div>';
  }
  if (ang && ang.notes) {
    html += '<div class="sp-detail-row"><span class="sp-label">Notes</span>' +
      '<span class="sp-notes-text">' + esc(ang.notes) + '</span></div>';
  }
  if (personaNames.length) {
    html += '<div class="sp-detail-row"><span class="sp-label">Personas</span><div class="sp-pills">';
    personaNames.forEach(function(n) { html += '<span class="tr-stat-pill">' + esc(n) + '</span>'; });
    html += '</div></div>';
  }
  if (relAds.length) {
    html += '<div class="sp-detail-row" style="flex-direction:column;gap:4px"><span class="sp-label">Recent Creatives</span>';
    relAds.slice(0, 4).forEach(function(ad) {
      var cl = classify(ad.status);
      html += '<div style="display:flex;align-items:center;gap:8px;font-size:0.7rem">' +
        '<span class="bdg ' + cl.cls + '" style="font-size:0.55rem">' + esc(ad.status) + '</span>' +
        '<span style="color:var(--t2)">' + esc(ad.formatName || ad.id) + '</span>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-left:auto">' +
          '<button class="sp-nav-btn" onclick="closeStatPopup();navigateToCreative(\'' + escAttr(ad.id) + '\')" title="Go to Creative Tracker">&#128203; Tracker</button>' +
          (ad.adLink ? '<a class="tr-src-link" href="' + escAttr(ad.adLink) + '" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3.5 1H1v10h10V8.5M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Ad</a>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  _openStatPopup(angleName, 'Angle', html, triggerEl);
}

function navigateToCreative(adId) {
  // Switch to creatives tab
  var tabs = document.querySelectorAll('[onclick*="showTab"]');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].textContent.indexOf('CREATIVE') !== -1 || tabs[i].textContent.indexOf('Creative') !== -1) {
      tabs[i].click();
      break;
    }
  }
  // After tab switch, scroll to and highlight the row
  setTimeout(function() {
    var row = document.getElementById('ad_row_' + adId);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.transition = 'box-shadow .3s, background .3s';
      row.style.background = 'rgba(37,99,235,0.08)';
      row.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.4)';
      setTimeout(function() {
        row.style.background = '';
        row.style.boxShadow = '';
      }, 2000);
    }
  }, 350);
}

function toggleSpCard(cardId) {
  var card = document.getElementById('sp-card-' + cardId);
  if (!card) return;
  var isOpen = card.classList.contains('open');
  // Close all sibling cards
  var allCards = card.closest('.sp-cards-list');
  if (allCards) {
    allCards.querySelectorAll('.sp-list-card.open').forEach(function(c) { c.classList.remove('open'); });
  }
  if (!isOpen) card.classList.add('open');
}

function showPersonasForAngle(evt, angleName) {
  evt.stopPropagation();
  var triggerEl = evt.target.closest('.tr-stat-pill') || evt.target;
  var personaNameSet = {};
  ADS.filter(function(a) { return a.angle === angleName && !a.parentAdId; }).forEach(function(a) {
    if (a.persona) personaNameSet[a.persona] = true;
  });
  var names = Object.keys(personaNameSet);

  var html = '<div class="sp-cards-list" style="display:flex;flex-direction:column;gap:6px">';
  if (!names.length) {
    html += '<div style="color:var(--t3);font-size:0.75rem;text-align:center;padding:16px">No personas tested with this angle yet</div>';
  } else {
    names.forEach(function(pn) {
      var cardId = 'pa-' + pn.replace(/[^a-zA-Z0-9]/g, '_');
      var per = PERSONAS.find(function(p) { return p.name === pn; });
      var cls = per ? classify(per.status) : classify('Untested');
      var relAds = ADS.filter(function(a) { return a.angle === angleName && a.persona === pn && !a.parentAdId; });
      var relWins = relAds.filter(function(a) { return a.status === 'Winner'; }).length;
      var relWinRate = relAds.length > 0 ? Math.round((relWins / relAds.length) * 100) : 0;

      // Build expanded body
      var bodyHtml = '<div class="sp-card-detail">';
      // Mini stats
      bodyHtml += '<div class="sp-card-stats">' +
        '<div class="sp-card-stat"><strong>' + relAds.length + '</strong><span>Creatives</span></div>' +
        '<div class="sp-card-stat"><strong>' + relWins + '</strong><span>Winners</span></div>' +
        '<div class="sp-card-stat"><strong>' + relWinRate + '%</strong><span>Win Rate</span></div>' +
      '</div>';
      if (per && per.notes) {
        bodyHtml += '<div class="sp-card-row"><span class="sp-card-lbl">Notes</span><span class="sp-card-val">' + esc(per.notes) + '</span></div>';
      }
      if (per && per.sourceLink) {
        bodyHtml += '<div class="sp-card-row"><span class="sp-card-lbl">Source</span><a class="sp-src-link" href="' + escAttr(per.sourceLink) + '" target="_blank" rel="noopener">' + esc(per.sourceLink.replace(/^https?:\/\/(www\.)?/,'').slice(0,50)) + ' ↗</a></div>';
      }
      if (relAds.length) {
        bodyHtml += '<div class="sp-card-row" style="flex-direction:column;gap:4px"><span class="sp-card-lbl">Creatives</span><div class="sp-card-creatives">';
        relAds.slice(0, 4).forEach(function(ad) {
          var acl = classify(ad.status);
          bodyHtml += '<div class="sp-card-cr">' +
            '<span class="bdg ' + acl.cls + '" style="font-size:0.55rem;flex-shrink:0">' + esc(ad.status) + '</span>' +
            '<span style="color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(ad.formatName || ad.id) + '</span>' +
            '<button class="sp-nav-btn" onclick="closeStatPopup();navigateToCreative(\'' + escAttr(ad.id) + '\')">📋 Tracker</button>' +
            (ad.adLink ? '<a class="tr-src-link" href="' + escAttr(ad.adLink) + '" target="_blank" rel="noopener" style="font-size:0.62rem">↗</a>' : '') +
          '</div>';
        });
        bodyHtml += '</div></div>';
      }
      bodyHtml += '</div>';

      html += '<div class="sp-list-card" id="sp-card-' + escAttr(cardId) + '">' +
        '<div class="sp-list-card-hd" onclick="toggleSpCard(\'' + escAttr(cardId) + '\')">' +
          '<span class="sp-list-card-name">' + esc(pn) + '</span>' +
          '<span class="bdg ' + cls.cls + '">' + esc(per ? per.status : 'Untested') + '</span>' +
          '<span class="tr-stat-pill" style="flex-shrink:0">&#127912; ' + relAds.length + '</span>' +
          '<span class="sp-chevron">&#9660;</span>' +
        '</div>' +
        '<div class="sp-list-card-body">' + bodyHtml + '</div>' +
      '</div>';
    });
  }
  html += '</div>';
  _openStatPopup('Personas — ' + angleName, names.length + ' persona' + (names.length !== 1 ? 's' : ''), html, triggerEl);
}

function showAnglesForPersona(evt, personaName) {
  evt.stopPropagation();
  var triggerEl = evt.target.closest('.tr-stat-pill') || evt.target;
  var angleNameSet = {};
  ADS.filter(function(a) { return a.persona === personaName && !a.parentAdId; }).forEach(function(a) {
    if (a.angle) angleNameSet[a.angle] = true;
  });
  var names = Object.keys(angleNameSet);

  var html = '<div class="sp-cards-list" style="display:flex;flex-direction:column;gap:6px">';
  if (!names.length) {
    html += '<div style="color:var(--t3);font-size:0.75rem;text-align:center;padding:16px">No angles tested with this persona yet</div>';
  } else {
    names.forEach(function(an) {
      var cardId = 'ap-' + an.replace(/[^a-zA-Z0-9]/g, '_');
      var ang = ANGLES.find(function(a) { return a.name === an; });
      var cls = ang ? classify(ang.status) : classify('Untested');
      var relAds = ADS.filter(function(a) { return a.persona === personaName && a.angle === an && !a.parentAdId; });
      var relWins = relAds.filter(function(a) { return a.status === 'Winner'; }).length;
      var relWinRate = relAds.length > 0 ? Math.round((relWins / relAds.length) * 100) : 0;

      var bodyHtml = '<div class="sp-card-detail">';
      bodyHtml += '<div class="sp-card-stats">' +
        '<div class="sp-card-stat"><strong>' + relAds.length + '</strong><span>Creatives</span></div>' +
        '<div class="sp-card-stat"><strong>' + relWins + '</strong><span>Winners</span></div>' +
        '<div class="sp-card-stat"><strong>' + relWinRate + '%</strong><span>Win Rate</span></div>' +
      '</div>';
      if (ang && ang.notes) {
        bodyHtml += '<div class="sp-card-row"><span class="sp-card-lbl">Notes</span><span class="sp-card-val">' + esc(ang.notes) + '</span></div>';
      }
      if (ang && ang.sourceLink) {
        bodyHtml += '<div class="sp-card-row"><span class="sp-card-lbl">Source</span><a class="sp-src-link" href="' + escAttr(ang.sourceLink) + '" target="_blank" rel="noopener">' + esc(ang.sourceLink.replace(/^https?:\/\/(www\.)?/,'').slice(0,50)) + ' ↗</a></div>';
      }
      if (relAds.length) {
        bodyHtml += '<div class="sp-card-row" style="flex-direction:column;gap:4px"><span class="sp-card-lbl">Creatives</span><div class="sp-card-creatives">';
        relAds.slice(0, 4).forEach(function(ad) {
          var acl = classify(ad.status);
          bodyHtml += '<div class="sp-card-cr">' +
            '<span class="bdg ' + acl.cls + '" style="font-size:0.55rem;flex-shrink:0">' + esc(ad.status) + '</span>' +
            '<span style="color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(ad.formatName || ad.id) + '</span>' +
            '<button class="sp-nav-btn" onclick="closeStatPopup();navigateToCreative(\'' + escAttr(ad.id) + '\')">📋 Tracker</button>' +
            (ad.adLink ? '<a class="tr-src-link" href="' + escAttr(ad.adLink) + '" target="_blank" rel="noopener" style="font-size:0.62rem">↗</a>' : '') +
          '</div>';
        });
        bodyHtml += '</div></div>';
      }
      bodyHtml += '</div>';

      html += '<div class="sp-list-card" id="sp-card-' + escAttr(cardId) + '">' +
        '<div class="sp-list-card-hd" onclick="toggleSpCard(\'' + escAttr(cardId) + '\')">' +
          '<span class="sp-list-card-name">' + esc(an) + '</span>' +
          '<span class="bdg ' + cls.cls + '">' + esc(ang ? ang.status : 'Untested') + '</span>' +
          '<span class="tr-stat-pill" style="flex-shrink:0">&#127912; ' + relAds.length + '</span>' +
          '<span class="sp-chevron">&#9660;</span>' +
        '</div>' +
        '<div class="sp-list-card-body">' + bodyHtml + '</div>' +
      '</div>';
    });
  }
  html += '</div>';
  _openStatPopup('Angles — ' + personaName, names.length + ' angle' + (names.length !== 1 ? 's' : ''), html, triggerEl);
}

function toast(msg, type) {
  type = type || 'ok';
  var wrap = document.getElementById('toastWrap');
  var div = document.createElement('div');
  div.className = 'toast toast-' + type;
  div.textContent = msg;
  wrap.appendChild(div);
  setTimeout(function () {
    div.style.opacity = '0';
    div.style.transform = 'translateX(40px)';
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 400);
  }, 3000);
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Loading...';
  document.getElementById('loadingOverlay').classList.add('on');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('on');
}

function updateTabCounts() {
  var el;
  el = document.getElementById('anglesCount');
  if (el) el.innerHTML = ANGLES.length;
  el = document.getElementById('personasCount');
  if (el) el.innerHTML = PERSONAS.length;
  el = document.getElementById('creativesCount');
  if (el) el.innerHTML = ADS.length;
  var matrixCells = 0;
  var filledCells = {};
  for (var i = 0; i < ADS.length; i++) {
    if (!ADS[i].parentAdId) filledCells[ADS[i].angle + '||' + ADS[i].persona] = true;
  }
  el = document.getElementById('matrixCount');
  if (el) el.innerHTML = Object.keys(filledCells).length + '/' + (ANGLES.length * PERSONAS.length);
  el = document.getElementById('actionsCount');
  if (el) el.innerHTML = MANUAL_ACTIONS.length;
  el = document.getElementById('prodCount');
  if (el) el.innerHTML = MANUAL_ACTIONS.length;
}

// ============================================================
//  THEME TOGGLE — light default with dark mode via [data-theme]
//  Persisted in localStorage under "theme".
// ============================================================
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  var btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  var saved = 'light';
  try { saved = localStorage.getItem('theme') || 'light'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', saved);
  var btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

// Restore saved theme on page load. ui.js loads near the top of the
// script chain (after config/utils, before features), and the header —
// including #themeToggle — is parsed before any <script>, so this can
// run synchronously without DOMContentLoaded.
initTheme();

