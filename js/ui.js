import { DEFAULT_SYNC } from './defaults.js';
import { el, icon, nextFrame } from './dom.js';
import {
  PALETTE,
  activeItems,
  agenda,
  boardColumns,
  categoryById,
  countExamples,
  dashboard,
  filtersActive,
  isDone,
  isOverdue,
  normText,
  overdueDays,
  peopleGroups,
  peopleOptions,
  sortByOrder,
  statusById,
  visibleFields,
  waitingDays,
} from './model.js';
import { addHkDays, dayNickname, formatHm, formatSyncTime, hkDateString, hmValue, shortDate, weekdayLabel } from './time.js';

let store;

export function init(next) {
  store = next;
}

export function decorateChrome() {
  const icons = { today: 'today', board: 'board', agenda: 'agenda', people: 'people' };
  for (const button of document.querySelectorAll('.nav-btn')) {
    if (!button.querySelector('.icon')) button.prepend(icon(icons[button.dataset.view]));
  }
  const search = document.getElementById('search-toggle');
  const settings = document.getElementById('settings-toggle');
  if (search && !search.querySelector('.icon')) search.append(icon('search'));
  if (settings && !settings.querySelector('.icon')) settings.append(icon('gear'));
}

export function updateSyncChip() {
  const chip = document.getElementById('sync-chip');
  const label = document.getElementById('sync-label');
  if (!chip || !label) return;
  const phase = store.sync.phase || 'idle';
  chip.dataset.phase = phase;
  const text = {
    syncing: '同步緊…',
    error: '同步失敗',
    offline: '離線',
    'need-pass': '未有密碼',
    ok: formatSyncTime(store.sync.lastSyncedAt),
    idle: store.sync.lastSyncedAt ? formatSyncTime(store.sync.lastSyncedAt) : '未同步',
  }[phase] || '未同步';
  label.textContent = text;
  chip.title = store.sync.error ? `${text}。${store.sync.error}` : text;
}

export function syncChrome() {
  const titles = { today: '今日', board: '看板', agenda: '行程', people: '人物', settings: '設定' };
  document.title = `${titles[store.view] || '行動'} · 行動`;
  for (const button of document.querySelectorAll('.nav-btn')) {
    if (button.dataset.view === store.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const settings = document.getElementById('settings-toggle');
  if (settings) {
    if (store.view === 'settings') settings.setAttribute('aria-current', 'page');
    else settings.removeAttribute('aria-current');
  }
  const search = document.getElementById('search-toggle');
  if (search) search.setAttribute('aria-pressed', store.searchOpen ? 'true' : 'false');
  const row = document.getElementById('search-row');
  if (row) row.hidden = !store.searchOpen;
  const quick = document.getElementById('quick-form');
  if (quick) quick.hidden = store.view === 'settings';
  const filtering = !!(store.filters.statusId || store.filters.categoryId || store.filters.person || store.filters.owner || store.filters.overdue);
  const filterBtn = document.getElementById('filter-btn');
  if (filterBtn) filterBtn.textContent = filtering ? '篩選中' : '篩選';
  updateSyncChip();
}

export function renderMain() {
  const view = document.getElementById('view');
  if (!view) return;
  const active = document.activeElement;
  const inView = active && view.contains(active);
  const snapshot = inView && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  view.replaceChildren(renderView());
  if (!snapshot) return;
  const next = document.getElementById(snapshot.id);
  if (!next) return;
  next.focus();
  if (typeof snapshot.start === 'number' && next.setSelectionRange) {
    try { next.setSelectionRange(snapshot.start, snapshot.end); } catch { /* date inputs */ }
  }
}

export function renderMainSoon() {
  nextFrame(() => renderMain());
}

export function renderSheet() {
  const root = document.getElementById('sheet-root');
  if (!root) return;
  root.replaceChildren();
  if (!store.sheet) return;
  const sheet = buildSheet(store.sheet);
  if (sheet) root.append(sheet);
}

export function renderDialog() {
  const root = document.getElementById('dialog-root');
  if (!root) return;
  root.replaceChildren();
  if (!store.dialog) return;
  const dialog = store.dialog;
  root.append(el('div', { class: 'dialog-backdrop', dataset: { action: 'close-dialog' } },
    el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', dataset: { action: 'noop' } },
      el('h2', {}, dialog.title),
      el('p', {}, dialog.body),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn', dataset: { action: 'close-dialog' } }, '取消'),
        el('button', { class: dialog.danger ? 'btn danger' : 'btn primary', dataset: { action: 'confirm-dialog' } }, dialog.confirm),
      ),
    )));
}

