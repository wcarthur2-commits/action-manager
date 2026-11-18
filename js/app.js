import { DEFAULT_SYNC } from './defaults.js';
import * as db from './db.js';
import { toast } from './dom.js';
import { ERROR_TEXT } from './errors.js';
import { toIcs } from './ics.js';
import {
  PALETTE,
  activeItems,
  blankItem,
  freshDoc,
  markDeleted,
  mergeDocs,
  nextOrder,
  noteUserEdit,
  parseBackup,
  restoreDoc,
  setStatus,
  sortByOrder,
  statusById,
  swapOrder,
  toBackup,
  tombstoneExamples,
  uid,
} from './model.js';
import { parseQuick } from './parse.js';
import { createSyncController } from './sync.js';
import { hkWallToISO } from './time.js';
import * as ui from './ui.js';

const store = {
  doc: null,
  view: 'today',
  filters: { query: '', statusId: '', categoryId: '', person: '', owner: '', overdue: false },
  peopleMode: 'contact',
  sheet: null,
  dialog: null,
  searchOpen: false,
  colorOpen: '',
  fatal: '',
  sync: { phase: 'idle', error: '', lastSyncedAt: null },
  secrets: {
    owner: DEFAULT_SYNC.owner,
    repo: DEFAULT_SYNC.repo,
    path: DEFAULT_SYNC.path,
    token: '',
    passphrase: '',
    remember: false,
    salt: '',
  },
};

ui.init(store);
const sync = createSyncController({
  store,
  db,
  toast,
  refresh(flags = {}) {
    if (flags.passphrase) {
      store.sheet = { type: 'pass' };
      ui.renderSheet();
    }
    if (flags.chip) ui.updateSyncChip();
    if (flags.main && !typingInView()) {
      ui.renderMain();
      if (!store.sheet) ui.renderSheet();
    }
  },
});

function typingInView() {
  const active = document.activeElement;
  if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return false;
  return !!active.closest('#view, .sheet');
}

