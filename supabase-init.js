// ================================================================
//  NASS Branch Tracker — Supabase Integration Layer
// ================================================================
const SUPABASE_URL      = 'https://sblqmpmawkogbbzzkwxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibHFtcG1hd2tvZ2Jienprd3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDQwMTYsImV4cCI6MjA5MTM4MDAxNn0.U5Fgn2HZ7nYizr81P2Ba2j-EEmG2MTq3zFT79d--GcM';

const CONFIG_KEYS = ['nassOfficers', 'nassStatuses', 'nassLocations', 'nassActions', 'nassFileIndex'];
var GDRIVE_CLIENT_ID = '1073280029907-0166ddlukbg2mg6mprp6hlk34l9fsj5a.apps.googleusercontent.com';
var GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
var _gTok = null, _gTokExpiresAt = 0, _gCC = null, _gTokenQueue = [], _gRefreshInFlight = false;

async function _gDriveAuthCall(action, code) {
  if (!window._sb) throw new Error('Tracker session is not ready.');
  const { data, error } = await window._sb.functions.invoke('gdrive-auth', {
    body: { action: action, code: code || undefined },
    headers: { 'X-Requested-With': 'XmlHttpRequest' }
  });
  if (error) {
    let message = error.message || 'Google Drive authorization failed.';
    try {
      const detail = await error.context.clone().json();
      if (detail.error) message = detail.error;
    } catch (_) {}
    throw new Error(message);
  }
  return data || {};
}

function _gApplyAccess(data) {
  if (!data || !data.access_token) throw new Error('Google Drive did not return a usable access token.');
  _gTok = data.access_token;
  _gTokExpiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
  const modal = document.getElementById('gdrive-auth-modal');
  if (modal) modal.style.display = 'none';
  _gDrainTokenQueue();
}

function _gDrainTokenQueue() {
  const queued = _gTokenQueue.splice(0);
  queued.forEach(function (callback) {
    try { Promise.resolve(callback()).catch(function (error) { console.error('[Drive] Request failed:', error); }); }
    catch (error) { console.error('[Drive] Request failed:', error); }
  });
}

function _gShowAuthModal(message) {
  const modal = document.getElementById('gdrive-auth-modal');
  const status = document.getElementById('gdrive-auth-status');
  if (status && message) status.textContent = message;
  if (modal) modal.style.display = 'flex';
}

function _gclient() {
  if (_gCC) return _gCC;
  const oauth = window.google && window.google.accounts && window.google.accounts.oauth2;
  if (!oauth) return null;
  _gCC = oauth.initCodeClient({
    client_id: GDRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    ux_mode: 'popup',
    include_granted_scopes: true,
    callback: async function (response) {
      if (!response || !response.code) {
        _gShowAuthModal(response && response.error_description || 'Google Drive authorization was not completed.');
        return;
      }
      try {
        const result = await _gDriveAuthCall('exchange', response.code);
        _gApplyAccess(result);
      } catch (error) {
        _gShowAuthModal(error.message || 'Could not connect Google Drive. Please try again.');
      }
    },
    error_callback: function (error) {
      _gShowAuthModal(error && error.type === 'popup_failed_to_open'
        ? 'Allow pop-ups for this tracker, then try connecting again.'
        : 'Google authorization was closed before it finished. Try again when ready.');
    }
  });
  return _gCC;
}

function _gwithToken(callback) {
  if (_gTok && _gTokExpiresAt > Date.now() + 60000) { callback(); return; }
  if (typeof callback === 'function') _gTokenQueue.push(callback);
  if (_gRefreshInFlight) return;
  _gRefreshInFlight = true;
  _gDriveAuthCall('refresh').then(_gApplyAccess).catch(function (error) {
    _gShowAuthModal(error.message || 'Reconnect Google Drive to continue.');
  }).finally(function () { _gRefreshInFlight = false; });
}

function initGoogleDriveSession() {
  const button = document.getElementById('gdrive-auth-btn');
  if (button) button.onclick = function () {
    const client = _gclient();
    if (!client) {
      _gShowAuthModal('Google sign-in is still loading. Please try again in a moment.');
      return;
    }
    client.requestCode();
  };

  // Access tokens live only in memory. The server keeps the refresh token for
  // this tracker user and returns fresh access tokens until tracker logout.
  localStorage.removeItem('nass_gdrive_token');
  localStorage.removeItem('nass_gdrive_expiry');
  _gDriveAuthCall('refresh').then(_gApplyAccess).catch(function (error) {
    _gShowAuthModal(error.message || 'Connect Google Drive to search documents.');
  });
}