function renderView() {
  if (store.fatal) return el('p', { class: 'empty', 'data-screen': 'error' }, store.fatal);
  if (!store.doc) return el('p', { class: 'loading', 'data-screen': 'loading' }, '載入緊…');
  const now = new Date();
  const screen = {
    today: () => renderToday(now),
    board: () => renderBoard(now),
    agenda: () => renderAgenda(now),
    people: () => renderPeople(now),
    settings: () => renderSettings(now),
  }[store.view] || renderToday;
  return screen();
}

function filterNote() {
  if (!filtersActive(store.filters)) return null;
  return el('div', { class: 'filters-note' },
    el('span', {}, '篩選緊'),
    el('button', { class: 'btn tiny', dataset: { action: 'clear-filters' } }, '清除'),
  );
}

function renderToday(now) {
  const data = dashboard(store.doc, store.filters, now);
  const parts = hkDate(now);
  const examples = countExamples(store.doc);
  const nodes = [
    el('p', { class: 'hero-date' }, parts.date),
    el('p', { class: 'hero-sub' }, `${parts.week} · ${data.openCount} 項未完成`),
  ];
  if (examples) {
    nodes.push(el('div', { class: 'banner' },
      el('p', {}, `有 ${examples} 項標咗「例子」，可以即刻刪。`),
      el('button', { class: 'btn tiny', dataset: { action: 'delete-all-examples' } }, '刪除全部例子'),
    ));
  }
  nodes.push(filterNote());
  nodes.push(section('過咗期', data.overdue, (item) => card(item, { now })));
  nodes.push(section('今日到期', data.dueToday, (item) => card(item, { now })));
  nodes.push(section('要跟進', data.followUps, (item) => card(item, { now, follow: true })));
  nodes.push(el('div', { class: 'section-h' },
    el('h2', {}, '邊個拖緊'),
    el('span', { class: 'count' }, String(data.waiting.reduce((sum, group) => sum + group.items.length, 0))),
  ));
  if (!data.waiting.length) nodes.push(el('p', { class: 'empty' }, '而家冇人拖緊你。'));
  for (const group of data.waiting) {
    nodes.push(el('div', { class: 'person-h' },
      el('strong', {}, group.name),
      el('span', { class: 'muted' }, group.maxDays > 0 ? `最長拖咗 ${group.maxDays} 日` : '今日先開始等'),
    ));
    for (const row of group.items) nodes.push(card(row.item, { now, waitingDays: row.days, showWaiting: true }));
  }
  const any = data.overdue.length || data.dueToday.length || data.followUps.length || data.waiting.length;
  if (!any) {
    nodes.push(el('p', { class: 'empty' }, data.openCount
      ? '未有到期或者要跟進嘅項目。'
      : '未有行動。喺上面加一項，例如：追報價 @陳生 #客戶 聽日 3pm'));
    if (data.openCount) nodes.push(el('button', { class: 'btn', dataset: { action: 'set-view', view: 'board' } }, '去看板睇全部'));
  }
  return el('div', { 'data-screen': 'today' }, nodes);
}

function section(title, items, renderItem) {
  return [
    el('div', { class: 'section-h' }, el('h2', {}, title), el('span', { class: 'count' }, String(items.length))),
    items.length ? items.map(renderItem) : el('p', { class: 'empty' }, '冇'),
  ];
}

function renderBoard(now) {
  const columns = boardColumns(store.doc, store.filters, now);
  return el('div', { 'data-screen': 'board' },
    filterNote(),
    el('div', { class: 'board' }, columns.map((column) => el('section', {
      class: 'column',
      'data-drop-status': column.status.id,
      style: { '--c': column.status.color || '#8a8175' },
    },
    el('div', { class: 'column-h' },
      el('i', { class: 'cdot', style: { '--c': column.status.color || '#8a8175' } }),
      el('span', {}, column.status.name),
      el('span', { class: 'count' }, String(column.items.length)),
    ),
    column.items.map((item) => card(item, { now, showWaiting: true })),
    column.items.length ? null : el('p', { class: 'empty' }, '冇項目'),
    ))),
  );
}

