/* ═══════════════════════════════════════════════════════════════
   Ashara 1448 – Mafasih Allocation System  |  app.js
   ═══════════════════════════════════════════════════════════════ */

// ─── STATE ────────────────────────────────────────────────────
let CU = null;          // current user { itsId, name, role, eventId }
let CACHE = {};         // { members, events, activeEvent, relayCenters, zones, allocations }
let CURRENT_PAGE = '';

// ─── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('maf_user');
  if (saved) { CU = JSON.parse(saved); bootApp(); }
  document.getElementById('login-its').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
});

// ─── AUTH ──────────────────────────────────────────────────────
async function handleLogin() {
  const its = document.getElementById('login-its').value.trim();
  if (!its) return showLoginErr('Enter your ITS ID.');
  hideLoginErr();
  try {
    const res = await api('login', { itsId: its });
    if (!res.member) return showLoginErr('ITS ID not found. Contact your Admin.');
    CU = { itsId: its, name: res.member.fullName, role: res.role, eventId: res.activeEventId };
    sessionStorage.setItem('maf_user', JSON.stringify(CU));
    if (res.appData) applyCache(res.appData);   // ← data already here, no 2nd round-trip
    bootApp(!!res.appData);
  } catch (e) { showLoginErr('Connection error. Check config.js GAS URL.'); }
}

function handleLogout() {
  sessionStorage.removeItem('maf_user');
  CU = null; CACHE = {};
  document.getElementById('login-its').value = '';
  showScreen('login-screen');
}

function showLoginErr(m) {
  const el = document.getElementById('login-error');
  el.textContent = m; el.classList.remove('hidden');
}
function hideLoginErr() { document.getElementById('login-error').classList.add('hidden'); }

// ─── BOOT APP ─────────────────────────────────────────────────
async function bootApp(cacheAlreadyLoaded) {
  showScreen('app-screen');
  document.getElementById('user-dot').textContent = CU.name.charAt(0).toUpperCase();
  document.getElementById('sb-name').textContent = CU.name;
  document.getElementById('sb-role').textContent = CU.role;
  buildNav();
  if (!cacheAlreadyLoaded) await loadCache();
  updateEventPill();
  navigateTo(defaultPage());
}

function defaultPage() {
  if (CU.role === 'Admin') return 'dashboard';
  if (CU.role === 'Lead')  return 'allocation';
  return 'my-allocation';
}

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  const all = [
    { page:'dashboard',     label:'Dashboard',       icon:'📊', roles:['Admin','Lead'] },
    { page:'allocation',    label:'Allocation',       icon:'🗂️', roles:['Admin','Lead'] },
    { page:'allocation-view',label:'Allocation View', icon:'👁️', roles:['Admin','Lead'] },
    { page:'session-report',label:'Session Report',   icon:'📝', roles:['Admin','Lead'] },
    { page:'my-allocation', label:'My Allocation',    icon:'📋', roles:['Member'] },
    { page:'my-reports',    label:'My Reports',       icon:'🧾', roles:['Member'] },
    { page:'members',       label:'Members',          icon:'👥', roles:['Admin'] },
    { page:'events',        label:'Events',           icon:'📅', roles:['Admin'] },
    { page:'event-mafasih', label:'Event Mafasih',    icon:'⭐', roles:['Admin'] },
    { page:'relay-centers', label:'Relay Centers',    icon:'🏛️', roles:['Admin','Lead'] },
    { page:'jackets',       label:'Jackets',          icon:'🧥', roles:['Admin','Lead'] },
    { page:'finance',       label:'Finance',          icon:'💰', roles:['Admin','Lead'] },
    { page:'reports',       label:'Reports',          icon:'📄', roles:['Admin','Lead'] },
    { page:'my-finance',    label:'My Contributions', icon:'💳', roles:['Member'] },
  ];
  nav.innerHTML = all.filter(n => n.roles.includes(CU.role)).map(n =>
    `<button class="nav-item" data-page="${n.page}" onclick="navigateTo('${n.page}')">
      <span class="ni">${n.icon}</span>${n.label}
    </button>`
  ).join('');
}

// ─── NAVIGATION ───────────────────────────────────────────────
function navigateTo(page) {
  CURRENT_PAGE = page;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  const titles = {
    dashboard:'Dashboard', allocation:'Mafasih Allocation', 'allocation-view':'Allocation View',
    'session-report':'Session Report', 'my-reports':'My Reports', 'my-allocation':'My Allocation',
    members:'Members', events:'Events', 'event-mafasih':'Event Mafasih', 'relay-centers':'Relay Centers & Zones',
    jackets:'Jacket Management', finance:'Finance', reports:'Reports', 'my-finance':'My Contributions'
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('topbar-right').innerHTML = '';
  closeSidebar();
  const body = document.getElementById('page-body');
  body.innerHTML = '<div class="loading">Loading…</div>';
  const pages = {
    dashboard: renderDashboard, allocation: renderAllocation,
    'allocation-view': renderAllocationView,
    'session-report': renderSessionReport, 'my-reports': renderMyReports,
    'my-allocation': renderMyAllocation, members: renderMembers,
    events: renderEvents, 'event-mafasih': renderEventMafasih,
    'relay-centers': renderRelayCenters,
    jackets: renderJackets, finance: renderFinance,
    reports: renderReports, 'my-finance': renderMyFinance
  };
  if (pages[page]) pages[page]();
}

// ─── SIDEBAR ──────────────────────────────────────────────────
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('visible'); }

// ─── CACHE ────────────────────────────────────────────────────
function applyCache(res) {
  CACHE.members      = res.members      || [];
  CACHE.events       = res.events       || [];
  CACHE.activeEvent  = res.activeEvent  || null;
  CACHE.relayCenters = res.relayCenters || [];
  CACHE.zones        = res.zones        || [];
  CACHE.eventMembers = res.eventMembers || [];
  CACHE.rcMembers    = res.rcMembers    || [];
  if (CACHE.activeEvent) CU.eventId = CACHE.activeEvent.id;
}

async function loadCache() {
  try {
    const res = await api('getAppData', { itsId: CU.itsId });
    applyCache(res);
  } catch(e) { CACHE = { members:[], events:[], relayCenters:[], zones:[], eventMembers:[], rcMembers:[] }; }
}

function updateEventPill() {
  const pill = document.getElementById('event-pill');
  pill.textContent = CACHE.activeEvent ? CACHE.activeEvent.name : 'No active event';
}