// Parallel array to `rows` — stores the Supabase UUID for each record.
var rowIds = [];

// ── Bootstrap ──────────────────────────────────────────────────
(async function init() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:    true,   // save token to localStorage
      autoRefreshToken:  true,   // silently renew before expiry
      detectSessionInUrl: false, // not needed for email/password auth
      storage:           window.localStorage
    }
  });
  window._sb = sb;

  // Step 1 — read whatever token is in localStorage
  let { data: { session } } = await sb.auth.getSession();

  // Step 2 — if token is expired (or expiring within 60 s), try a silent refresh
  //           This handles the "came back after >1 hour" case without re-login
  if (session) {
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt < Date.now() + 60000) {
      const { data: refreshed } = await sb.auth.refreshSession();
      session = refreshed?.session ?? null;
    }
  }

  if (!session) {
    hide('nass-loading');
    show('nass-login');
    bindLoginForm(sb);
    return;
  }

  // Pull latest data from Supabase, then load app
  try {
  await pullData(sb);

  // Resolve the calling user's role from nass_profiles
  const { data: profile } = await sb
    .from('nass_profiles')
    .select('role, display_name')
    .eq('user_id', session.user.id)
    .maybeSingle();
  window.userRole    = profile?.role || 'viewer';
  window.userSession = session;

  // ── Force password change for newly-invited users ─────────────
  if (session.user.user_metadata?.must_change_password) {
    hide('nass-loading');
    showChangePasswordModal(sb);
    return;
  }

  await loadScript('config.js');
  await loadScript('utils.js');
  await loadScript('tracker.js');
  await loadScript('drive.js');
  await loadScript('dashboard.js');
  await loadScript('admin.js');
  await loadScript('inbox.js');
  await loadScript('app.js');
  if (typeof _mlStartPolling === 'function') _mlStartPolling();
  // chat.js is lazy-loaded on first FAB click — see _nassAiLaunch in index.html
  if (typeof window.nassShowFab === 'function') window.nassShowFab();
  if (typeof applyRolePermissions === 'function') applyRolePermissions();
  if (typeof _mlSubscribeRealtime === 'function') _mlSubscribeRealtime(sb);

  initGoogleDriveSession();

  // Sync rowIds with current rows
  rowIds = JSON.parse(localStorage.getItem('nassRowIds') || '[]');
  while (rowIds.length < rows.length) rowIds.push(null);

  // Proxy rows so push/splice keep rowIds aligned automatically
  applyRowsProxy();

  // Wrap loadData to re-proxy rows after each reload from localStorage
  const _origLoad = loadData;
  loadData = function () {
    _origLoad();
    rowIds = JSON.parse(localStorage.getItem('nassRowIds') || '[]');
    applyRowsProxy();
  };

  // ── Broadcast channel ─────────────────────────────────────────
  // IMPORTANT: subscribe() is awaited so the websocket is confirmed
  // open before we ever call nassChannel.send().
  const nassChannel = sb.channel('nass-broadcast', {
    config: { broadcast: { self: false } }
  });

  nassChannel.on('broadcast', { event: 'data-changed' }, async function (msg) {
    const p = (msg && msg.payload) || {};
    const ids = Array.isArray(p.ids) ? p.ids : [];
    const deleted = Array.isArray(p.deleted) ? p.deleted : [];
    if (ids.length || deleted.length) {
      // Delta path — patch only the affected rows; proxy stays intact (no loadData needed)
      await pullDelta(sb, ids, deleted);
    } else {
      // Legacy senders (or config-only changes) — full pull
      await pullData(sb);
      if (typeof loadData === 'function') loadData();
    }
    if (!isModalOpen() && typeof refresh === 'function') refresh();
  });

  // Wait for SUBSCRIBED — hard 6 s timeout so a stalled socket never freezes the app
  await new Promise((resolve) => {
    const bail = setTimeout(resolve, 6000);
    nassChannel.subscribe((status) => {
      console.log('[NASS] Channel:', status);
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(bail);
        resolve();
      }
    });
  });

  // Wrap saveData: write to localStorage → push to Supabase → notify peers
  const _origSave = window.saveData;
  window.saveData = async function () {
    _origSave();                                          // synchronous localStorage write
    const result = await pushData(sb);                    // push (awaited so errors surface)
    const { changedIds = [], deletedIds = [] } = result || {};
    try {
      // Empty payload = config-only change → peers fall back to full pullData.
      // Non-empty = delta path → peers patch only the named rows.
      await nassChannel.send({
        type: 'broadcast',
        event: 'data-changed',
        payload: { ids: changedIds, deleted: deletedIds }
      });
    } catch (e) {
      console.warn('[NASS] Broadcast send failed:', e);
    }
  };

  // Re-sync when the user returns to this browser tab (throttled to 30 s)
  let _lastVisibilityPull = 0;
  document.addEventListener('visibilitychange', async function () {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - _lastVisibilityPull < 30000) return;
    _lastVisibilityPull = Date.now();
    await pullData(sb);
    if (typeof loadData === 'function') loadData();
    if (!isModalOpen() && typeof refresh === 'function') refresh();
  });

  // Show topbar user info and reveal the app
  const userEl = document.getElementById('nass-user-email');
  if (userEl) userEl.textContent = session.user.email;
  const avatarEl = document.getElementById('nass-user-avatar');
  if (avatarEl) avatarEl.textContent = (session.user.email || '?')[0].toUpperCase();
  show('nass-user-wrap');

  } catch (err) {
    console.error('[NASS] Init error:', err);
  } finally {
    hide('nass-loading'); // always runs — spinner never freezes
  }

})();