function renderAgenda(now) {
  const data = agenda(store.doc, store.filters, now);
  const blocks = [filterNote()];
  if (data.overdue.length) {
    blocks.push(el('div', { class: 'section-h' }, el('h2', {}, '未完成（過咗期）'), el('span', { class: 'count' }, String(data.overdue.length))));
    for (const item of data.overdue) blocks.push(card(item, { now }));
  }
  for (const day of data.days) {
    blocks.push(el('section', { class: 'day' },
      el('div', { class: 'day-h' },
        el('strong', {}, `${shortDate(day.date, now)} ${dayNickname(day.date, data.today)}`),
        el('span', { class: 'muted' }, weekdayLabel(day.date)),
      ),
      day.entries.length ? day.entries.map((entry) => agendaEntry(entry, now)) : el('p', { class: 'slim' }, '冇安排'),
    ));
  }
  if (data.undated.length) {
    blocks.push(el('div', { class: 'section-h' }, el('h2', {}, '未有時間'), el('span', { class: 'count' }, String(data.undated.length))));
    for (const item of data.undated) blocks.push(card(item, { now }));
  }
  return el('div', { 'data-screen': 'agenda' }, blocks);
}

function agendaEntry(entry, now) {
  let when = '時間未定';
  if (entry.kind === 'follow') when = '跟進';
  else if (entry.timeSet && entry.at) when = formatHm(entry.at);
  return el('div', { class: 'entry' },
    el('span', { class: 'time' }, when),
    el('button', { class: 'entry-main', dataset: { action: 'open-item', id: entry.item.id } },
      el('div', { class: 'card-title' }, entry.item.title || '（未命名）'),
      metaLine(entry.item, now),
    ),
  );
}

function renderPeople(now) {
  const groups = peopleGroups(store.doc, store.filters, now, store.peopleMode);
  return el('div', { 'data-screen': 'people' },
    filterNote(),
    el('div', { class: 'segment', role: 'tablist' },
      el('button', { dataset: { action: 'people-mode', mode: 'contact' }, 'aria-selected': store.peopleMode === 'contact' ? 'true' : 'false' }, '要搵嘅人'),
      el('button', { dataset: { action: 'people-mode', mode: 'owner' }, 'aria-selected': store.peopleMode === 'owner' ? 'true' : 'false' }, '負責人'),
    ),
    groups.length ? groups.map((group) => el('section', {},
      el('div', { class: 'person-h' },
        el('strong', {}, group.name),
        el('span', { class: 'muted' }, group.waitingCount ? `${group.count} 項 · 拖緊 ${group.waitingCount}` : `${group.count} 項`),
      ),
      group.items.map((item) => card(item, { now, showWaiting: true })),
    )) : el('p', { class: 'empty' }, '未有人。'),
  );
}

function card(item, { now, waitingDays: days = null, showWaiting = false, follow = false } = {}) {
  const status = statusById(store.doc, item.statusId);
  return el('article', {
    class: 'card',
    draggable: canDrag(),
    'data-drag-id': item.id,
    'data-example': item.isExample ? '1' : '0',
    'data-done': isDone(store.doc, item) ? '1' : '0',
    style: { '--c': status?.color || '#8a8175' },
  },
  el('button', { class: 'card-main', dataset: { action: 'open-item', id: item.id } },
    el('div', { class: 'card-titleline' },
      item.isExample ? el('span', { class: 'ex-badge' }, '例子') : null,
      el('span', { class: 'card-title' }, item.title || '（未命名）'),
    ),
    metaLine(item, now, { days, showWaiting, follow }),
    showWaiting && status?.role === 'waiting' && item.waitingOn ? el('p', { class: 'wait-note' }, item.waitingOn) : null,
  ),
  el('div', { class: 'card-side' },
    el('button', { class: 'btn tiny', dataset: { action: 'move-item', id: item.id } }, '移動'),
    item.isExample ? el('button', { class: 'icon-btn', dataset: { action: 'delete-example', id: item.id }, 'aria-label': '刪除例子' }, icon('trash')) : null,
  ));
}