// ─── DASHBOARD ────────────────────────────────────────────────
async function renderDashboard() {
  const evId = CU.eventId;
  const stats = {
    eventMembers: CACHE.eventMembers.filter(em => em.eventId === evId).length,
    relayCenters: CACHE.relayCenters.filter(r => r.eventId === evId).length,
    zones:        CACHE.zones.filter(z => z.eventId === evId).length,
  };
  const ev = CACHE.activeEvent;
  document.getElementById('page-body').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-val">${stats.eventMembers||0}</div><div class="stat-lbl">Active Mafasih</div></div>
      <div class="stat-card"><div class="stat-icon">🏛️</div><div class="stat-val">${stats.relayCenters||0}</div><div class="stat-lbl">Relay Centers</div></div>
      <div class="stat-card"><div class="stat-icon">🗂️</div><div class="stat-val">${stats.zones||0}</div><div class="stat-lbl">Zones</div></div>
      <div class="stat-card"><div class="stat-icon">🧥</div><div class="stat-val" id="stat-jacket">…</div><div class="stat-lbl">Jacket Balances Due</div></div>
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-val" id="stat-finance">…</div><div class="stat-lbl">Contribution Units</div></div>
    </div>
    <div class="card">
      <div class="card-title">Active Event</div>
      ${ev ? `
        <div class="info-row"><span class="info-lbl">Name</span><strong>${esc(ev.name)}</strong></div>
        <div class="info-row"><span class="info-lbl">Dates</span><span>${esc(ev.startDate)} → ${esc(ev.endDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Status</span><span class="badge-status bs-active">Active</span></div>
      ` : '<p class="empty-state">No active event. Create one under Events.</p>'}
    </div>`;

  // Lazy-load the two heavier stats without blocking the page render
  if (CU.eventId) {
    api('getDashboardStats', { eventId: CU.eventId }).then(r => {
      const j = document.getElementById('stat-jacket');
      const f = document.getElementById('stat-finance');
      if (j) j.textContent = r.jacketBalance || 0;
      if (f) f.textContent = r.financeUnits || 0;
    }).catch(()=>{
      const j = document.getElementById('stat-jacket');
      const f = document.getElementById('stat-finance');
      if (j) j.textContent = '—';
      if (f) f.textContent = '—';
    });
  }
}

// ─── EVENTS ───────────────────────────────────────────────────
async function renderEvents() {
  const events = CACHE.events;
  document.getElementById('topbar-right').innerHTML =
    `<button class="btn-primary sm" onclick="openEventModal()">+ New Event</button>`;
  document.getElementById('page-body').innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
        <tbody>${events.length ? events.map(e => `
          <tr>
            <td><strong>${esc(e.name)}</strong></td>
            <td>${esc(e.startDate)}</td><td>${esc(e.endDate)}</td>
            <td><span class="badge-status ${e.active==='Yes'?'bs-active':'bs-inactive'}">${e.active==='Yes'?'Active':'Inactive'}</span></td>
            <td class="flex-gap" style="padding:8px 14px">
              ${e.active!=='Yes'?`<button class="btn-ghost" onclick="setActiveEvent('${e.id}')">Set Active</button>`:''}
              <button class="btn-danger" onclick="deleteEvent('${e.id}')">Delete</button>
            </td>
          </tr>`).join('') : `<tr><td colspan="5" class="tbl-empty">No events yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openEventModal(ev) {
  openModal('New Event', `
    <div class="form-grid">
      <div class="field-group span2"><label>Event Name<span class="req">*</span></label>
        <input id="ev-name" placeholder="e.g. Ashara 1447" value="${ev?esc(ev.name):''}"/></div>
      <div class="field-group"><label>Start Date<span class="req">*</span></label>
        <input id="ev-start" type="date" value="${ev?ev.startDate:''}"/></div>
      <div class="field-group"><label>End Date<span class="req">*</span></label>
        <input id="ev-end" type="date" value="${ev?ev.endDate:''}"/></div>
    </div>`,
    [{label:'Save Event', primary:true, fn:'saveEvent()'}]);
}

async function saveEvent() {
  const name = v('ev-name'), start = v('ev-start'), end = v('ev-end');
  if (!name||!start||!end) return showToast('All fields required.','error');
  try {
    await api('saveEvent', { name, startDate:start, endDate:end, adminIts:CU.itsId });
    showToast('Event saved.','success');
    closeModal(); await loadCache(); renderEvents(); updateEventPill();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

async function setActiveEvent(id) {
  try {
    await api('setActiveEvent', { eventId:id, adminIts:CU.itsId });
    showToast('Active event updated.','success');
    await loadCache(); updateEventPill(); renderEvents();
  } catch(e) { showToast('Failed.','error'); }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event? All allocation history for this event will be lost.')) return;
  try {
    await api('deleteEvent', { eventId:id, adminIts:CU.itsId });
    showToast('Deleted.','success'); await loadCache(); renderEvents();
  } catch(e) { showToast('Failed.','error'); }
}

// ─── EVENT MAFASIH (active shortlist for current event) ────────
async function renderEventMafasih() {
  if (!CU.eventId) return noEvent();
  const eventMemberIts = CACHE.eventMembers
    .filter(em => em.eventId === CU.eventId)
    .map(em => em.itsId);

  const inEvent = CACHE.members.filter(m => eventMemberIts.includes(m.itsId));
  const notInEvent = CACHE.members.filter(m => !eventMemberIts.includes(m.itsId));

  document.getElementById('page-body').innerHTML = `
    <div class="alert-info">These are the Mafasih doing khidmat in <strong>${CACHE.activeEvent?esc(CACHE.activeEvent.name):'this event'}</strong>. Only people added here can be selected as Leads or assigned to zones.</div>
    <div class="card">
      <div class="card-title">Add Mafasih to Event</div>
      <div class="flex-gap">
        <select class="select-input" id="add-em-select" style="flex:1;min-width:220px">
          <option value="">Select member to add…</option>
          ${notInEvent.map(m=>`<option value="${m.itsId}">${esc(m.fullName)} (${m.itsId})</option>`).join('')}
        </select>
        <button class="btn-primary sm" onclick="addEventMafasih()">Add</button>
      </div>
      ${notInEvent.length===0?'<p class="form-hint mt8">All members are already in this event.</p>':''}
    </div>
    <div class="section-hd">Active Mafasih <span>${inEvent.length} member(s)</span></div>
    ${inEvent.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>ITS ID</th><th>Full Name</th><th>Jamaat</th><th>Role this Event</th><th></th></tr></thead>
      <tbody>${inEvent.map(m=>{
        const isLead = CACHE.relayCenters.some(rc => rc.eventId===CU.eventId && rc.leadIts===m.itsId);
        return `<tr>
          <td>${esc(m.itsId)}</td>
          <td><strong>${esc(m.fullName)}</strong></td>
          <td>${esc(m.jamaat||'—')}</td>
          <td>${isLead?'<span class="badge-status bs-active">Lead</span>':'<span class="tag">Member</span>'}</td>
          <td style="padding:8px 14px">
            <button class="btn-danger" onclick="removeEventMafasih('${m.itsId}')" ${isLead?'disabled title="Remove as Lead first"':''}>Remove</button>
          </td>
        </tr>`;}).join('')}
      </tbody></table></div>` : '<p class="empty-state">No Mafasih added to this event yet. Add members above.</p>'}`;
}

async function addEventMafasih() {
  const itsId = v('add-em-select');
  if (!itsId) return showToast('Select a member first.','error');
  try {
    await api('addEventMember', { eventId:CU.eventId, itsId, adminIts:CU.itsId });
    showToast('Added to event.','success');
    await loadCache(); renderEventMafasih();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

async function removeEventMafasih(itsId) {
  if (!confirm('Remove this member from the event shortlist?')) return;
  try {
    await api('removeEventMember', { eventId:CU.eventId, itsId, adminIts:CU.itsId });
    showToast('Removed.','success');
    await loadCache(); renderEventMafasih();
  } catch(e) { showToast('Failed.','error'); }
}


// ─── MEMBERS ──────────────────────────────────────────────────
async function renderMembers() {
  document.getElementById('topbar-right').innerHTML =
    `<button class="btn-primary sm" onclick="openMemberModal()">+ Add Member</button>`;
  const members = CACHE.members;
  document.getElementById('page-body').innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="mem-search" placeholder="Search by name or ITS…" oninput="filterMembers()"/>
    </div>
    <div id="members-table">
      ${buildMembersTable(members)}
    </div>`;
}

function buildMembersTable(members) {
  if (!members.length) return '<p class="empty-state">No members yet.</p>';
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>ITS ID</th><th>Full Name</th><th>Jamaat</th><th>Gender</th><th>WhatsApp</th><th></th></tr></thead>
    <tbody>${members.map(m=>`
      <tr>
        <td>${esc(m.itsId)}</td>
        <td><strong>${esc(m.fullName)}</strong></td>
        <td>${esc(m.jamaat||'—')}</td>
        <td>${esc(m.gender||'—')}</td>
        <td>${esc(m.whatsapp||'—')}</td>
        <td class="flex-gap" style="padding:8px 14px">
          <button class="btn-ghost" onclick="openMemberModal(${JSON.stringify(m).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn-danger" onclick="deleteMember('${m.itsId}')">✕</button>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function filterMembers() {
  const q = v('mem-search').toLowerCase();
  const filtered = CACHE.members.filter(m =>
    m.fullName.toLowerCase().includes(q) || String(m.itsId).includes(q));
  document.getElementById('members-table').innerHTML = buildMembersTable(filtered);
}

function openMemberModal(m) {
  const d = m || {};
  openModal(m ? 'Edit Member' : 'Add Member', `
    <div class="form-grid cols3">
      <div class="field-group"><label>ITS ID<span class="req">*</span></label>
        <input id="m-its" type="number" value="${d.itsId||''}" ${m?'readonly':''}/></div>
      <div class="field-group span2"><label>Full Name<span class="req">*</span></label>
        <input id="m-name" value="${esc(d.fullName||'')}"/></div>
      <div class="field-group"><label>WhatsApp No.</label>
        <input id="m-wa" value="${esc(d.whatsapp||'')}"/></div>
      <div class="field-group"><label>Jamaat</label>
        <input id="m-jamaat" value="${esc(d.jamaat||'')}"/></div>
      <div class="field-group"><label>Gender</label>
        <select id="m-gender">
          <option value="">—</option>
          ${['Male','Female','Other'].map(g=>`<option ${d.gender===g?'selected':''}>${g}</option>`).join('')}
        </select></div>
      <div class="field-group"><label>Age</label>
        <input id="m-age" type="number" value="${d.age||''}"/></div>
      <div class="field-group"><label>Sr.</label>
        <input id="m-sr" value="${esc(d.sr||'')}"/></div>
      <div class="field-group"><label>Jamiaat</label>
        <input id="m-jamiaat" value="${esc(d.jamiaat||'')}"/></div>
    </div>`,
    [{label:'Save', primary:true, fn:'saveMember()'}]);
}

async function saveMember() {
  const its = v('m-its'), name = v('m-name');
  if (!its||!name) return showToast('ITS ID and Full Name required.','error');
  const data = { itsId:its, fullName:name, whatsapp:v('m-wa'),
    jamaat:v('m-jamaat'), gender:v('m-gender'), age:v('m-age'), sr:v('m-sr'),
    jamiaat:v('m-jamiaat'), adminIts:CU.itsId };
  try {
    await api('saveMember', data);
    showToast('Member saved.','success');
    closeModal(); await loadCache(); renderMembers();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

async function deleteMember(itsId) {
  if (!confirm('Remove this member from the system?')) return;
  try {
    await api('deleteMember', { itsId, adminIts:CU.itsId });
    showToast('Removed.','success'); await loadCache(); renderMembers();
  } catch(e) { showToast('Failed.','error'); }
}

// ─── RELAY CENTERS & ZONES ────────────────────────────────────
async function renderRelayCenters() {
  if (!CU.eventId) return noEvent();
  const rcs = CACHE.relayCenters.filter(r => r.eventId === CU.eventId);
  const zones = CACHE.zones.filter(z => z.eventId === CU.eventId);
  const eventMembers = CACHE.eventMembers.filter(em => em.eventId === CU.eventId);

  if (CU.role === 'Admin') {
    document.getElementById('topbar-right').innerHTML =
      `<button class="btn-primary sm" onclick="openRCModal()">+ Relay Center</button>`;
  }

  document.getElementById('page-body').innerHTML = `
    <div id="rc-list">
      ${rcs.length ? rcs.map(rc => {
        const rcZones = zones.filter(z => z.rcId === rc.id);
        const lead = CACHE.members.find(m => m.itsId === rc.leadIts);
        const poolCount = (CACHE.rcMembers||[]).filter(rm => rm.rcId === rc.id).length;
        return `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:14px 18px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:space-between">
            <div>
              <h4 style="font-family:var(--serif);font-size:17px">${esc(rc.name)}</h4>
              <div style="font-size:12px;color:var(--accent);margin-top:2px">
                Lead: ${lead?esc(lead.fullName):'Unassigned'} &middot; ${poolCount} member(s) in pool
              </div>
            </div>
            ${CU.role==='Admin'?`
            <div class="flex-gap">
              <button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.3)" onclick="openPoolModal('${rc.id}')">Manage Members</button>
              <button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.3)" onclick="openRCModal(${JSON.stringify(rc).replace(/"/g,'&quot;')})">Edit</button>
              <button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.3)" onclick="openZoneModal('${rc.id}')">+ Zone</button>
              <button class="btn-danger" onclick="deleteRC('${rc.id}')">Delete</button>
            </div>`:''}
          </div>
          ${rcZones.map(z => `
            <div style="padding:10px 18px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:14px">${esc(z.name)}</span>
              ${CU.role==='Admin'?`<button class="btn-danger" onclick="deleteZone('${z.id}')">Remove</button>`:''}
            </div>`).join('')}
          ${!rcZones.length?`<div style="padding:12px 18px;color:var(--muted);font-size:13px">No zones yet.</div>`:''}
        </div>`}).join('') : '<p class="empty-state">No relay centers for this event yet.</p>'}
    </div>`;
}

function openRCModal(rc) {
  const d = rc || {};
  const eventMembers = CACHE.eventMembers.filter(em => em.eventId === CU.eventId);
  const membersInEvent = eventMembers.map(em => CACHE.members.find(m => m.itsId === em.itsId)).filter(Boolean);
  if (!membersInEvent.length) {
    openModal('No Event Mafasih Yet', `
      <div class="alert-info">You need to add Mafasih to this event before creating a relay center, so you have someone to assign as Lead.</div>
      <p style="font-size:14px">Go to <strong>Event Mafasih</strong> in the menu, add the members doing khidmat this event, then come back here.</p>`,
      [{label:'Go to Event Mafasih', primary:true, fn:'closeModal();navigateTo("event-mafasih")'}]);
    return;
  }
  openModal(rc?'Edit Relay Center':'New Relay Center', `
    <div class="form-grid cols1">
      <div class="field-group"><label>Relay Center Name<span class="req">*</span></label>
        <input id="rc-name" value="${esc(d.name||'')}"/></div>
      <div class="field-group"><label>Lead (from event Mafasih)<span class="req">*</span></label>
        <select id="rc-lead">
          <option value="">Select Lead…</option>
          ${membersInEvent.map(m=>`<option value="${m.itsId}" ${d.leadIts===m.itsId?'selected':''}>${esc(m.fullName)} (${m.itsId})</option>`).join('')}
        </select></div>
    </div>`,
    [{label:'Save', primary:true, fn:`saveRC('${d.id||''}')`}]);
}

async function saveRC(id) {
  const name = v('rc-name'), lead = v('rc-lead');
  if (!name||!lead) return showToast('All fields required.','error');
  try {
    await api('saveRC', { id, name, leadIts:lead, eventId:CU.eventId, adminIts:CU.itsId });
    showToast('Relay Center saved.','success');
    closeModal(); await loadCache(); renderRelayCenters();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

async function deleteRC(id) {
  if (!confirm('Delete relay center and all its zones?')) return;
  try {
    await api('deleteRC', { id, adminIts:CU.itsId });
    showToast('Deleted.','success'); await loadCache(); renderRelayCenters();
  } catch(e) { showToast('Failed.','error'); }
}

// ─── RELAY CENTER MEMBER POOL ─────────────────────────────────
function openPoolModal(rcId) {
  const rc = CACHE.relayCenters.find(r => r.id === rcId);
  const eventMemberIts = CACHE.eventMembers
    .filter(em => em.eventId === CU.eventId).map(em => em.itsId);
  const eventMembersList = CACHE.members.filter(m => eventMemberIts.includes(m.itsId));
  const inPool = new Set((CACHE.rcMembers||[]).filter(rm => rm.rcId === rcId).map(rm => rm.itsId));

  const rows = eventMembersList.map(m => {
    const isLead = rc && rc.leadIts === m.itsId;
    const checked = inPool.has(m.itsId) || isLead;
    return `
    <label class="pool-row">
      <input type="checkbox" value="${m.itsId}" ${checked?'checked':''} ${isLead?'disabled':''} class="pool-chk"/>
      <span>${esc(m.fullName)} <span class="tag">${m.itsId}</span></span>
      ${isLead?'<span class="badge-status bs-active" style="margin-left:auto">Lead</span>':''}
    </label>`;
  }).join('');

  openModal(`Manage Members — ${rc?esc(rc.name):''}`, `
    <div class="alert-info">Select which event Mafasih are available to this relay center. The Lead is always included. A person can be in more than one relay center's pool.</div>
    <div class="pool-list">${rows || '<p class="empty-state">No event Mafasih. Add them under Event Mafasih first.</p>'}</div>`,
    [{label:'Save Pool', primary:true, fn:`savePool('${rcId}')`}]);
}

async function savePool(rcId) {
  const checked = Array.from(document.querySelectorAll('.pool-chk:checked')).map(c => c.value);
  try {
    await api('saveRCPool', { rcId, eventId:CU.eventId, members:JSON.stringify(checked), adminIts:CU.itsId });
    showToast('Member pool saved.','success');
    closeModal(); await loadCache(); renderRelayCenters();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}


function openZoneModal(rcId) {
  openModal('Add Zone', `
    <div class="form-grid cols1">
      <div class="field-group"><label>Zone Name<span class="req">*</span></label>
        <input id="zone-name" placeholder="e.g. Zone A"/></div>
    </div>`,
    [{label:'Add Zone', primary:true, fn:`saveZone('${rcId}')`}]);
}

async function saveZone(rcId) {
  const name = v('zone-name');
  if (!name) return showToast('Zone name required.','error');
  try {
    await api('saveZone', { rcId, name, eventId:CU.eventId, adminIts:CU.itsId });
    showToast('Zone added.','success'); closeModal(); await loadCache(); renderRelayCenters();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

async function deleteZone(id) {
  if (!confirm('Remove this zone?')) return;
  try {
    await api('deleteZone', { id, adminIts:CU.itsId });
    showToast('Removed.','success'); await loadCache(); renderRelayCenters();
  } catch(e) { showToast('Failed.','error'); }
}

// ─── ALLOCATION ───────────────────────────────────────────────
let ALLOC_SESSION = 'Morning';
let ALLOC_DATE = todayStr();
let ALLOC_DATA = {};   // zoneId → [itsId, itsId, ...]

async function renderAllocation() {
  if (!CU.eventId) return noEvent();
  document.getElementById('topbar-right').innerHTML =
    `<button class="btn-primary sm" onclick="saveAllocation()">💾 Save Allocation</button>`;

  document.getElementById('page-body').innerHTML = `
    <div class="flex-gap" style="margin-bottom:16px">
      <div class="field-group" style="flex:0 0 auto">
        <label>Date</label>
        <input type="date" id="alloc-date" value="${ALLOC_DATE}" onchange="ALLOC_DATE=this.value;loadAllocData()"/>
      </div>
      <div class="session-tabs">
        <button class="session-tab ${ALLOC_SESSION==='Morning'?'active-morning':''}" onclick="switchSession('Morning')">☀️ Morning (Day Waaz)</button>
        <button class="session-tab ${ALLOC_SESSION==='Evening'?'active-evening':''}" onclick="switchSession('Evening')">🌙 Evening (Night Majalis)</button>
      </div>
    </div>
    <div class="alert-info">Add one or more Mafasih to each zone. A person can only be in one zone per session. Saving snapshots the previous state for history.</div>
    <div id="alloc-board" class="rc-grid"></div>`;

  await loadAllocData();
}

async function loadAllocData() {
  const board = document.getElementById('alloc-board');
  if (!board) return;
  board.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await api('getAllocation', { eventId:CU.eventId, date:ALLOC_DATE, session:ALLOC_SESSION });
    ALLOC_DATA = {};
    (res.allocation || []).forEach(a => {
      if (!ALLOC_DATA[a.zoneId]) ALLOC_DATA[a.zoneId] = [];
      ALLOC_DATA[a.zoneId].push(a.itsId);
    });
    renderAllocBoard();
  } catch(e) { board.innerHTML = '<p class="empty-state">Failed to load.</p>'; }
}

function renderAllocBoard() {
  const board = document.getElementById('alloc-board');
  if (!board) return;
  const rcs = CACHE.relayCenters.filter(r => r.eventId === CU.eventId);
  const myRCs = CU.role === 'Admin' ? rcs : rcs.filter(r => r.leadIts === CU.itsId);
  const zones = CACHE.zones.filter(z => z.eventId === CU.eventId);

  board.innerHTML = myRCs.map(rc => {
    const rcZones = zones.filter(z => z.rcId === rc.id);
    const lead = CACHE.members.find(m => m.itsId === rc.leadIts);
    return `
    <div class="rc-card">
      <div class="rc-card-header">
        <h4>${esc(rc.name)}</h4>
        <span class="lead-tag">Lead: ${lead?esc(lead.fullName):'—'}</span>
      </div>
      ${rcZones.map(z => renderZoneBlock(z)).join('')}
      ${!rcZones.length?'<div style="padding:12px 16px;color:var(--muted);font-size:13px">No zones set up.</div>':''}
    </div>`;
  }).join('') || '<p class="empty-state">No relay centers assigned to you for this event.</p>';
}

function renderZoneBlock(zone) {
  const assigned = ALLOC_DATA[zone.id] || [];
  const chips = assigned.map(itsId => {
    const name = getMemberName(itsId);
    return `<span class="member-chip">${esc(name)}<button onclick="removeFromZone('${zone.id}','${itsId}')" title="Remove">✕</button></span>`;
  }).join('');

  return `
  <div class="zone-block">
    <div class="zone-block-head">
      <span class="zone-name">${esc(zone.name)}</span>
      <span class="zone-count">${assigned.length} assigned</span>
    </div>
    <div class="zone-chips">${chips || '<span class="zone-empty">No one assigned yet</span>'}</div>
    <div class="zone-add">
      <button class="btn-ghost" style="width:100%" onclick="openZonePicker('${zone.id}')">+ Add Mafasih (multi-select)</button>
    </div>
  </div>`;
}

// Multi-select picker for a zone
function openZonePicker(zoneId) {
  const zone = CACHE.zones.find(z => z.id === zoneId);
  const rc = CACHE.relayCenters.find(r => r.id === zone.rcId);
  const avail = availableMembers(zoneId);
  const already = new Set(ALLOC_DATA[zoneId] || []);
  // Also show currently-assigned people (so they can be unticked)
  const assignedMembers = (ALLOC_DATA[zoneId]||[]).map(its=>CACHE.members.find(m=>m.itsId===its)).filter(Boolean);
  const all = [...assignedMembers, ...avail.filter(m=>!already.has(m.itsId))];

  if (!all.length) {
    openModal(`${zone?esc(zone.name):'Zone'}`, `
      <div class="alert-info">No available Mafasih for this zone. Everyone in this relay center's pool is either already placed in another zone this session, or the pool is empty. Add members to the pool under <strong>Relay Centers → Manage Members</strong>.</div>`,
      []);
    return;
  }

  const list = all.map(m => `
    <label class="pool-row">
      <input type="checkbox" value="${m.itsId}" ${already.has(m.itsId)?'checked':''} class="zpick-chk"/>
      <span>${esc(m.fullName)} <span class="tag">${m.itsId}</span></span>
      ${rc && rc.leadIts===m.itsId?'<span class="badge-status bs-active" style="margin-left:auto">Lead</span>':''}
    </label>`).join('');

  openModal(`Assign to ${zone?esc(zone.name):'Zone'}`, `
    <div class="alert-info">Tick everyone who should be in this zone this session. Untick to remove. Save when done — nothing is written until you click "Save Allocation" on the board.</div>
    <div class="pool-list">${list}</div>`,
    [{label:'Apply Selection', primary:true, fn:`applyZonePicker('${zoneId}')`}]);
}

function applyZonePicker(zoneId) {
  const picked = Array.from(document.querySelectorAll('.zpick-chk:checked')).map(c=>c.value);
  // Conflict guard: ensure none are in another zone this session
  for (const itsId of picked) {
    const conflict = Object.entries(ALLOC_DATA).find(([zId, arr]) => zId!==zoneId && (arr||[]).includes(itsId));
    if (conflict) {
      const cz = CACHE.zones.find(z=>z.id===conflict[0]);
      showToast(`${getMemberName(itsId)} is already in ${cz?cz.name:'another zone'} this session.`,'error');
      return;
    }
  }
  ALLOC_DATA[zoneId] = picked;
  closeModal();
  renderAllocBoard();
}

// Members in this zone's relay-center pool, not yet assigned to ANY zone this session
function availableMembers(zoneId) {
  const zone = CACHE.zones.find(z => z.id === zoneId);
  if (!zone) return [];
  // Pool for this zone's relay center
  const poolIts = (CACHE.rcMembers||[])
    .filter(rm => rm.rcId === zone.rcId)
    .map(rm => rm.itsId);
  // Include the lead automatically even if not explicitly in pool rows
  const rc = CACHE.relayCenters.find(r => r.id === zone.rcId);
  if (rc && rc.leadIts && !poolIts.includes(rc.leadIts)) poolIts.push(rc.leadIts);

  const poolMembers = poolIts.map(its => CACHE.members.find(m => m.itsId === its)).filter(Boolean);

  const assignedAnywhere = new Set();
  Object.values(ALLOC_DATA).forEach(arr => (arr||[]).forEach(id => assignedAnywhere.add(id)));
  return poolMembers.filter(m => !assignedAnywhere.has(m.itsId));
}

function removeFromZone(zoneId, itsId) {
  if (ALLOC_DATA[zoneId]) {
    ALLOC_DATA[zoneId] = ALLOC_DATA[zoneId].filter(id => id !== itsId);
  }
  renderAllocBoard();
}

function switchSession(session) {
  ALLOC_SESSION = session;
  loadAllocData();
}

async function saveAllocation() {
  const entries = [];
  Object.entries(ALLOC_DATA).forEach(([zoneId, arr]) => {
    (arr||[]).forEach(itsId => { if (itsId) entries.push({ zoneId, itsId }); });
  });
  try {
    await api('saveAllocation', {
      eventId:CU.eventId, date:ALLOC_DATE,
      session:ALLOC_SESSION, entries:JSON.stringify(entries),
      savedBy:CU.itsId
    });
    showToast('Allocation saved and history recorded.','success');
  } catch(e) { showToast('Save failed: '+e.message,'error'); }
}

// ─── ALLOCATION VIEW (read-only, filterable) ──────────────────
let AV_DATE = todayStr();
let AV_SESSION = '';
let AV_RC = '';
let AV_ZONE = '';

async function renderAllocationView() {
  if (!CU.eventId) return noEvent();
  const rcs = CACHE.relayCenters.filter(r => r.eventId === CU.eventId);
  const myRCs = CU.role === 'Admin' ? rcs : rcs.filter(r => r.leadIts === CU.itsId);
  const zones = CACHE.zones.filter(z => z.eventId === CU.eventId && myRCs.some(rc=>rc.id===z.rcId));

  document.getElementById('page-body').innerHTML = `
    <div class="card">
      <div class="form-grid">
        <div class="field-group"><label>Date</label>
          <input type="date" id="av-date" value="${AV_DATE}" onchange="AV_DATE=this.value;loadAllocationView()"/></div>
        <div class="field-group"><label>Session</label>
          <select id="av-session" onchange="AV_SESSION=this.value;loadAllocationView()">
            <option value="">All Sessions</option>
            <option value="Morning" ${AV_SESSION==='Morning'?'selected':''}>Morning</option>
            <option value="Evening" ${AV_SESSION==='Evening'?'selected':''}>Evening</option>
          </select></div>
        <div class="field-group"><label>Relay Center</label>
          <select id="av-rc" onchange="AV_RC=this.value;AV_ZONE='';loadAllocationView()">
            <option value="">All Relay Centers</option>
            ${myRCs.map(rc=>`<option value="${rc.id}" ${AV_RC===rc.id?'selected':''}>${esc(rc.name)}</option>`).join('')}
          </select></div>
        <div class="field-group"><label>Zone</label>
          <select id="av-zone" onchange="AV_ZONE=this.value;loadAllocationView()">
            <option value="">All Zones</option>
            ${zones.filter(z=>!AV_RC||z.rcId===AV_RC).map(z=>`<option value="${z.id}" ${AV_ZONE===z.id?'selected':''}>${esc(z.name)}</option>`).join('')}
          </select></div>
      </div>
    </div>
    <div id="av-result"></div>`;

  loadAllocationView();
}

async function loadAllocationView() {
  const el = document.getElementById('av-result');
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading…</div>';

  const sessions = AV_SESSION ? [AV_SESSION] : ['Morning','Evening'];
  let allRows = [];
  try {
    for (const sess of sessions) {
      const res = await api('getAllocation', { eventId:CU.eventId, date:AV_DATE, session:sess });
      (res.allocation||[]).forEach(a => allRows.push({ ...a, session:sess }));
    }
  } catch(e) { el.innerHTML = '<p class="empty-state">Failed to load.</p>'; return; }

  // Build a structured view: RC → Zone → members
  const rcs = CACHE.relayCenters.filter(r => r.eventId === CU.eventId);
  const myRCs = CU.role === 'Admin' ? rcs : rcs.filter(r => r.leadIts === CU.itsId);
  const zones = CACHE.zones.filter(z => z.eventId === CU.eventId);

  let visibleRCs = myRCs;
  if (AV_RC) visibleRCs = visibleRCs.filter(rc => rc.id === AV_RC);

  let html = '';
  visibleRCs.forEach(rc => {
    const lead = CACHE.members.find(m => m.itsId === rc.leadIts);
    let rcZones = zones.filter(z => z.rcId === rc.id);
    if (AV_ZONE) rcZones = rcZones.filter(z => z.id === AV_ZONE);
    if (!rcZones.length) return;

    // Does this RC have any allocation in the filtered set?
    let rcHtml = '';
    rcZones.forEach(zone => {
      sessions.forEach(sess => {
        const members = allRows
          .filter(r => r.zoneId === zone.id && r.session === sess)
          .map(r => CACHE.members.find(m => m.itsId === r.itsId))
          .filter(Boolean);
        if (!members.length) return;
        rcHtml += `
          <div class="av-zone">
            <div class="av-zone-head">
              <span>${esc(zone.name)}</span>
              <span class="badge-${sess==='Morning'?'morning':'evening'}">${sess}</span>
              <span class="zone-count">${members.length}</span>
            </div>
            <div class="av-members">
              ${members.map(m => {
                const isLead = rc.leadIts === m.itsId;
                return `<div class="av-member">
                  <span>${esc(m.fullName)}</span>
                  ${isLead?'<span class="badge-status bs-active">Lead</span>':'<span class="tag">Member</span>'}
                </div>`;
              }).join('')}
            </div>
          </div>`;
      });
    });

    if (rcHtml) {
      html += `
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
          <div style="padding:13px 18px;background:var(--primary);color:#fff">
            <h4 style="font-family:var(--serif);font-size:16px">${esc(rc.name)}</h4>
            <div style="font-size:12px;color:var(--accent);margin-top:2px">Lead: ${lead?esc(lead.fullName):'—'}</div>
          </div>
          <div style="padding:14px 18px">${rcHtml}</div>
        </div>`;
    }
  });

  el.innerHTML = html || '<p class="empty-state">No allocation found for the selected filters.</p>';
}

// ─── SESSION REPORT (Lead/Admin) ──────────────────────────────
let SR_DATE = todayStr();
let SR_SESSION = 'Morning';
let SR_RC = '';
let SR_DATA = [];      // [{itsId, memberName, zoneName, jacketWorn, attendance, remarks}]
let SR_SUBMITTED = false;

async function renderSessionReport() {
  if (!CU.eventId) return noEvent();
  const rcs = CACHE.relayCenters.filter(r => r.eventId === CU.eventId);
  const myRCs = CU.role === 'Admin' ? rcs : rcs.filter(r => r.leadIts === CU.itsId);
  if (!myRCs.length) {
    document.getElementById('page-body').innerHTML = '<p class="empty-state">You are not assigned as Lead of any relay center this event.</p>';
    return;
  }
  if (!SR_RC || !myRCs.some(rc=>rc.id===SR_RC)) SR_RC = myRCs[0].id;

  document.getElementById('page-body').innerHTML = `
    <div class="card">
      <div class="form-grid cols3">
        <div class="field-group"><label>Relay Center</label>
          <select id="sr-rc" onchange="SR_RC=this.value;loadSessionReport()">
            ${myRCs.map(rc=>`<option value="${rc.id}" ${SR_RC===rc.id?'selected':''}>${esc(rc.name)}</option>`).join('')}
          </select></div>
        <div class="field-group"><label>Date</label>
          <input type="date" id="sr-date" value="${SR_DATE}" onchange="SR_DATE=this.value;loadSessionReport()"/></div>
        <div class="field-group"><label>Session</label>
          <select id="sr-session" onchange="SR_SESSION=this.value;loadSessionReport()">
            <option value="Morning" ${SR_SESSION==='Morning'?'selected':''}>Morning</option>
            <option value="Evening" ${SR_SESSION==='Evening'?'selected':''}>Evening</option>
          </select></div>
      </div>
    </div>
    <div id="sr-result"></div>`;
  loadSessionReport();
}

async function loadSessionReport() {
  const el = document.getElementById('sr-result');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await api('getSessionReport', { eventId:CU.eventId, rcId:SR_RC, date:SR_DATE, session:SR_SESSION });
    SR_DATA = res.members || [];
    SR_SUBMITTED = res.submitted || false;
    renderSessionReportTable();
  } catch(e) { el.innerHTML = '<p class="empty-state">Failed to load.</p>'; }
}

function renderSessionReportTable() {
  const el = document.getElementById('sr-result');
  if (!SR_DATA.length) {
    el.innerHTML = '<p class="empty-state">No Mafasih were allocated to this relay center for this session, so there is nothing to report.</p>';
    return;
  }
  const locked = SR_SUBMITTED && CU.role !== 'Admin';

  el.innerHTML = `
    ${SR_SUBMITTED ? `<div class="alert-info">${CU.role==='Admin'?'This report is submitted. As Admin you can still edit and re-save it.':'This report has been submitted and is locked.'}</div>` : ''}
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Mafasih</th><th>Zone</th><th>Jacket Worn</th><th>Attendance</th><th>Remarks</th></tr></thead>
        <tbody>
          ${SR_DATA.map((m,i)=>`
            <tr>
              <td><strong>${esc(m.memberName)}</strong></td>
              <td>${esc(m.zoneName)}</td>
              <td>
                <select class="select-input" id="sr-jacket-${i}" ${locked?'disabled':''}>
                  <option value="">—</option>
                  <option value="Yes" ${m.jacketWorn==='Yes'?'selected':''}>Yes</option>
                  <option value="No" ${m.jacketWorn==='No'?'selected':''}>No</option>
                </select>
              </td>
              <td>
                <select class="select-input" id="sr-att-${i}" ${locked?'disabled':''}>
                  <option value="">—</option>
                  <option ${m.attendance==='Present'?'selected':''}>Present</option>
                  <option ${m.attendance==='Absent'?'selected':''}>Absent</option>
                  <option ${m.attendance==='Late'?'selected':''}>Late</option>
                </select>
              </td>
              <td><input class="search-input" style="min-width:120px" id="sr-rem-${i}" value="${esc(m.remarks)}" ${locked?'disabled':''}/></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${!locked ? `
    <div class="flex-gap mt16">
      <button class="btn-secondary" onclick="saveSessionReportData(false)">Save Draft</button>
      <button class="btn-primary" onclick="saveSessionReportData(true)">Submit Report</button>
    </div>
    <p class="form-hint mt8">Submitting locks the report and unlocks the next session's allocation. ${CU.role==='Admin'?'As Admin you can edit even after submission.':''}</p>
    ` : ''}`;
}

async function saveSessionReportData(finalize) {
  const entries = SR_DATA.map((m,i)=>({
    itsId: m.itsId,
    jacketWorn: document.getElementById(`sr-jacket-${i}`).value,
    attendance: document.getElementById(`sr-att-${i}`).value,
    remarks: document.getElementById(`sr-rem-${i}`).value.trim()
  }));
  if (finalize) {
    const missing = entries.some(e => !e.jacketWorn || !e.attendance);
    if (missing && !confirm('Some entries are missing Jacket Worn or Attendance. Submit anyway?')) return;
  }
  try {
    await api('saveSessionReport', {
      eventId:CU.eventId, rcId:SR_RC, date:SR_DATE, session:SR_SESSION,
      entries:JSON.stringify(entries), finalize:finalize?'true':'false', savedBy:CU.itsId
    });
    showToast(finalize?'Report submitted.':'Draft saved.','success');
    loadSessionReport();
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

// ─── MY REPORTS (Member) ───────────────────────────────────────
async function renderMyReports() {
  if (!CU.eventId) return noEvent();
  try {
    const res = await api('getMyReports', { itsId:CU.itsId, eventId:CU.eventId });
    const reps = res.reports || [];
    document.getElementById('page-body').innerHTML = `
      <div class="card">
        <div class="card-title">My Session Reports — ${CACHE.activeEvent?esc(CACHE.activeEvent.name):''}</div>
        ${reps.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Session</th><th>Relay Center</th><th>Jacket Worn</th><th>Attendance</th><th>Remarks</th></tr></thead>
          <tbody>${reps.map(r=>`<tr>
            <td>${esc(r.date)}</td>
            <td><span class="badge-${r.session==='Morning'?'morning':'evening'}">${esc(r.session)}</span></td>
            <td>${esc(r.rcName)}</td>
            <td>${esc(r.jacketWorn||'—')}</td>
            <td>${esc(r.attendance||'—')}</td>
            <td>${esc(r.remarks||'—')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-state">No reports recorded for you yet.</p>'}
      </div>`;
  } catch(e) { document.getElementById('page-body').innerHTML = '<p class="empty-state">Failed to load.</p>'; }
}

// ─── MY ALLOCATION (Member) ────────────────────────────────────
async function renderMyAllocation() {
  if (!CU.eventId) return noEvent();
  try {
    const res = await api('getMyAllocation', { itsId:CU.itsId, eventId:CU.eventId });
    const allocs = res.allocations || [];
    document.getElementById('page-body').innerHTML = `
      <div class="card">
        <div class="card-title">Your Allocation — ${CACHE.activeEvent?esc(CACHE.activeEvent.name):''}</div>
        ${allocs.length ? `
        <div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Session</th><th>Relay Center</th><th>Zone</th></tr></thead>
          <tbody>${allocs.map(a=>`
            <tr>
              <td>${esc(a.date)}</td>
              <td><span class="badge-${a.session==='Morning'?'morning':'evening'}">${esc(a.session)}</span></td>
              <td>${esc(a.rcName)}</td>
              <td>${esc(a.zoneName)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="empty-state">No allocation found for you in this event.</p>'}
      </div>`;
  } catch(e) { document.getElementById('page-body').innerHTML = '<p class="empty-state">Failed to load.</p>'; }
}

// ─── JACKETS ──────────────────────────────────────────────────
const SIZES = ['S','M','L','XL','XXL'];

async function renderJackets() {
  let stock = {}, sales = [];
  try {
    const res = await api('getJackets', {});
    stock = res.stock || {};
    sales = res.sales || [];
  } catch(e) {}

  document.getElementById('topbar-right').innerHTML = `
    <button class="btn-secondary sm" onclick="openStockModal()">+ Add Stock</button>
    <button class="btn-primary sm" onclick="openSaleModal()">+ New Sale</button>`;

  const remaining = {};
  SIZES.forEach(s => {
    const totalIn = (stock[s]||[]).reduce((a,b) => a+Number(b.qty),0);
    const totalOut = sales.filter(sl=>sl.size===s).reduce((a,b)=>a+Number(b.qty),0);
    remaining[s] = totalIn - totalOut;
  });

  document.getElementById('page-body').innerHTML = `
    <div class="size-grid">
      ${SIZES.map(s=>`
        <div class="size-card ${remaining[s]<=2?'low':'ok'}">
          <div class="sz">${s}</div>
          <div class="sz-stock">In stock</div>
          <div class="sz-val">${remaining[s]}</div>
        </div>`).join('')}
    </div>
    <div class="section-hd">Sales & Balances</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Person</th><th>Size</th><th>Qty</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>${sales.length ? sales.map(s=>{
          const bal = Number(s.totalPrice) - Number(s.totalPaid);
          const st = bal<=0?'bs-paid': Number(s.totalPaid)>0?'bs-partial':'bs-unpaid';
          const stl = bal<=0?'Paid':Number(s.totalPaid)>0?'Partial':'Unpaid';
          return `<tr>
            <td><strong>${esc(s.memberName)}</strong></td>
            <td>${esc(s.size)}</td><td>${s.qty}</td>
            <td>AED ${Number(s.totalPrice).toFixed(2)}</td>
            <td>AED ${Number(s.totalPaid).toFixed(2)}</td>
            <td><strong ${bal>0?'style="color:var(--danger)"':''}>${bal>0?'AED '+bal.toFixed(2):'—'}</strong></td>
            <td><span class="badge-status ${st}">${stl}</span></td>
            <td>${bal>0?`<button class="btn-ghost" onclick="openPaymentModal('${s.id}','${esc(s.memberName)}',${bal})">Pay</button>`:''}
            </td>
          </tr>`;}).join('') : `<tr><td colspan="8" class="tbl-empty">No sales yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openStockModal() {
  openModal('Add Jacket Stock', `
    <div class="form-grid">
      <div class="field-group"><label>Size<span class="req">*</span></label>
        <select id="stk-size">${SIZES.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field-group"><label>Quantity<span class="req">*</span></label>
        <input id="stk-qty" type="number" min="1" placeholder="0"/></div>
      <div class="field-group"><label>Date Received<span class="req">*</span></label>
        <input id="stk-date" type="date" value="${todayStr()}"/></div>
      <div class="field-group"><label>Notes</label>
        <input id="stk-notes" placeholder="Optional"/></div>
    </div>`,
    [{label:'Add Stock', primary:true, fn:'saveStock()'}]);
}

async function saveStock() {
  const size=v('stk-size'),qty=v('stk-qty'),date=v('stk-date');
  if(!size||!qty||!date) return showToast('All required fields needed.','error');
  try {
    await api('addJacketStock',{size,qty,date,notes:v('stk-notes'),adminIts:CU.itsId});
    showToast('Stock added.','success'); closeModal(); renderJackets();
  } catch(e){showToast('Failed.','error');}
}

function openSaleModal() {
  const memberOpts = CACHE.members.map(m=>
    `<option value="${m.itsId}">${esc(m.fullName)} (${m.itsId})</option>`).join('');
  openModal('New Jacket Sale', `
    <div class="form-grid">
      <div class="field-group span2"><label>Member<span class="req">*</span></label>
        <select id="sale-its"><option value="">Select member…</option>${memberOpts}</select></div>
      <div class="field-group"><label>Size<span class="req">*</span></label>
        <select id="sale-size">${SIZES.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field-group"><label>Quantity<span class="req">*</span></label>
        <input id="sale-qty" type="number" min="1" value="1"/></div>
      <div class="field-group"><label>Price per Unit (AED)<span class="req">*</span></label>
        <input id="sale-price" type="number" min="0" step="0.01" placeholder="0.00"/></div>
      <div class="field-group"><label>Amount Paid Now (AED)<span class="req">*</span></label>
        <input id="sale-paid" type="number" min="0" step="0.01" placeholder="0.00"/></div>
      <div class="field-group"><label>Date<span class="req">*</span></label>
        <input id="sale-date" type="date" value="${todayStr()}"/></div>
    </div>`,
    [{label:'Record Sale', primary:true, fn:'saveSale()'}]);
}

async function saveSale() {
  const its=v('sale-its'),size=v('sale-size'),qty=v('sale-qty'),
        price=v('sale-price'),paid=v('sale-paid'),date=v('sale-date');
  if(!its||!size||!qty||!price||paid===''||!date) return showToast('All required fields needed.','error');
  if(Number(paid)>Number(qty)*Number(price)) return showToast('Paid cannot exceed total price.','error');
  try {
    await api('addJacketSale',{itsId:its,size,qty,pricePerUnit:price,paidAmount:paid,date,soldBy:CU.itsId});
    showToast('Sale recorded.','success'); closeModal(); renderJackets();
  } catch(e){showToast('Failed: '+e.message,'error');}
}

function openPaymentModal(saleId, memberName, balance) {
  openModal(`Record Payment — ${memberName}`, `
    <div class="form-grid cols1">
      <div class="field-group"><label>Outstanding Balance</label>
        <input value="AED ${Number(balance).toFixed(2)}" readonly style="background:var(--surface2)"/></div>
      <div class="field-group"><label>Amount Paying Now (AED)<span class="req">*</span></label>
        <input id="pay-amt" type="number" min="0.01" step="0.01" max="${balance}" placeholder="0.00"/></div>
      <div class="field-group"><label>Date<span class="req">*</span></label>
        <input id="pay-date" type="date" value="${todayStr()}"/></div>
    </div>`,
    [{label:'Record Payment', primary:true, fn:`saveJacketPayment('${saleId}',${balance})`}]);
}

async function saveJacketPayment(saleId, balance) {
  const amt=v('pay-amt'),date=v('pay-date');
  if(!amt||!date) return showToast('All fields required.','error');
  if(Number(amt)>Number(balance)) return showToast('Cannot pay more than balance.','error');
  try {
    await api('addJacketPayment',{saleId,amount:amt,date,recordedBy:CU.itsId});
    showToast('Payment recorded.','success'); closeModal(); renderJackets();
  } catch(e){showToast('Failed.','error');}
}

// ─── FINANCE ──────────────────────────────────────────────────
async function renderFinance() {
  if (!CU.eventId) return noEvent();
  let funds = [], units = [];
  try {
    const res = await api('getFinance', { eventId:CU.eventId });
    funds = res.funds || [];
    units = res.units || [];
  } catch(e) {}

  document.getElementById('topbar-right').innerHTML =
    CU.role==='Admin' ? `<button class="btn-primary sm" onclick="openFundModal()">+ Fund Settings</button>` : '';

  const eventMembers = CACHE.eventMembers.filter(em=>em.eventId===CU.eventId);
  const membersInEvent = eventMembers.map(em=>CACHE.members.find(m=>m.itsId===em.itsId)).filter(Boolean);

  document.getElementById('page-body').innerHTML = `
    ${['Ziyafat','Ziyarat'].map(fundName => {
      const fund = funds.find(f=>f.name===fundName);
      const fundUnits = units.filter(u=>u.fundName===fundName);
      const totalCollected = fundUnits.reduce((a,u)=>a+Number(u.totalPaid),0);
      const totalExpected  = fundUnits.reduce((a,u)=>a+Number(u.minimumAmount),0);
      return `
      <div style="margin-bottom:22px">
        <div class="fund-header">
          <div>
            <h3>${fundName}</h3>
            <div class="fund-meta">Min per unit: ${fund?'AED '+fund.minAmount:'Not set'} &middot; Collected: AED ${totalCollected.toFixed(2)} / AED ${totalExpected.toFixed(2)}</div>
          </div>
          <button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.3)" onclick="openUnitModal('${fundName}')">+ Add Unit</button>
        </div>
        <div class="fund-body">
          ${fundUnits.length ? fundUnits.map(u=>{
            const bal = Number(u.minimumAmount)-Number(u.totalPaid);
            const pct = Math.min(100,Number(u.totalPaid)/Math.max(1,Number(u.minimumAmount))*100);
            return `
            <div class="unit-row">
              <div class="unit-members">${esc(u.member1Name)}${u.member2Name?' & '+esc(u.member2Name):''}</div>
              <div style="font-size:12px;color:var(--muted)">Target: AED ${u.minimumAmount}</div>
              <div class="unit-progress">
                <div class="prog-bar-wrap"><div class="prog-bar-fill ${pct>=100?'prog-full':pct>0?'prog-part':'prog-empty'}" style="width:${pct}%"></div></div>
                <span class="prog-label">AED ${u.totalPaid} paid</span>
              </div>
              ${bal>0?`<div style="font-size:12px;color:var(--danger);margin-top:4px">Balance due: AED ${bal.toFixed(2)}</div>`:''}
              <div class="flex-gap mt8">
                <button class="btn-ghost" onclick="openContribModal('${u.id}','${esc(u.member1Name)}',${bal})">+ Payment</button>
                ${CU.role==='Admin'?`<button class="btn-danger" onclick="deleteUnit('${u.id}')">Remove</button>`:''}
              </div>
            </div>`;}).join('') : `<div style="padding:16px;color:var(--muted);font-size:13px;text-align:center">No units yet.</div>`}
        </div>
      </div>`;
    }).join('')}`;
}

function openFundModal() {
  openModal('Fund Settings (per event)', `
    <div class="alert-info">Set the minimum contribution amount for each fund for the current event.</div>
    <div class="form-grid cols1">
      <div class="field-group"><label>Ziyafat — Minimum Amount (AED)<span class="req">*</span></label>
        <input id="fund-ziyafat" type="number" min="0" placeholder="e.g. 500"/></div>
      <div class="field-group"><label>Ziyarat — Minimum Amount (AED)<span class="req">*</span></label>
        <input id="fund-ziyarat" type="number" min="0" placeholder="e.g. 1000"/></div>
    </div>`,
    [{label:'Save Settings', primary:true, fn:'saveFundSettings()'}]);
}

async function saveFundSettings() {
  const z1=v('fund-ziyafat'), z2=v('fund-ziyarat');
  if(!z1||!z2) return showToast('Both amounts required.','error');
  try {
    await api('saveFundSettings',{eventId:CU.eventId,
      funds:JSON.stringify([{name:'Ziyafat',minAmount:z1},{name:'Ziyarat',minAmount:z2}]),
      adminIts:CU.itsId});
    showToast('Settings saved.','success'); closeModal(); renderFinance();
  } catch(e){showToast('Failed.','error');}
}

function openUnitModal(fundName) {
  const eventMembers = CACHE.eventMembers.filter(em=>em.eventId===CU.eventId);
  const membersInEvent = eventMembers.map(em=>CACHE.members.find(m=>m.itsId===em.itsId)).filter(Boolean);
  const opts = `<option value="">—</option>`+membersInEvent.map(m=>
    `<option value="${m.itsId}">${esc(m.fullName)} (${m.itsId})</option>`).join('');
  openModal(`New ${fundName} Unit`, `
    <div class="alert-info">A unit can be contributed by 1 or 2 members. Max 2 members per unit.</div>
    <div class="form-grid cols1">
      <div class="field-group"><label>Member 1<span class="req">*</span></label>
        <select id="unit-m1">${opts}</select></div>
      <div class="field-group"><label>Member 2 (optional)</label>
        <select id="unit-m2">${opts}</select></div>
      <div class="field-group"><label>Initial Payment — Member 1 (AED)</label>
        <input id="unit-pay1" type="number" min="0" step="0.01" placeholder="0.00"/></div>
      <div class="field-group"><label>Initial Payment — Member 2 (AED)</label>
        <input id="unit-pay2" type="number" min="0" step="0.01" placeholder="0.00"/></div>
    </div>`,
    [{label:'Create Unit', primary:true, fn:`saveUnit('${fundName}')`}]);
}

async function saveUnit(fundName) {
  const m1=v('unit-m1'), m2=v('unit-m2');
  if(!m1) return showToast('At least one member required.','error');
  if(m2&&m2===m1) return showToast('Member 1 and Member 2 cannot be the same person.','error');
  const pay1=v('unit-pay1')||'0', pay2=v('unit-pay2')||'0';
  if(m2===''&&Number(pay2)>0) return showToast('Member 2 payment entered but no member selected.','error');
  try {
    await api('saveContributionUnit',{
      eventId:CU.eventId, fundName,
      member1Its:m1, member2Its:m2||'',
      payment1:pay1, payment2:pay2,
      date:todayStr(), recordedBy:CU.itsId
    });
    showToast('Unit created.','success'); closeModal(); renderFinance();
  } catch(e){showToast('Failed: '+e.message,'error');}
}

function openContribModal(unitId, memberName, balance) {
  openModal('Record Payment', `
    <div class="form-grid cols1">
      <div class="field-group"><label>Unit Balance</label>
        <input value="AED ${Number(balance).toFixed(2)}" readonly style="background:var(--surface2)"/></div>
      <div class="field-group"><label>Member Paying<span class="req">*</span></label>
        <select id="cp-member">
          <option value="member1">Member 1</option>
          <option value="member2">Member 2</option>
        </select></div>
      <div class="field-group"><label>Amount (AED)<span class="req">*</span></label>
        <input id="cp-amount" type="number" min="0.01" step="0.01" placeholder="0.00"/></div>
      <div class="field-group"><label>Date<span class="req">*</span></label>
        <input id="cp-date" type="date" value="${todayStr()}"/></div>
    </div>`,
    [{label:'Record Payment', primary:true, fn:`saveContribPayment('${unitId}')`}]);
}

async function saveContribPayment(unitId) {
  const who=v('cp-member'), amt=v('cp-amount'), date=v('cp-date');
  if(!who||!amt||!date) return showToast('All fields required.','error');
  try {
    await api('addContribPayment',{unitId,whichMember:who,amount:amt,date,recordedBy:CU.itsId});
    showToast('Payment recorded.','success'); closeModal(); renderFinance();
  } catch(e){showToast('Failed.','error');}
}

async function deleteUnit(unitId) {
  if(!confirm('Remove this contribution unit?')) return;
  try {
    await api('deleteContribUnit',{unitId,adminIts:CU.itsId});
    showToast('Removed.','success'); renderFinance();
  } catch(e){showToast('Failed.','error');}
}

// ─── MY FINANCE (Member) ───────────────────────────────────────
async function renderMyFinance() {
  if (!CU.eventId) return noEvent();
  try {
    const res = await api('getMyFinance',{itsId:CU.itsId, eventId:CU.eventId});
    const units = res.units||[], jackets=res.jackets||[];
    document.getElementById('page-body').innerHTML = `
      <div class="card">
        <div class="card-title">My Contribution Units</div>
        ${units.length ? units.map(u=>{
          const bal=Number(u.minimumAmount)-Number(u.totalPaid);
          const myPaid = CU.itsId===u.member1Its?Number(u.paid1):Number(u.paid2);
          return `<div class="info-row">
            <span>${esc(u.fundName)} ${u.member2Name?' (shared with '+esc(u.member2Name)+')':''}</span>
            <div style="text-align:right">
              <div>My paid: <strong>AED ${myPaid.toFixed(2)}</strong></div>
              ${bal>0?`<div style="color:var(--danger);font-size:12px">Unit balance: AED ${bal.toFixed(2)}</div>`:'<div style="color:var(--success);font-size:12px">✓ Complete</div>'}
            </div>
          </div>`;}).join('') : '<p style="color:var(--muted);font-size:14px">No contributions recorded.</p>'}
      </div>
      <div class="card mt16">
        <div class="card-title">My Jacket Balance</div>
        ${jackets.length ? jackets.map(j=>{
          const bal=Number(j.totalPrice)-Number(j.totalPaid);
          return `<div class="info-row">
            <span>${j.size} × ${j.qty} jacket(s)</span>
            <div style="text-align:right">
              <div>Total: AED ${Number(j.totalPrice).toFixed(2)}</div>
              ${bal>0?`<div style="color:var(--danger);font-size:12px">Balance: AED ${bal.toFixed(2)}</div>`:'<div style="color:var(--success);font-size:12px">✓ Paid</div>'}
            </div>
          </div>`;}).join('') : '<p style="color:var(--muted);font-size:14px">No jacket purchases.</p>'}
      </div>`;
  } catch(e){ document.getElementById('page-body').innerHTML='<p class="empty-state">Failed to load.</p>'; }
}

// ─── REPORTS ──────────────────────────────────────────────────
async function renderReports() {
  if (!CU.eventId) return noEvent();
  document.getElementById('page-body').innerHTML = `
    <div class="card">
      <div class="card-title">Allocation History Report</div>
      <div class="form-grid">
        <div class="field-group"><label>Date</label>
          <input type="date" id="rep-date" value="${todayStr()}"/></div>
        <div class="field-group"><label>Session</label>
          <select id="rep-session">
            <option value="">All Sessions</option>
            <option>Morning</option><option>Evening</option>
          </select></div>
      </div>
      <button class="btn-primary mt8" onclick="loadAllocReport()">Generate</button>
      <div id="rep-alloc-result" class="mt16"></div>
    </div>
    <div class="card mt16">
      <div class="card-title">Finance Summary</div>
      <button class="btn-primary" onclick="loadFinanceReport()">Generate</button>
      <div id="rep-fin-result" class="mt16"></div>
    </div>
    <div class="card mt16">
      <div class="card-title">Jacket Balances</div>
      <button class="btn-primary" onclick="loadJacketReport()">Generate</button>
      <div id="rep-jkt-result" class="mt16"></div>
    </div>`;
}

async function loadAllocReport() {
  const date=v('rep-date'), session=v('rep-session');
  const el=document.getElementById('rep-alloc-result');
  el.innerHTML='<div class="loading">Loading…</div>';
  try {
    const res=await api('getAllocReport',{eventId:CU.eventId,date,session});
    const rows=res.rows||[];
    el.innerHTML=rows.length?`<div class="tbl-wrap"><table>
      <thead><tr><th>Date</th><th>Session</th><th>Relay Center</th><th>Lead</th><th>Zone</th><th>Mafasih</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${esc(r.date)}</td>
        <td><span class="badge-${r.session==='Morning'?'morning':'evening'}">${esc(r.session)}</span></td>
        <td>${esc(r.rcName)}</td><td>${esc(r.leadName||'—')}</td><td>${esc(r.zoneName)}</td><td>${esc(r.memberName)}</td>
      </tr>`).join('')}</tbody></table></div>`
      :'<p class="empty-state">No records found.</p>';
  } catch(e){el.innerHTML='<p class="empty-state">Failed.</p>';}
}

async function loadFinanceReport() {
  const el=document.getElementById('rep-fin-result');
  el.innerHTML='<div class="loading">Loading…</div>';
  try {
    const res=await api('getFinanceReport',{eventId:CU.eventId});
    const funds=res.funds||[];
    el.innerHTML=funds.map(f=>`
      <div style="margin-bottom:12px">
        <strong>${esc(f.name)}</strong> — Collected: AED ${f.collected} / Expected: AED ${f.expected}
        <div class="prog-bar-wrap mt8"><div class="prog-bar-fill prog-full" style="width:${Math.min(100,f.collected/Math.max(1,f.expected)*100).toFixed(1)}%"></div></div>
      </div>`).join('')||'<p class="empty-state">No data.</p>';
  } catch(e){el.innerHTML='<p class="empty-state">Failed.</p>';}
}

async function loadJacketReport() {
  const el=document.getElementById('rep-jkt-result');
  el.innerHTML='<div class="loading">Loading…</div>';
  try {
    const res=await api('getJackets',{});
    const sales=res.sales||[];
    const outstanding=sales.filter(s=>Number(s.totalPrice)-Number(s.totalPaid)>0);
    el.innerHTML=outstanding.length?`<div class="tbl-wrap"><table>
      <thead><tr><th>Member</th><th>Size</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
      <tbody>${outstanding.map(s=>`<tr>
        <td>${esc(s.memberName)}</td><td>${s.size}</td>
        <td>AED ${Number(s.totalPrice).toFixed(2)}</td>
        <td>AED ${Number(s.totalPaid).toFixed(2)}</td>
        <td style="color:var(--danger)"><strong>AED ${(Number(s.totalPrice)-Number(s.totalPaid)).toFixed(2)}</strong></td>
      </tr>`).join('')}</tbody></table></div>`
      :'<p style="color:var(--success);padding:16px">All jacket balances are settled.</p>';
  } catch(e){el.innerHTML='<p class="empty-state">Failed.</p>';}
}

// ─── EVENT MEMBER MANAGEMENT ──────────────────────────────────
// Admin adds members to an event's active shortlist via Relay Centers page header
// This is handled inside the RC modal — lead is selected from event members
// Admin manages event members from Members page via the event shortlist button

// ─── MODAL ────────────────────────────────────────────────────
function openModal(title, bodyHtml, actions) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML =
    `<button class="btn-secondary" onclick="closeModal()">Cancel</button>` +
    (actions||[]).map(a =>
      `<button class="${a.primary?'btn-primary':'btn-secondary'}" onclick="${a.fn}">${esc(a.label)}</button>`
    ).join('');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ─── API ──────────────────────────────────────────────────────
async function api(action, params={}) {
  const url = new URL(window.GAS_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => {
    url.searchParams.set(k, typeof v==='object'?JSON.stringify(v):v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('HTTP '+res.status);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ─── TOAST ────────────────────────────────────────────────────
let _tt;
function showToast(msg, type='') {
  clearTimeout(_tt);
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type}`;
  t.classList.remove('hidden');
  _tt = setTimeout(()=>t.classList.add('hidden'), 3400);
}

// ─── HELPERS ──────────────────────────────────────────────────
function v(id) { const el=document.getElementById(id); return el?el.value.trim():''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function getMemberName(itsId) { const m=CACHE.members.find(m=>m.itsId===itsId); return m?m.fullName:itsId; }
function noEvent() {
  document.getElementById('page-body').innerHTML =
    `<div class="card"><p class="empty-state">No active event. Ask Admin to create and activate an event first.</p></div>`;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