// Tracks UUIDs removed locally so pushData can DELETE them without an extra SELECT.
var _nassDeletedIds = new Set();

// In-memory snapshot of last successfully-pushed row state, keyed by UUID.
// Used by pushData to skip UPSERTs for unchanged rows (~300× bandwidth cut at N=319).
// Empty on reload → first save after reload is a full upsert (self-healing).
// Rebuilt by pullData so peer changes don't make every row look dirty.
var _pushSnapshot = new Map();
function _recKey(rec) {
  // Stable, order-fixed key. Excludes updated_at / updated_by which always change.
  return JSON.stringify([
    rec.sort_order, rec.file_ref, rec.subject, rec.location, rec.officer,
    rec.last_action, rec.date_received, rec.date_moved, rec.sla, rec.due_date,
    rec.status, rec.delay_flag, rec.remarks
  ]);
}

// ── Proxy helper ────────────────────────────────────────────────
function applyRowsProxy() {
  rows = new Proxy(rows, {
    get(target, prop) {
      if (prop === 'push') {
        return function (...items) {
          items.forEach(() => rowIds.push(null));
          localStorage.setItem('nassRowIds', JSON.stringify(rowIds));
          return Array.prototype.push.apply(target, items);
        };
      }
      if (prop === 'splice') {
        return function (start, deleteCount, ...items) {
          const removed = rowIds.splice(start, deleteCount, ...new Array(items.length).fill(null));
          removed.forEach(id => { if (id) _nassDeletedIds.add(id); });
          localStorage.setItem('nassRowIds', JSON.stringify(rowIds));
          return Array.prototype.splice.call(target, start, deleteCount, ...items);
        };
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    }
  });
}

// ── Modal state helper ──────────────────────────────────────────
function isModalOpen() {
  const edit   = document.getElementById('mbg');
  const detail = document.getElementById('detail-mbg');
  return (edit   && edit.classList.contains('open')) ||
         (detail && detail.classList.contains('open'));
}

// ── pullData ────────────────────────────────────────────────────
// Fetch all records from nass_records + config from nass_settings
// into localStorage. On first run (empty table), migrates from the
// old nass_settings blob automatically.
// Supabase/PostgREST caps a response at 1,000 rows by default, so
// read records in ordered pages to keep the browser's full register.
async function fetchAllRecords(sb, columns) {
  const pageSize = 1000;
  const records = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from('nass_records')
      .select(columns || '*')
      .order('sort_order', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: null, error };
    records.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { data: records, error: null };
}

async function pullData(sb) {
  // Run paged record loading and settings fetch in parallel.
  const [{ data: records, error: recErr }, { data: settings }] = await Promise.all([
    fetchAllRecords(sb),
    sb.from('nass_settings').select('key, value')
  ]);

  if (recErr) {
    console.error('[NASS] Pull error:', recErr.message);
  } else if (records.length > 0) {
    const newRows = records.map(rec => [
      '',
      rec.file_ref      || '',
      rec.subject       || '',
      rec.location      || '',
      rec.officer       || '',
      rec.last_action   || '',
      rec.date_received || '',
      rec.date_moved    || '',
      rec.sla           || '',
      rec.due_date      || '',
      rec.status        || 'Active',
      rec.delay_flag    || 'ON TIME',
      rec.remarks       || '',
      rec.updated_by    || '',   // [13] audit
      rec.updated_at    || ''    // [14] audit
    ]);
    localStorage.setItem('nassRows',   JSON.stringify(newRows));
    localStorage.setItem('nassRowIds', JSON.stringify(records.map(r => r.id)));
    // Rebuild push-snapshot from server state so the next save only uploads
    // rows the user actually changed locally (not everything we just pulled).
    _pushSnapshot.clear();
    records.forEach((rec, i) => {
      _pushSnapshot.set(rec.id, _recKey({
        sort_order:    i,
        file_ref:      rec.file_ref      || '',
        subject:       rec.subject       || '',
        location:      rec.location      || '',
        officer:       rec.officer       || '',
        last_action:   rec.last_action   || '',
        date_received: rec.date_received || '',
        date_moved:    rec.date_moved    || '',
        sla:           rec.sla           || '',
        due_date:      rec.due_date      || '',
        status:        rec.status        || 'Active',
        delay_flag:    rec.delay_flag    || 'ON TIME',
        remarks:       rec.remarks       || ''
      }));
    });
  } else {
    await migrateFromSettings(sb);
  }

  (settings || [])
    .filter(({ key }) => CONFIG_KEYS.includes(key))
    .forEach(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)));
}