function metaLine(item, now, extra = {}) {
  const category = categoryById(store.doc, item.categoryId);
  const bits = [];
  if (category) bits.push(el('span', { class: 'pill' }, category.name));
  if (normText(item.contact)) bits.push(el('span', { class: 'pill' }, `@${normText(item.contact)}`));
  const due = dueChip(item, now);
  if (due) bits.push(due);
  if (extra.follow && item.nextFollowUp) {
    const late = item.nextFollowUp < hkDateString(now);
    bits.push(el('span', { class: late ? 'pill late' : 'pill' }, late ? '跟進遲咗' : '今日要跟'));
  }
  if (extra.days != null) bits.push(el('span', { class: 'pill' }, extra.days > 0 ? `拖咗 ${extra.days} 日` : '今日先開始等'));
  if (!bits.length) return null;
  return el('div', { class: 'meta' }, bits);
}

function dueChip(item, now) {
  if (!item.dueAt || isDone(store.doc, item)) return null;
  if (isOverdue(item, store.doc, now)) {
    const days = overdueDays(item, now);
    return el('span', { class: 'pill late' }, days > 0 ? `遲咗 ${days} 日` : '已過時');
  }
  const day = hkDateString(new Date(item.dueAt));
  const today = hkDateString(now);
  const when = day === today ? '今日' : day === addHkDays(today, 1) ? '聽日' : shortDate(day, now);
  const time = item.dueTimeSet ? formatHm(item.dueAt) : '';
  return el('span', { class: 'pill' }, time ? `${when} ${time}` : when);
}

function renderSettings(now) {
  const syncError = store.sync.error ? el('p', { class: 'lead', style: { color: 'var(--danger)' } }, store.sync.error) : null;
  return el('div', { 'data-screen': 'settings' },
    el('section', { class: 'set-card', id: 'sync-card' },
      el('h2', {}, '同步'),
      el('p', { class: 'lead' }, '預設私人倉庫可以改。Token 同密碼只留喺呢部機。GitHub 只會見到加密檔。空倉庫第一次同步會自動建立檔案。'),
      kv('用戶名', el('input', fieldProps('sync-owner', 'owner', store.secrets.owner, 'wcarthur2-commits'))),
      kv('倉庫', el('input', fieldProps('sync-repo', 'repo', store.secrets.repo, 'Action-data'))),
      kv('路徑', el('input', fieldProps('sync-path', 'path', store.secrets.path, DEFAULT_SYNC.path))),
      kv('Token', el('input', { ...fieldProps('sync-token', 'token', store.secrets.token, 'github_pat_…'), type: 'password', autocomplete: 'off' })),
      kv('密碼', el('input', { ...fieldProps('sync-pass', 'passphrase', store.secrets.passphrase, '同步密碼'), type: 'password', autocomplete: 'new-password' })),
      el('label', { class: 'checkline' },
        el('input', { type: 'checkbox', dataset: { scope: 'sync', bind: 'remember' }, checked: !!store.secrets.remember }),
        '喺呢部機記住密碼',
      ),
      el('p', { class: 'muted' }, store.sync.lastSyncedAt ? formatSyncTime(store.sync.lastSyncedAt, now) : '未同步過'),
      syncError,
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn primary', dataset: { action: 'sync' } }, '而家同步'),
        el('button', { class: 'btn', dataset: { action: 'clear-secrets' } }, '清除 token 同密碼'),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, '狀態'),
      el('p', { class: 'lead' }, '「等緊人」會計入「邊個拖緊」；「完成」唔會計過期。'),
      sortByOrder(store.doc.statuses).map((status, index, list) => recordRow('statuses', status, index, list.length, true)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-status', type: 'text', placeholder: '新狀態', 'aria-label': '新狀態' }),
        el('button', { class: 'btn', dataset: { action: 'add-status' } }, '加狀態'),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, '分類'),
      sortByOrder(store.doc.categories).map((category, index, list) => recordRow('categories', category, index, list.length, false)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-category', type: 'text', placeholder: '新分類', 'aria-label': '新分類' }),
        el('button', { class: 'btn', dataset: { action: 'add-category' } }, '加分類'),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, '欄位'),
      el('p', { class: 'lead' }, '隱藏之後，新增同編輯唔會見到呢欄；卡片仍然顯示已有內容。'),
      sortByOrder(store.doc.fields).filter((field) => field.hideable || !field.builtin).map((field, index, list) => fieldRow(field, index, list.length)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-field', type: 'text', placeholder: '自訂欄位名', 'aria-label': '自訂欄位名' }),
        el('select', { id: 'new-field-type', 'aria-label': '欄位類型' },
          el('option', { value: 'text' }, '文字'),
          el('option', { value: 'date' }, '日期'),
        ),
        el('button', { class: 'btn', dataset: { action: 'add-field' } }, '加欄位'),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, '備份'),
      el('p', { class: 'lead' }, '匯出係明文，請自己保管。日曆檔只會下載，唔會上傳。'),
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn', dataset: { action: 'export-json' } }, '匯出備份'),
        el('button', { class: 'btn', dataset: { action: 'pick-import', mode: 'merge' } }, '匯入並合併'),
        el('button', { class: 'btn danger', dataset: { action: 'pick-import', mode: 'replace' } }, '匯入並取代'),
        el('button', { class: 'btn', dataset: { action: 'export-ics' } }, '匯出日曆'),
      ),
    ),
    countExamples(store.doc) ? el('section', { class: 'set-card' },
      el('h2', {}, '例子'),
      el('button', { class: 'btn danger', dataset: { action: 'delete-all-examples' } }, '刪除全部例子'),
    ) : null,
    el('section', { class: 'set-card' },
      el('h2', {}, '點用'),
      el('p', { class: 'lead' }, '快速新增：@人、#分類、負責:名、今日／聽日／後日、下週一、11月20日、20/11、3pm、下午3點、跟進:聽日。'),
      el('p', { class: 'lead' }, '用 Safari 打開之後，分享 → 加入主畫面。iPad 同樣。Mac 可以用「加入程式塢」。'),
      el('p', { class: 'muted' }, '版本 1.0 · 同步只會聯絡 api.github.com'),
    ),
  );
}