function viewFromHash() {
  const name = location.hash.replace(/^#\/?/, '');
  return ['today', 'board', 'agenda', 'people', 'settings'].includes(name) ? name : 'today';
}

function showView(view) {
  store.view = view;
  ui.syncChrome();
  ui.renderMain();
}

function setView(view) {
  const next = `#/${view}`;
  if (location.hash !== next) location.hash = next;
  else showView(view);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function findItem(id) {
  return store.doc?.items?.find((item) => item.id === id && !item.deletedAt) || null;
}

async function saveRecord(kind, rec) {
  await db.putRecord(kind, rec);
  sync.schedule();
}

async function quickAdd(text) {
  const raw = String(text || '').trim();
  if (!raw) return;
  const parsed = parseQuick(raw, new Date());
  let categoryId = null;
  if (parsed.categoryName) {
    let category = sortByOrder(store.doc.categories).find((row) => row.name === parsed.categoryName);
    if (!category) {
      category = {
        id: uid(),
        name: parsed.categoryName,
        color: PALETTE[store.doc.categories.length % PALETTE.length],
        order: nextOrder(store.doc.categories),
        updatedAt: Date.now(),
        deletedAt: null,
      };
      store.doc.categories.push(category);
      await db.putRecord('categories', category);
    }
    categoryId = category.id;
  }
  const statusId = sortByOrder(store.doc.statuses)[0]?.id || 'st-todo';
  const item = blankItem({
    title: parsed.title,
    contact: parsed.contact,
    owner: parsed.owner,
    categoryId,
    statusId,
    dueAt: parsed.dueAt,
    dueTimeSet: parsed.dueTimeSet,
    nextFollowUp: parsed.nextFollowUp,
    waitingSince: statusById(store.doc, statusId)?.role === 'waiting' ? new Date().toISOString() : null,
  });
  store.doc.items.push(item);
  await db.putRecord('items', item);
  sync.schedule();
  const input = document.getElementById('quick-input');
  if (input) input.value = '';
  toast('已加入');
  ui.renderMain();
}

async function moveItem(id, statusId) {
  const item = findItem(id);
  if (!item || !statusId || item.statusId === statusId) {
    store.sheet = null;
    ui.renderSheet();
    return;
  }
  setStatus(store.doc, item, statusId);
  noteUserEdit(item);
  await db.putRecord('items', item);
  sync.schedule();
  store.sheet = null;
  ui.renderSheet();
  ui.renderMain();
}

async function deleteExample(id) {
  const item = findItem(id);
  if (!item?.isExample) return;
  markDeleted(item);
  await db.putRecord('items', item);
  sync.schedule();
  toast('已刪除例子');
  ui.renderMain();
}

async function deleteAllExamples() {
  const now = Date.now();
  const count = tombstoneExamples(store.doc, now);
  for (const item of store.doc.items) {
    if (item.deletedAt === now) await db.putRecord('items', item);
  }
  sync.schedule();
  toast(count ? `已刪除 ${count} 個例子` : '冇例子');
  ui.renderMain();
}

async function deleteItem(id) {
  const item = findItem(id);
  if (!item) return;
  markDeleted(item);
  await db.putRecord('items', item);
  store.sheet = null;
  sync.schedule();
  ui.renderSheet();
  ui.renderMain();
  toast('已刪除');
}

async function deleteStatus(id) {
  const live = sortByOrder(store.doc.statuses);
  if (live.length <= 1) {
    toast('至少留一個狀態');
    return;
  }
  const fallback = live.find((status) => status.id !== id);
  for (const item of activeItems(store.doc).filter((row) => row.statusId === id)) {
    setStatus(store.doc, item, fallback.id);
    noteUserEdit(item);
    await db.putRecord('items', item);
  }
  const status = store.doc.statuses.find((row) => row.id === id);
  markDeleted(status);
  await db.putRecord('statuses', status);
  sync.schedule();
  ui.renderMain();
}

async function deleteCategory(id) {
  for (const item of store.doc.items) {
    if (item.categoryId === id && !item.deletedAt) {
      item.categoryId = null;
      noteUserEdit(item);
      await db.putRecord('items', item);
    }
  }
  const category = store.doc.categories.find((row) => row.id === id);
  markDeleted(category);
  await db.putRecord('categories', category);
  sync.schedule();
  ui.renderMain();
}

async function deleteField(id) {
  const field = store.doc.fields.find((row) => row.id === id);
  if (!field || field.builtin) return;
  markDeleted(field);
  await db.putRecord('fields', field);
  sync.schedule();
  ui.renderMain();
}

function readPair(bind, value, dateBind, timeBind) {
  const date = bind === dateBind ? value : document.querySelector(`[data-bind="${dateBind}"]`)?.value || '';
  const time = bind === timeBind ? value : document.querySelector(`[data-bind="${timeBind}"]`)?.value || '';
  return { date, time };
}

async function edit(ds, value, phase, event) {
  if (event?.isComposing) return;
  if (ds.scope === 'sync' || ds.scope === 'pass') {
    if (ds.bind === 'remember') store.secrets.remember = !!value;
    else if (ds.scope === 'pass') store.secrets.passphrase = value;
    else store.secrets[ds.bind] = value;
    await sync.saveSecrets();
    return;
  }
  if (ds.scope === 'filter') {
    if (ds.bind === 'overdue') store.filters.overdue = !!value;
    else store.filters[ds.bind] = value;
    ui.syncChrome();
    ui.renderMain();
    return;
  }
  if (ds.scope === 'status' || ds.scope === 'category' || ds.scope === 'field') {
    const kind = ds.scope === 'status' ? 'statuses' : ds.scope === 'category' ? 'categories' : 'fields';
    const rec = store.doc[kind].find((row) => row.id === ds.id);
    if (!rec) return;
    if (ds.bind === 'name' || ds.bind === 'label') {
      const trimmed = String(value).trim();
      if (!trimmed) {
        if (phase === 'blur' && event?.target) event.target.value = rec.name || rec.label;
        return;
      }
      if (ds.bind === 'name') rec.name = trimmed;
      else rec.label = trimmed;
    } else if (ds.bind === 'role') rec.role = value;
    rec.updatedAt = Date.now();
    await saveRecord(kind, rec);
    if (ds.bind === 'role') ui.renderMain();
    return;
  }
  const item = findItem(ds.id);
  if (!item) return;
  if (ds.scope === 'custom') {
    if (!item.custom) item.custom = {};
    item.custom[ds.field] = value;
  } else if (ds.bind === 'title') {
    item.title = phase === 'blur' ? (String(value).trim() || '（未命名）') : value;
    if (phase === 'blur' && event?.target) event.target.value = item.title;
  } else if (['contact', 'owner', 'waitingOn', 'issue', 'solution', 'notes'].includes(ds.bind)) {
    item[ds.bind] = value;
  } else if (ds.bind === 'statusId') setStatus(store.doc, item, value);
  else if (ds.bind === 'categoryId') item.categoryId = value || null;
  else if (ds.bind === 'nextFollowUp') item.nextFollowUp = value || null;
  else if (ds.bind === 'dueDate' || ds.bind === 'dueTime') {
    const { date, time } = readPair(ds.bind, value, 'dueDate', 'dueTime');
    item.dueAt = date ? hkWallToISO(date, time || '00:00') : null;
    item.dueTimeSet = !!(date && time);
  } else if (ds.bind === 'startDate' || ds.bind === 'startTime') {
    const { date, time } = readPair(ds.bind, value, 'startDate', 'startTime');
    item.startAt = date ? hkWallToISO(date, time || '00:00') : null;
    item.startTimeSet = !!(date && time);
  }
  noteUserEdit(item);
  await saveRecord('items', item);
}

async function onAction(action, ds) {
  if (action === 'noop') return;
  if (action === 'set-view') setView(ds.view);
  else if (action === 'toggle-search') {
    store.searchOpen = !store.searchOpen;
    ui.syncChrome();
    if (store.searchOpen) document.getElementById('search-input')?.focus();
  } else if (action === 'sync') await sync.run({ manual: true });
  else if (action === 'open-filters') {
    store.sheet = { type: 'filter' };
    ui.renderSheet();
  } else if (action === 'clear-filters') {
    store.filters = { query: '', statusId: '', categoryId: '', person: '', owner: '', overdue: false };
    const search = document.getElementById('search-input');
    if (search) search.value = '';
    ui.syncChrome();
    ui.renderMain();
  } else if (action === 'open-item') {
    store.sheet = { type: 'item', id: ds.id };
    ui.renderSheet();
  } else if (action === 'move-item') {
    store.sheet = { type: 'move', id: ds.id };
    ui.renderSheet();
  } else if (action === 'pick-status') await moveItem(ds.id, ds.status);
  else if (action === 'delete-example') await deleteExample(ds.id);
  else if (action === 'delete-all-examples') await deleteAllExamples();
  else if (action === 'close-sheet') {
    store.sheet = null;
    ui.renderSheet();
    ui.renderMain();
  } else if (action === 'close-dialog') {
    store.dialog = null;
    ui.renderDialog();
  } else if (action === 'confirm-dialog') {
    const pending = store.dialog;
    store.dialog = null;
    ui.renderDialog();
    if (pending?.action === 'confirm-replace') {
      const input = document.getElementById('import-file');
      input.dataset.mode = 'replace';
      input.click();
    } else if (pending?.action === 'confirm-delete-item') await deleteItem(pending.id);
    else if (pending?.action === 'confirm-delete-status') await deleteStatus(pending.id);
  } else if (action === 'ask-delete-item') {
    const item = findItem(ds.id);
    store.dialog = {
      title: '刪除呢項？',
      body: item ? `「${item.title}」刪除之後，同步會帶到其他裝置。` : '刪除之後，同步會帶到其他裝置。',
      confirm: '刪除',
      danger: true,
      action: 'confirm-delete-item',
      id: ds.id,
    };
    ui.renderDialog();
  } else if (action === 'people-mode') {
    store.peopleMode = ds.mode === 'owner' ? 'owner' : 'contact';
    ui.renderMain();
  } else if (action === 'toggle-color') {
    const key = `${ds.kind}:${ds.id}`;
    store.colorOpen = store.colorOpen === key ? '' : key;
    ui.renderMain();
  } else if (action === 'set-color') {
    const rec = store.doc[ds.kind]?.find((row) => row.id === ds.id);
    if (!rec) return;
    rec.color = ds.color;
    rec.updatedAt = Date.now();
    store.colorOpen = '';
    await saveRecord(ds.kind, rec);
    ui.renderMain();
  } else if (action === 'swap') {
    const changed = swapOrder(store.doc[ds.kind], ds.id, Number(ds.dir));
    for (const rec of changed) await db.putRecord(ds.kind, rec);
    if (changed.length) {
      sync.schedule();
      ui.renderMain();
    }
  } else if (action === 'add-status' || action === 'add-category') {
    const kind = action === 'add-status' ? 'statuses' : 'categories';
    const input = document.getElementById(kind === 'statuses' ? 'new-status' : 'new-category');
    const name = input?.value.trim();
    if (!name) return;
    const rec = {
      id: uid(),
      name,
      color: PALETTE[store.doc[kind].length % PALETTE.length],
      order: nextOrder(store.doc[kind]),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    if (kind === 'statuses') rec.role = 'open';
    store.doc[kind].push(rec);
    await saveRecord(kind, rec);
    input.value = '';
    ui.renderMain();
  } else if (action === 'add-field') {
    const label = document.getElementById('new-field')?.value.trim();
    const type = document.getElementById('new-field-type')?.value === 'date' ? 'date' : 'text';
    if (!label) return;
    const field = {
      id: uid(),
      key: 'custom',
      label,
      type,
      builtin: false,
      hideable: true,
      visible: true,
      section: 'more',
      order: nextOrder(store.doc.fields),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    store.doc.fields.push(field);
    await saveRecord('fields', field);
    document.getElementById('new-field').value = '';
    ui.renderMain();
  } else if (action === 'delete-record') {
    if (ds.kind === 'statuses') {
      if (sortByOrder(store.doc.statuses).length <= 1) {
        toast('至少留一個狀態');
        return;
      }
      const using = activeItems(store.doc).filter((item) => item.statusId === ds.id).length;
      if (using) {
        store.dialog = {
          title: '刪除狀態？',
          body: `有 ${using} 項用緊呢個狀態。刪除之後會移去另一個狀態。`,
          confirm: '刪除',
          danger: true,
          action: 'confirm-delete-status',
          id: ds.id,
        };
        ui.renderDialog();
        return;
      }
      await deleteStatus(ds.id);
    } else if (ds.kind === 'categories') await deleteCategory(ds.id);
    else if (ds.kind === 'fields') await deleteField(ds.id);
  } else if (action === 'toggle-visible') {
    const field = store.doc.fields.find((row) => row.id === ds.id);
    if (!field?.hideable) return;
    field.visible = !field.visible;
    field.updatedAt = Date.now();
    await saveRecord('fields', field);
    ui.renderMain();
  } else if (action === 'clear-due' || action === 'clear-start') {
    const item = findItem(ds.id);
    if (!item) return;
    if (action === 'clear-due') {
      item.dueAt = null;
      item.dueTimeSet = false;
    } else {
      item.startAt = null;
      item.startTimeSet = false;
    }
    noteUserEdit(item);
    await saveRecord('items', item);
    ui.renderSheet();
  } else if (action === 'export-json') {
    download('action-manager-backup.json', JSON.stringify(toBackup(store.doc), null, 2), 'application/json');
  } else if (action === 'export-ics') {
    download('action-manager.ics', toIcs(store.doc), 'text/calendar');
  } else if (action === 'pick-import') {
    if (ds.mode === 'replace') {
      store.dialog = {
        title: '取代本機資料？',
        body: '備份入面冇嘅項目會當成刪除，下次同步會帶到其他裝置。',
        confirm: '揀檔案並取代',
        danger: true,
        action: 'confirm-replace',
      };
      ui.renderDialog();
      return;
    }
    const input = document.getElementById('import-file');
    input.dataset.mode = 'merge';
    input.click();
  } else if (action === 'clear-secrets') {
    store.secrets.token = '';
    store.secrets.passphrase = '';
    store.secrets.remember = false;
    store.sync.error = '';
    await sync.saveSecrets();
    toast('已清除呢部機嘅 token 同密碼');
    ui.updateSyncChip();
    ui.renderMain();
  } else if (action === 'submit-pass') {
    const input = document.getElementById('pass-input');
    if (input) store.secrets.passphrase = input.value;
    if (!store.secrets.passphrase) {
      toast(ERROR_TEXT.MISSING_PASSPHRASE);
      return;
    }
    await sync.saveSecrets();
    store.sheet = null;
    ui.renderSheet();
    await sync.run({ manual: true });
  }
}

function bind() {
  document.body.addEventListener('click', (event) => {
    const node = event.target.closest?.('[data-action]');
    if (!node) return;
    onAction(node.dataset.action, node.dataset);
  });
  const onEditEvent = (phase) => (event) => {
    const target = event.target;
    if (!target?.dataset?.bind || event.isComposing) return;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    edit(target.dataset, value, phase, event);
  };
  document.body.addEventListener('input', onEditEvent('input'));
  document.body.addEventListener('change', onEditEvent('change'));
  document.body.addEventListener('focusout', onEditEvent('blur'));
  document.getElementById('quick-form').addEventListener('submit', (event) => {
    event.preventDefault();
    quickAdd(document.getElementById('quick-input').value);
  });
  document.getElementById('search-input').addEventListener('input', (event) => {
    store.filters.query = event.target.value;
    ui.renderMainSoon();
  });
  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const mode = event.target.dataset.mode || 'merge';
    event.target.value = '';
    if (!file) return;
    try {
      const incoming = parseBackup(await file.text());
      const next = mode === 'replace' ? restoreDoc(store.doc, incoming) : mergeDocs(store.doc, incoming);
      await db.replaceAll(next);
      store.doc = await db.loadDoc();
      sync.schedule();
      toast(mode === 'replace' ? '已取代本機資料' : '已合併備份');
      ui.renderMain();
    } catch (err) {
      toast(ERROR_TEXT[err.code] || ERROR_TEXT.BAD_BACKUP);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (store.dialog) {
        store.dialog = null;
        ui.renderDialog();
        return;
      }
      if (store.sheet) {
        store.sheet = null;
        ui.renderSheet();
        ui.renderMain();
      }
      return;
    }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) return;
    if (event.key === '/') {
      event.preventDefault();
      store.searchOpen = true;
      ui.syncChrome();
      document.getElementById('search-input')?.focus();
    } else if (event.key === 'n') {
      event.preventDefault();
      document.getElementById('quick-input')?.focus();
    }
  });
  let dragging = '';
  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('[data-drag-id]');
    if (!card) return;
    dragging = card.dataset.dragId;
    event.dataTransfer.setData('text/plain', dragging);
    event.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragover', (event) => {
    const column = event.target.closest?.('[data-drop-status]');
    if (!column?.dataset.dropStatus) return;
    event.preventDefault();
    column.classList.add('drop');
  });
  document.addEventListener('dragleave', (event) => {
    event.target.closest?.('[data-drop-status]')?.classList.remove('drop');
  });
  document.addEventListener('drop', (event) => {
    const column = event.target.closest?.('[data-drop-status]');
    if (!column?.dataset.dropStatus) return;
    event.preventDefault();
    column.classList.remove('drop');
    const id = event.dataTransfer.getData('text/plain') || dragging;
    if (id) moveItem(id, column.dataset.dropStatus);
  });
  window.addEventListener('hashchange', () => showView(viewFromHash()));
}