// ── migrateFromSettings ─────────────────────────────────────────
// One-time: copy existing nassRows blob → individual nass_records rows.
async function migrateFromSettings(sb) {
  const { data, error } = await sb
    .from('nass_settings')
    .select('value')
    .eq('key', 'nassRows')
    .maybeSingle();

  if (error || !data?.value?.length) return;

  const inserts = data.value.map((r, i) => ({
    sort_order: i,
    file_ref:      r[1]  || '',
    subject:       r[2]  || '',
    location:      r[3]  || '',
    officer:       r[4]  || '',
    last_action:   r[5]  || '',
    date_received: r[6]  || '',
    date_moved:    r[7]  || '',
    sla:           r[8]  || '',
    due_date:      r[9]  || '',
    status:        r[10] || 'Active',
    delay_flag:    r[11] || 'ON TIME',
    remarks:       r[12] || ''
  }));

  const { data: inserted, error: insErr } = await sb
    .from('nass_records')
    .insert(inserts)
    .select('id, sort_order');

  if (insErr) { console.error('[NASS] Migration error:', insErr.message); return; }

  const ids      = [...inserted].sort((a, b) => a.sort_order - b.sort_order).map(r => r.id);
  const newRows  = data.value.map(r => [...r.slice(0, 13), '', '']);
  localStorage.setItem('nassRows',   JSON.stringify(newRows));
  localStorage.setItem('nassRowIds', JSON.stringify(ids));
  console.log('[NASS] Migrated', inserts.length, 'records.');
}