function kv(label, control) {
  return el('label', { class: 'kv' }, el('span', {}, label), control);
}

function fieldProps(id, bind, value, placeholder) {
  return {
    id,
    type: 'text',
    value: value || '',
    placeholder,
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    autocomplete: 'off',
    dataset: { scope: 'sync', bind },
  };
}

function recordRow(kind, rec, index, total, withRole) {
  const open = store.colorOpen === `${kind}:${rec.id}`;
  return el('div', { class: 'status-row' },
    el('input', {
      class: 'grow',
      id: `name-${kind}-${rec.id}`,
      type: 'text',
      value: rec.name,
      'aria-label': `${rec.name} 名稱`,
      dataset: { scope: kind === 'statuses' ? 'status' : 'category', bind: 'name', id: rec.id, prev: rec.name },
    }),
    withRole ? el('select', {
      'aria-label': `${rec.name} 角色`,
      dataset: { scope: 'status', bind: 'role', id: rec.id },
      value: rec.role || 'open',
    },
    el('option', { value: 'open' }, '一般'),
    el('option', { value: 'waiting' }, '等緊人'),
    el('option', { value: 'done' }, '完成'),
    ) : null,
    el('button', {
      class: 'color-btn',
      style: { '--c': rec.color },
      'aria-label': `揀顏色 ${rec.name}`,
      dataset: { action: 'toggle-color', kind, id: rec.id },
    }),
    el('button', { class: 'icon-btn', 'aria-label': '上移', disabled: index === 0, dataset: { action: 'swap', kind, id: rec.id, dir: '-1' } }, icon('up')),
    el('button', { class: 'icon-btn', 'aria-label': '下移', disabled: index === total - 1, dataset: { action: 'swap', kind, id: rec.id, dir: '1' } }, icon('down')),
    el('button', { class: 'icon-btn', 'aria-label': `刪除 ${rec.name}`, dataset: { action: 'delete-record', kind, id: rec.id } }, icon('trash')),
    open ? el('div', { class: 'swatches' }, PALETTE.map((color) => el('button', {
      class: 'swatch',
      style: { background: color },
      'aria-label': color,
      'aria-pressed': rec.color === color ? 'true' : 'false',
      dataset: { action: 'set-color', kind, id: rec.id, color },
    }))) : null,
  );
}

function fieldRow(field, index, total) {
  return el('div', { class: 'field-row' },
    el('input', {
      class: 'grow',
      id: `field-${field.id}`,
      type: 'text',
      value: field.label,
      'aria-label': `${field.label} 欄位名`,
      dataset: { scope: 'field', bind: 'label', id: field.id },
    }),
    el('span', { class: 'pill' }, field.type === 'date' ? '日期' : field.type === 'textarea' ? '長文' : field.type === 'datetime' ? '時間' : '文字'),
    field.hideable ? el('button', {
      class: 'btn tiny',
      dataset: { action: 'toggle-visible', id: field.id },
    }, field.visible ? '顯示中' : '已隱藏') : null,
    el('button', { class: 'icon-btn', 'aria-label': '上移', disabled: index === 0, dataset: { action: 'swap', kind: 'fields', id: field.id, dir: '-1' } }, icon('up')),
    el('button', { class: 'icon-btn', 'aria-label': '下移', disabled: index === total - 1, dataset: { action: 'swap', kind: 'fields', id: field.id, dir: '1' } }, icon('down')),
    field.builtin ? null : el('button', { class: 'icon-btn', 'aria-label': `刪除 ${field.label}`, dataset: { action: 'delete-record', kind: 'fields', id: field.id } }, icon('trash')),
  );
}