async function ensureSeed() {
  if (await db.getMeta('init')) return;
  const doc = await db.loadDoc();
  if (!doc.items.length && !doc.statuses.length) await db.replaceAll(freshDoc(new Date()));
  await db.setMeta('init', { at: Date.now(), v: 1 });
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  } catch {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* private mode or insecure origin */ }
  }
}

async function boot() {
  bind();
  ui.decorateChrome();
  showView(viewFromHash());
  if (!db.supported()) {
    store.fatal = '開唔到本機資料庫。請用 Safari 正常模式，唔好用私人瀏覽。';
    ui.renderMain();
    return;
  }
  try {
    await db.open();
    await ensureSeed();
    store.doc = await db.loadDoc();
    const saved = await db.getMeta('sync');
    if (saved) {
      store.secrets.owner = saved.owner ?? '';
      store.secrets.repo = saved.repo ?? '';
      store.secrets.path = saved.path || DEFAULT_SYNC.path;
      store.secrets.token = saved.token || '';
      store.secrets.remember = !!saved.remember;
      store.secrets.passphrase = saved.remember ? (saved.passphrase || '') : '';
      store.secrets.salt = saved.salt || '';
      store.sync.lastSyncedAt = saved.lastSyncedAt || null;
      store.sync.error = saved.lastError || '';
      if (saved.lastError) store.sync.phase = 'error';
    }
    ui.syncChrome();
    ui.renderMain();
    await registerSW();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync.run({ manual: false });
    });
    window.addEventListener('online', () => sync.run({ manual: false }));
    window.addEventListener('offline', () => {
      store.sync.phase = 'offline';
      ui.updateSyncChip();
    });
    if (store.secrets.token && store.secrets.passphrase) sync.run({ manual: false });
    else if (store.secrets.token) {
      store.sync.phase = 'need-pass';
      ui.updateSyncChip();
    }
    setInterval(() => ui.updateSyncChip(), 30000);
  } catch (err) {
    console.error(err);
    store.fatal = '載入資料失敗。請重新打開再試。';
    ui.renderMain();
  }
}

boot();