// ── pushData ────────────────────────────────────────────────────
// Persist current rows to Supabase.
//   • New records (no UUID)  → INSERT  → UUID written back to rowIds
//   • Existing records (UUID) → UPSERT  → fields updated in place
//   • Orphaned records        → DELETE  → rows removed from DB
async function pushData(sb) {
  const { data: { session } } = await sb.auth.getSession();
  const userEmail = session?.user?.email || 'unknown';
  const now       = new Date().toISOString();
  const curRows   = JSON.parse(localStorage.getItem('nassRows') || '[]');

  const toInsert = [];   // { index, rec }
  const toUpsert = [];   // rec (has id)
  const changedIds = []; // UUIDs successfully inserted or upserted (for delta broadcast)
  let deletedIds = [];   // UUIDs successfully deleted (for delta broadcast)

  curRows.forEach((r, i) => {
    const rec = {
      sort_order:    i,
      file_ref:      r[1]  || '',
      subject:       r[2]  || '',
      location:      r[3]  || '',
      officer:       r[4]  || '',
      last_action:   r[5]  || '',
      date_received: r[6]  || '',
      date_moved:    r[7]  || '',
      sla:           r[8]  || '',
      due_date:      r[9]  || '',
      status:        r[10] || 'Active',
      delay_flag:    r[11] || 'ON TIME',
      remarks:       r[12] || '',
      updated_by:    userEmail,
      updated_at:    now
    };
    if (rowIds[i]) {
      // Dirty check — only push rows whose stable fields changed since last push
      if (_pushSnapshot.get(rowIds[i]) !== _recKey(rec)) {
        toUpsert.push({ ...rec, id: rowIds[i] });
      }
    } else {
      toInsert.push({ index: i, rec });
    }
  });
  console.log('[NASS] pushData:', toInsert.length, 'inserts,', toUpsert.length, 'upserts (skipped', curRows.length - toInsert.length - toUpsert.length, 'unchanged)');

  // INSERT new records and capture their UUIDs
  if (toInsert.length) {
    const { data: ins, error: insErr } = await sb
      .from('nass_records')
      .insert(toInsert.map(x => x.rec))
      .select('id, sort_order');
    if (insErr) {
      console.error('[NASS] Insert error:', insErr.message);
    } else if (ins) {
      ins.forEach(rec => { rowIds[rec.sort_order] = rec.id; changedIds.push(rec.id); });
      // Snapshot newly inserted rows so next save sees them as clean
      toInsert.forEach(({ index, rec: insRec }) => {
        if (rowIds[index]) _pushSnapshot.set(rowIds[index], _recKey(insRec));
      });
    }
  }

  // UPSERT existing records
  if (toUpsert.length) {
    const { error: upErr } = await sb
      .from('nass_records')
      .upsert(toUpsert, { onConflict: 'id' });
    if (upErr) {
      console.error('[NASS] Upsert error:', upErr.message);
      // Leave snapshot stale on failure → next save retries these rows
    } else {
      toUpsert.forEach(rec => {
        _pushSnapshot.set(rec.id, _recKey(rec));
        changedIds.push(rec.id);
      });
    }
  }

  // Save updated rowIds (with newly assigned UUIDs)
  localStorage.setItem('nassRowIds', JSON.stringify(rowIds));

  // DELETE records removed locally — IDs were captured in the rows proxy splice,
  // so no extra SELECT round-trip is needed.
  if (_nassDeletedIds.size) {
    const toDelete = [..._nassDeletedIds];
    const { error: delErr } = await sb.from('nass_records').delete().in('id', toDelete);
    if (delErr) console.error('[NASS] Delete error:', delErr.message);
    else {
      toDelete.forEach(id => _pushSnapshot.delete(id));
      _nassDeletedIds.clear();
      deletedIds = toDelete;
    }
  }

  // Push config lists to nass_settings
  const payload = CONFIG_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return { key, value: JSON.parse(raw) }; } catch (e) { return null; }
  }).filter(Boolean);

  if (payload.length) {
    const { error: cfgErr } = await sb
      .from('nass_settings')
      .upsert(payload, { onConflict: 'key' });
    if (cfgErr) console.error('[NASS] Config push error:', cfgErr.message);
  }

  return { changedIds, deletedIds };
}

// ── pullDelta ──────────────────────────────────────────────────
// Patch only the rows specified by ids/deleted (received via broadcast payload).
// Avoids the full-table SELECT in pullData when a peer changed just a few rows.
async function pullDelta(sb, ids, deleted) {
  // Apply deletes first — peer-driven, must NOT be re-queued for our own delete.
  if (deleted && deleted.length) {
    deleted.forEach(did => {
      const idx = rowIds.indexOf(did);
      if (idx >= 0) {
        rows.splice(idx, 1);          // proxy adds did to _nassDeletedIds
        _nassDeletedIds.delete(did);  // undo: peer already deleted server-side
        _pushSnapshot.delete(did);
      }
    });
  }
  // Apply updates / peer-inserted rows
  if (ids && ids.length) {
    const { data, error } = await sb.from('nass_records').select('*').in('id', ids);
    if (error) { console.error('[NASS] Delta fetch error:', error.message); return; }
    (data || []).forEach(rec => {
      const newRow = [
        '',
        rec.file_ref      || '',
        rec.subject       || '',
        rec.location      || '',
        rec.officer       || '',
        rec.last_action   || '',
        rec.date_received || '',
        rec.date_moved    || '',
        rec.sla           || '',
        rec.due_date      || '',
        rec.status        || 'Active',
        rec.delay_flag    || 'ON TIME',
        rec.remarks       || '',
        rec.updated_by    || '',
        rec.updated_at    || ''
      ];
      const idx = rowIds.indexOf(rec.id);
      if (idx >= 0) {
        rows[idx] = newRow;           // in-place; proxy set trap is a no-op pass-through
      } else {
        rows.push(newRow);            // proxy: rowIds.push(null)
        rowIds[rows.length - 1] = rec.id;  // overwrite the null
      }
      // Snapshot must reflect server state so a no-op local save doesn't re-push this row
      _pushSnapshot.set(rec.id, _recKey({
        sort_order:    rowIds.indexOf(rec.id),
        file_ref:      rec.file_ref      || '',
        subject:       rec.subject       || '',
        location:      rec.location      || '',
        officer:       rec.officer       || '',
        last_action:   rec.last_action   || '',
        date_received: rec.date_received || '',
        date_moved:    rec.date_moved    || '',
        sla:           rec.sla           || '',
        due_date:      rec.due_date      || '',
        status:        rec.status        || 'Active',
        delay_flag:    rec.delay_flag    || 'ON TIME',
        remarks:       rec.remarks       || ''
      }));
    });
  }
  // Persist updated rows + rowIds so a reload sees them
  localStorage.setItem('nassRows',   JSON.stringify(rows));
  localStorage.setItem('nassRowIds', JSON.stringify(rowIds));
}