function buildSheet(sheet) {
  if (sheet.type === 'filter') return filterSheet();
  if (sheet.type === 'pass') return passSheet();
  if (sheet.type === 'move') return moveSheet(sheet.id);
  if (sheet.type === 'item') return itemSheet(sheet.id);
  return null;
}

function shell(title, ...body) {
  return el('div', { class: 'sheet-backdrop', dataset: { action: 'close-sheet' } },
    el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', dataset: { action: 'noop' } },
      el('div', { class: 'handle', 'aria-hidden': 'true' }),
      el('div', { class: 'sheet-h' },
        el('h2', {}, title),
        el('button', { class: 'btn', dataset: { action: 'close-sheet' } }, '完成'),
      ),
      ...body,
    ));
}

function filterSheet() {
  const options = peopleOptions(store.doc);
  const statuses = sortByOrder(store.doc.statuses);
  const categories = sortByOrder(store.doc.categories);
  return shell('篩選',
    labeled('狀態', el('select', { dataset: { scope: 'filter', bind: 'statusId' }, value: store.filters.statusId },
      el('option', { value: '' }, '全部'),
      statuses.map((status) => el('option', { value: status.id }, status.name)),
    )),
    labeled('分類', el('select', { dataset: { scope: 'filter', bind: 'categoryId' }, value: store.filters.categoryId },
      el('option', { value: '' }, '全部'),
      categories.map((category) => el('option', { value: category.id }, category.name)),
    )),
    labeled('要搵嘅人', el('select', { dataset: { scope: 'filter', bind: 'person' }, value: store.filters.person },
      el('option', { value: '' }, '全部'),
      options.contacts.map((name) => el('option', { value: name }, name)),
    )),
    labeled('負責人', el('select', { dataset: { scope: 'filter', bind: 'owner' }, value: store.filters.owner },
      el('option', { value: '' }, '全部'),
      options.owners.map((name) => el('option', { value: name }, name)),
    )),
    el('label', { class: 'checkline' },
      el('input', { type: 'checkbox', dataset: { scope: 'filter', bind: 'overdue' }, checked: !!store.filters.overdue }),
      '只顯示過期',
    ),
    el('button', { class: 'btn wide', dataset: { action: 'clear-filters' } }, '清除篩選'),
  );
}

function passSheet() {
  return shell('輸入同步密碼',
    el('p', { class: 'lead' }, '三部機用同一個密碼。GitHub 收唔到呢個密碼。'),
    labeled('同步密碼', el('input', {
      id: 'pass-input',
      type: 'password',
      value: '',
      autocomplete: 'current-password',
      autocapitalize: 'off',
      dataset: { scope: 'pass', bind: 'passphrase' },
    })),
    el('label', { class: 'checkline' },
      el('input', { type: 'checkbox', dataset: { scope: 'sync', bind: 'remember' }, checked: !!store.secrets.remember }),
      '喺呢部機記住密碼',
    ),
    el('button', { class: 'btn primary wide', dataset: { action: 'submit-pass' } }, '開始同步'),
  );
}

function moveSheet(id) {
  const item = activeItems(store.doc).find((row) => row.id === id);
  if (!item) return null;
  return shell('移去邊個狀態',
    el('p', { class: 'lead' }, item.title),
    sortByOrder(store.doc.statuses).map((status) => el('button', {
      class: status.id === item.statusId ? 'btn primary wide' : 'btn wide',
      style: { 'margin-bottom': '8px' },
      dataset: { action: 'pick-status', id: item.id, status: status.id },
    }, status.name)),
  );
}