// ── Force-password-change modal ─────────────────────────────────
function showChangePasswordModal(sb) {
  const modal = document.getElementById('nass-pwchange');
  if (modal) modal.style.display = 'flex';

  document.getElementById('nass-pwchange-form')
    .addEventListener('submit', async function (e) {
      e.preventDefault();
      const pw1   = document.getElementById('nass-pw1').value;
      const pw2   = document.getElementById('nass-pw2').value;
      const errEl = document.getElementById('nass-pwchange-err');
      const btn   = document.getElementById('nass-pwchange-btn');
      errEl.textContent = '';

      if (pw1.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        return;
      }
      if (pw1 !== pw2) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }

      btn.disabled    = true;
      btn.textContent = 'Saving…';

      const { error } = await sb.auth.updateUser({
        password: pw1,
        data: { must_change_password: false }
      });

      if (error) {
        errEl.textContent = friendlyAuthErr(error.message);
        btn.disabled    = false;
        btn.textContent = 'Set New Password';
      } else {
        window.location.reload();
      }
    });
}

// ── Auth error → friendly message ───────────────────────────────
function friendlyAuthErr(msg) {
  const s = (msg || '').toLowerCase();
  if (s.includes('failed to fetch') || s.includes('networkerror') || s.includes('name_not_resolved'))
    return 'Unable to connect. Check your internet connection and try again.';
  if (s.includes('invalid login') || s.includes('invalid credentials') || s.includes('email not confirmed'))
    return 'Incorrect email or password.';
  if (s.includes('too many') || s.includes('rate limit'))
    return 'Too many attempts — please wait a moment and try again.';
  if (s.includes('user not found') || s.includes('no user'))
    return 'No account found with that email address.';
  return msg || 'Sign-in failed. Please try again.';
}

// ── Auth helpers ────────────────────────────────────────────────
function bindLoginForm(sb) {
  document.getElementById('nass-login-form')
    .addEventListener('submit', async function (e) {
      e.preventDefault();
      const email    = document.getElementById('nass-email').value.trim();
      const password = document.getElementById('nass-password').value;
      const errEl    = document.getElementById('nass-login-err');
      const btn      = document.getElementById('nass-login-btn');
      errEl.textContent = '';
      btn.disabled    = true;
      btn.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        errEl.textContent = friendlyAuthErr(error.message);
        btn.disabled    = false;
        btn.textContent = 'Sign In';
      } else {
        window.location.reload();
      }
    });
}

async function nassLogout() {
  // End the persisted Google Drive refresh session before signing out of NASS.
  try { await _gDriveAuthCall('logout'); }
  catch (error) { console.warn('[Drive] Could not clear the stored Drive session:', error); }
  localStorage.removeItem('nass_gdrive_token');
  localStorage.removeItem('nass_gdrive_expiry');
  window._gTok = null;
  _gTokExpiresAt = 0;
  window._sb.auth.signOut().then(() => window.location.reload());
}

// ── DOM helpers ─────────────────────────────────────────────────
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.body.appendChild(s);
  });
}