function itemSheet(id) {
  const item = activeItems(store.doc).find((row) => row.id === id);
  if (!item) return null;
  const filled = moreFilled(item);
  return shell(item.isExample ? '例子' : '編輯行動',
    peopleList(),
    el('p', { class: 'muted' }, '改動會自動儲存喺呢部機'),
    labeled('標題', el('input', {
      id: 'item-title',
      type: 'text',
      value: item.title,
      dataset: { scope: 'item', bind: 'title', id: item.id },
    })),
    labeled('狀態', el('select', { dataset: { scope: 'item', bind: 'statusId', id: item.id }, value: item.statusId },
      sortByOrder(store.doc.statuses).map((status) => el('option', { value: status.id }, status.name)),
    )),
    labeled('分類', el('select', { dataset: { scope: 'item', bind: 'categoryId', id: item.id }, value: item.categoryId || '' },
      el('option', { value: '' }, '未分類'),
      sortByOrder(store.doc.categories).map((category) => el('option', { value: category.id }, category.name)),
    )),
    el('details', { class: 'more' },
      el('summary', { class: 'sum' }, filled ? `更多資料 · 已填 ${filled} 項` : '更多資料'),
      visibleFields(store.doc).filter((field) => field.section === 'more' && field.visible).map((field) => renderField(item, field)),
    ),
    el('button', { class: 'btn danger', dataset: { action: 'ask-delete-item', id: item.id } }, '刪除呢項'),
  );
}

function renderField(item, field) {
  if (!field.builtin) {
    const value = item.custom?.[field.id] || '';
    const control = field.type === 'date'
      ? el('input', { type: 'date', value, dataset: { scope: 'custom', bind: 'value', id: item.id, field: field.id } })
      : el('input', { type: 'text', value, dataset: { scope: 'custom', bind: 'value', id: item.id, field: field.id } });
    return labeled(field.label, control);
  }
  if (field.key === 'contact' || field.key === 'owner' || field.key === 'waitingOn') {
    return labeled(field.label, el('input', {
      type: 'text',
      value: item[field.key] || '',
      list: field.key === 'waitingOn' ? null : 'people-list',
      dataset: { scope: 'item', bind: field.key, id: item.id },
    }));
  }
  if (field.key === 'issue' || field.key === 'solution' || field.key === 'notes') {
    return labeled(field.label, el('textarea', {
      dataset: { scope: 'item', bind: field.key, id: item.id },
    }, item[field.key] || ''));
  }
  if (field.key === 'dueAt' || field.key === 'startAt') {
    const isDue = field.key === 'dueAt';
    const iso = item[field.key];
    const timeSet = isDue ? item.dueTimeSet : item.startTimeSet;
    return el('div', { class: 'field' },
      el('label', {}, field.label),
      el('div', { class: 'split' },
        el('input', {
          type: 'date',
          'aria-label': `${field.label} 日期`,
          value: iso ? hkDateString(new Date(iso)) : '',
          dataset: { scope: 'item', bind: isDue ? 'dueDate' : 'startDate', id: item.id },
        }),
        el('input', {
          type: 'time',
          'aria-label': `${field.label} 時間`,
          value: iso && timeSet ? hmValue(iso) : '',
          dataset: { scope: 'item', bind: isDue ? 'dueTime' : 'startTime', id: item.id },
        }),
      ),
      el('button', { class: 'btn tiny', dataset: { action: isDue ? 'clear-due' : 'clear-start', id: item.id } }, '清除'),
    );
  }
  if (field.key === 'nextFollowUp') {
    return labeled(field.label, el('input', {
      type: 'date',
      value: item.nextFollowUp || '',
      dataset: { scope: 'item', bind: 'nextFollowUp', id: item.id },
    }));
  }
  return null;
}

function moreFilled(item) {
  return visibleFields(store.doc).filter((field) => field.section === 'more' && field.visible && fieldHas(item, field)).length;
}

function fieldHas(item, field) {
  if (!field.builtin) return !!normText(item.custom?.[field.id]);
  if (field.key === 'startAt' || field.key === 'dueAt' || field.key === 'nextFollowUp') return !!item[field.key];
  return !!normText(item[field.key]);
}

function labeled(text, control) {
  return el('div', { class: 'field' }, el('label', {}, text), control);
}

function peopleList() {
  return el('datalist', { id: 'people-list' }, peopleOptions(store.doc).both.map((name) => el('option', { value: name })));
}

function hkDate(now) {
  const iso = hkDateString(now);
  return { date: shortDate(iso, now), week: weekdayLabel(iso) };
}

function canDrag() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export { waitingDays };
