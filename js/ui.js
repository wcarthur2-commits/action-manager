import { DEFAULT_SYNC } from './defaults.js?v=v4';
import { el, icon, nextFrame } from './dom.js?v=v4';
import { getLang, recordLabel, t } from './i18n.js?v=v4';
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
} from './model.js?v=v4';
import { addHkDays, dayNickname, formatHm, formatSyncTime, hkDateString, hmValue, shortDate, weekdayLabel } from './time.js?v=v4';

function L() {
  return getLang();
}

function statusText(status) {
  if (!status) return '';
  if (!status.id && status.builtinKey === 'none') return t('status.none');
  return recordLabel(status, 'status');
}

function categoryText(category) {
  return category ? recordLabel(category, 'category') : '';
}

function fieldText(field) {
  return field ? recordLabel(field, 'field') : '';
}

function countText(n, oneKey, manyKey) {
  return n === 1 && L() === 'en' ? t(oneKey) : t(manyKey, { n });
}

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
    syncing: t('sync.syncing'),
    error: t('sync.error'),
    offline: t('sync.offline'),
    'need-pass': t('sync.needPass'),
    ok: formatSyncTime(store.sync.lastSyncedAt, new Date(), L()),
    idle: store.sync.lastSyncedAt ? formatSyncTime(store.sync.lastSyncedAt, new Date(), L()) : t('sync.idle'),
  }[phase] || t('sync.idle');
  label.textContent = text;
  chip.title = store.sync.error ? `${text} — ${store.sync.error}` : text;
}

export function syncChrome() {
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of document.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  const titles = { today: t('nav.today'), board: t('nav.board'), agenda: t('nav.agenda'), people: t('nav.people'), settings: t('nav.settings') };
  document.title = `${titles[store.view] || t('appTitle')} · ${t('appTitle')}`;
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
  if (filterBtn) filterBtn.textContent = filtering ? t('filtering') : t('filter');
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
        el('button', { class: 'btn', dataset: { action: 'close-dialog' } }, t('cancel')),
        el('button', { class: dialog.danger ? 'btn danger' : 'btn primary', dataset: { action: 'confirm-dialog' } }, dialog.confirm),
      ),
    )));
}

function renderView() {
  if (store.fatal) return el('p', { class: 'empty', 'data-screen': 'error' }, store.fatal);
  if (!store.doc) return el('p', { class: 'loading', 'data-screen': 'loading' }, t('loading'));
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
    el('span', {}, t('filter.on')),
    el('button', { class: 'btn tiny', dataset: { action: 'clear-filters' } }, t('clear')),
  );
}

function renderToday(now) {
  const data = dashboard(store.doc, store.filters, now);
  const parts = hkDate(now);
  const examples = countExamples(store.doc);
  const nodes = [
    el('p', { class: 'hero-date' }, parts.date),
    el('p', { class: 'hero-sub' }, `${parts.week} · ${t('openCount', { n: data.openCount })}`),
  ];
  if (examples) {
    nodes.push(el('div', { class: 'banner' },
      el('p', {}, t('exampleBanner', { n: examples })),
      el('button', { class: 'btn tiny', dataset: { action: 'delete-all-examples' } }, t('deleteAllExamples')),
    ));
  }
  nodes.push(filterNote());
  nodes.push(section(t('section.overdue'), data.overdue, (item) => card(item, { now })));
  nodes.push(section(t('section.dueToday'), data.dueToday, (item) => card(item, { now })));
  nodes.push(section(t('section.follow'), data.followUps, (item) => card(item, { now, follow: true })));
  nodes.push(el('div', { class: 'section-h' },
    el('h2', {}, t('section.waiting')),
    el('span', { class: 'count' }, String(data.waiting.reduce((sum, group) => sum + group.items.length, 0))),
  ));
  if (!data.waiting.length) nodes.push(el('p', { class: 'empty' }, t('empty.nobodyWaiting')));
  for (const group of data.waiting) {
    nodes.push(el('div', { class: 'person-h' },
      el('strong', {}, group.name || t('waiting.unknown')),
      el('span', { class: 'muted' }, group.maxDays > 0 ? t('waiting.max', { n: group.maxDays }) : t('waiting.started')),
    ));
    for (const row of group.items) nodes.push(card(row.item, { now, waitingDays: row.days, showWaiting: true }));
  }
  const any = data.overdue.length || data.dueToday.length || data.followUps.length || data.waiting.length;
  if (!any) {
    nodes.push(el('p', { class: 'empty' }, data.openCount ? t('empty.noDue') : t('empty.noItems')));
    if (data.openCount) nodes.push(el('button', { class: 'btn', dataset: { action: 'set-view', view: 'board' } }, t('goBoard')));
  }
  return el('div', { 'data-screen': 'today' }, nodes);
}

function section(title, items, renderItem) {
  return [
    el('div', { class: 'section-h' }, el('h2', {}, title), el('span', { class: 'count' }, String(items.length))),
    items.length ? items.map(renderItem) : el('p', { class: 'empty' }, t('empty.none')),
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
      el('span', {}, statusText(column.status)),
      el('span', { class: 'count' }, String(column.items.length)),
    ),
    column.items.map((item) => card(item, { now, showWaiting: true })),
    column.items.length ? null : el('p', { class: 'empty' }, t('empty.column')),
    ))),
  );
}

function renderAgenda(now) {
  const data = agenda(store.doc, store.filters, now);
  const blocks = [filterNote()];
  if (data.overdue.length) {
    blocks.push(el('div', { class: 'section-h' }, el('h2', {}, t('section.overdueAgenda')), el('span', { class: 'count' }, String(data.overdue.length))));
    for (const item of data.overdue) blocks.push(card(item, { now }));
  }
  for (const day of data.days) {
    blocks.push(el('section', { class: 'day' },
      el('div', { class: 'day-h' },
        el('strong', {}, `${shortDate(day.date, now, L())} ${dayNickname(day.date, data.today, L())}`),
        el('span', { class: 'muted' }, weekdayLabel(day.date, L())),
      ),
      day.entries.length ? day.entries.map((entry) => agendaEntry(entry, now)) : el('p', { class: 'slim' }, t('empty.day')),
    ));
  }
  if (data.undated.length) {
    blocks.push(el('div', { class: 'section-h' }, el('h2', {}, t('section.undated')), el('span', { class: 'count' }, String(data.undated.length))));
    for (const item of data.undated) blocks.push(card(item, { now }));
  }
  return el('div', { 'data-screen': 'agenda' }, blocks);
}

function agendaEntry(entry, now) {
  let when = t('time.unset');
  if (entry.kind === 'follow') when = t('follow.short');
  else if (entry.timeSet && entry.at) when = formatHm(entry.at, L());
  return el('div', { class: 'entry' },
    el('span', { class: 'time' }, when),
    el('button', { class: 'entry-main', dataset: { action: 'open-item', id: entry.item.id } },
      el('div', { class: 'card-title' }, entry.item.title || t('untitled')),
      metaLine(entry.item, now),
    ),
  );
}

function renderPeople(now) {
  const groups = peopleGroups(store.doc, store.filters, now, store.peopleMode);
  return el('div', { 'data-screen': 'people' },
    filterNote(),
    el('div', { class: 'segment', role: 'tablist' },
      el('button', { dataset: { action: 'people-mode', mode: 'contact' }, 'aria-selected': store.peopleMode === 'contact' ? 'true' : 'false' }, t('people.contact')),
      el('button', { dataset: { action: 'people-mode', mode: 'owner' }, 'aria-selected': store.peopleMode === 'owner' ? 'true' : 'false' }, t('people.owner')),
    ),
    groups.length ? groups.map((group) => el('section', {},
      el('div', { class: 'person-h' },
        el('strong', {}, group.name || (store.peopleMode === 'owner' ? t('people.unknownOwner') : t('people.unknownContact'))),
        el('span', { class: 'muted' }, group.waitingCount ? t('people.waiting', { n: group.count, w: group.waitingCount }) : t('people.count', { n: group.count })),
      ),
      group.items.map((item) => card(item, { now, showWaiting: true })),
    )) : el('p', { class: 'empty' }, t('people.empty')),
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
      item.isExample ? el('span', { class: 'ex-badge' }, t('example')) : null,
      el('span', { class: 'card-title' }, item.title || t('untitled')),
    ),
    metaLine(item, now, { days, showWaiting, follow }),
    showWaiting && status?.role === 'waiting' && item.waitingOn ? el('p', { class: 'wait-note' }, item.waitingOn) : null,
  ),
  el('div', { class: 'card-side' },
    el('button', { class: 'btn tiny', dataset: { action: 'move-item', id: item.id } }, t('move')),
    item.isExample ? el('button', { class: 'icon-btn', dataset: { action: 'delete-example', id: item.id }, 'aria-label': t('deleteExample') }, icon('trash')) : null,
  ));
}

function metaLine(item, now, extra = {}) {
  const category = categoryById(store.doc, item.categoryId);
  const bits = [];
  if (category) bits.push(el('span', { class: 'pill' }, categoryText(category)));
  if (normText(item.contact)) bits.push(el('span', { class: 'pill' }, `@${normText(item.contact)}`));
  const due = dueChip(item, now);
  if (due) bits.push(due);
  if (extra.follow && item.nextFollowUp) {
    const late = item.nextFollowUp < hkDateString(now);
    bits.push(el('span', { class: late ? 'pill late' : 'pill' }, late ? t('follow.late') : t('follow.today')));
  }
  if (extra.days != null) bits.push(el('span', { class: 'pill' }, extra.days > 0 ? countText(extra.days, 'waiting.one', 'waiting.days') : t('waiting.today')));
  if (!bits.length) return null;
  return el('div', { class: 'meta' }, bits);
}

function dueChip(item, now) {
  if (!item.dueAt || isDone(store.doc, item)) return null;
  if (isOverdue(item, store.doc, now)) {
    const days = overdueDays(item, now);
    return el('span', { class: 'pill late' }, days > 0 ? countText(days, 'overdue.one', 'overdue.days') : t('overdue.now'));
  }
  const day = hkDateString(new Date(item.dueAt));
  const today = hkDateString(now);
  const when = day === today ? t('today') : day === addHkDays(today, 1) ? t('tomorrow') : shortDate(day, now, L());
  const time = item.dueTimeSet ? formatHm(item.dueAt, L()) : '';
  return el('span', { class: 'pill' }, time ? `${when} ${time}` : when);
}

function renderSettings(now) {
  const syncError = store.sync.error ? el('p', { class: 'lead', style: { color: 'var(--danger)' } }, store.sync.error) : null;
  return el('div', { 'data-screen': 'settings' },
    el('section', { class: 'set-card', id: 'lang-card' },
      el('h2', {}, t('lang.title')),
      el('p', { class: 'lead' }, t('lang.lead')),
      el('div', { class: 'segment', role: 'group', 'aria-label': t('lang.title') },
        el('button', { dataset: { action: 'set-lang', lang: 'zh-Hant' }, 'aria-selected': L() === 'zh-Hant' ? 'true' : 'false' }, t('lang.zh')),
        el('button', { dataset: { action: 'set-lang', lang: 'en' }, 'aria-selected': L() === 'en' ? 'true' : 'false' }, t('lang.en')),
      ),
    ),
    el('section', { class: 'set-card', id: 'sync-card' },
      el('h2', {}, t('sync.title')),
      el('p', { class: 'lead' }, t('sync.lead')),
      kv(t('sync.owner'), el('input', fieldProps('sync-owner', 'owner', store.secrets.owner, t('sync.ownerPh')))),
      kv(t('sync.repo'), el('input', fieldProps('sync-repo', 'repo', store.secrets.repo, t('sync.repoPh')))),
      kv(t('sync.path'), el('input', fieldProps('sync-path', 'path', store.secrets.path, DEFAULT_SYNC.path))),
      kv(t('sync.token'), el('input', { ...fieldProps('sync-token', 'token', store.secrets.token, 'github_pat_…'), type: 'password', autocomplete: 'off' })),
      kv(t('sync.pass'), el('input', { ...fieldProps('sync-pass', 'passphrase', store.secrets.passphrase, t('sync.passPh')), type: 'password', autocomplete: 'new-password' })),
      el('label', { class: 'checkline' },
        el('input', { type: 'checkbox', dataset: { scope: 'sync', bind: 'remember' }, checked: !!store.secrets.remember }),
        t('sync.remember'),
      ),
      el('p', { class: 'muted' }, store.sync.lastSyncedAt ? formatSyncTime(store.sync.lastSyncedAt, now, L()) : t('sync.never')),
      syncError,
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn primary', dataset: { action: 'sync' } }, t('sync.now')),
        el('button', { class: 'btn', dataset: { action: 'clear-secrets' } }, t('sync.clear')),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, t('status.title')),
      el('p', { class: 'lead' }, t('status.lead')),
      sortByOrder(store.doc.statuses).map((status, index, list) => recordRow('statuses', status, index, list.length, true)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-status', type: 'text', placeholder: t('status.new'), 'aria-label': t('status.new') }),
        el('button', { class: 'btn', dataset: { action: 'add-status' } }, t('status.add')),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, t('category.title')),
      sortByOrder(store.doc.categories).map((category, index, list) => recordRow('categories', category, index, list.length, false)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-category', type: 'text', placeholder: t('category.new'), 'aria-label': t('category.new') }),
        el('button', { class: 'btn', dataset: { action: 'add-category' } }, t('category.add')),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, t('field.title')),
      el('p', { class: 'lead' }, t('field.lead')),
      sortByOrder(store.doc.fields).filter((field) => field.hideable || !field.builtin).map((field, index, list) => fieldRow(field, index, list.length)),
      el('div', { class: 'actions-row' },
        el('input', { id: 'new-field', type: 'text', placeholder: t('field.new'), 'aria-label': t('field.new') }),
        el('select', { id: 'new-field-type', 'aria-label': t('field.type') },
          el('option', { value: 'text' }, t('field.text')),
          el('option', { value: 'date' }, t('field.date')),
        ),
        el('button', { class: 'btn', dataset: { action: 'add-field' } }, t('field.add')),
      ),
    ),
    el('section', { class: 'set-card' },
      el('h2', {}, t('backup.title')),
      el('p', { class: 'lead' }, t('backup.lead')),
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn', dataset: { action: 'export-json' } }, t('backup.export')),
        el('button', { class: 'btn', dataset: { action: 'pick-import', mode: 'merge' } }, t('backup.merge')),
        el('button', { class: 'btn danger', dataset: { action: 'pick-import', mode: 'replace' } }, t('backup.replace')),
        el('button', { class: 'btn', dataset: { action: 'export-ics' } }, t('backup.ics')),
      ),
    ),
    countExamples(store.doc) ? el('section', { class: 'set-card' },
      el('h2', {}, t('examples.title')),
      el('button', { class: 'btn danger', dataset: { action: 'delete-all-examples' } }, t('deleteAllExamples')),
    ) : null,
    el('section', { class: 'set-card' },
      el('h2', {}, t('help.title')),
      el('p', { class: 'lead' }, t('help.quick')),
      el('p', { class: 'lead' }, t('help.install')),
      el('p', { class: 'muted' }, t('help.version')),
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
      value: kind === 'statuses' ? statusText(rec) : categoryText(rec),
      'aria-label': t('nameLabel', { name: kind === 'statuses' ? statusText(rec) : categoryText(rec) }),
      dataset: { scope: kind === 'statuses' ? 'status' : 'category', bind: 'name', id: rec.id, prev: rec.name },
    }),
    withRole ? el('select', {
      'aria-label': t('roleLabel', { name: statusText(rec) }),
      dataset: { scope: 'status', bind: 'role', id: rec.id },
      value: rec.role || 'open',
    },
    el('option', { value: 'open' }, t('role.open')),
    el('option', { value: 'waiting' }, t('role.waiting')),
    el('option', { value: 'done' }, t('role.done')),
    ) : null,
    el('button', {
      class: 'color-btn',
      style: { '--c': rec.color },
      'aria-label': t('pickColor', { name: kind === 'statuses' ? statusText(rec) : categoryText(rec) }),
      dataset: { action: 'toggle-color', kind, id: rec.id },
    }),
    el('button', { class: 'icon-btn', 'aria-label': t('moveUp'), disabled: index === 0, dataset: { action: 'swap', kind, id: rec.id, dir: '-1' } }, icon('up')),
    el('button', { class: 'icon-btn', 'aria-label': t('moveDown'), disabled: index === total - 1, dataset: { action: 'swap', kind, id: rec.id, dir: '1' } }, icon('down')),
    el('button', { class: 'icon-btn', 'aria-label': t('deleteNamed', { name: kind === 'statuses' ? statusText(rec) : categoryText(rec) }), dataset: { action: 'delete-record', kind, id: rec.id } }, icon('trash')),
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
      value: fieldText(field),
      'aria-label': t('fieldName', { name: fieldText(field) }),
      dataset: { scope: 'field', bind: 'label', id: field.id },
    }),
    el('span', { class: 'pill' }, field.type === 'date' ? t('field.date') : field.type === 'textarea' ? t('field.long') : field.type === 'datetime' ? t('field.time') : t('field.text')),
    field.hideable ? el('button', {
      class: 'btn tiny',
      dataset: { action: 'toggle-visible', id: field.id },
    }, field.visible ? t('field.visible') : t('field.hidden')) : null,
    el('button', { class: 'icon-btn', 'aria-label': t('moveUp'), disabled: index === 0, dataset: { action: 'swap', kind: 'fields', id: field.id, dir: '-1' } }, icon('up')),
    el('button', { class: 'icon-btn', 'aria-label': t('moveDown'), disabled: index === total - 1, dataset: { action: 'swap', kind: 'fields', id: field.id, dir: '1' } }, icon('down')),
    field.builtin ? null : el('button', { class: 'icon-btn', 'aria-label': t('deleteNamed', { name: fieldText(field) }), dataset: { action: 'delete-record', kind: 'fields', id: field.id } }, icon('trash')),
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
        el('button', { class: 'btn', dataset: { action: 'close-sheet' } }, t('close')),
      ),
      ...body,
    ));
}

function filterSheet() {
  const options = peopleOptions(store.doc);
  const statuses = sortByOrder(store.doc.statuses);
  const categories = sortByOrder(store.doc.categories);
  return shell(t('filter.title'),
    labeled(t('status'), el('select', { dataset: { scope: 'filter', bind: 'statusId' }, value: store.filters.statusId },
      el('option', { value: '' }, t('all')),
      statuses.map((status) => el('option', { value: status.id }, statusText(status))),
    )),
    labeled(t('category'), el('select', { dataset: { scope: 'filter', bind: 'categoryId' }, value: store.filters.categoryId },
      el('option', { value: '' }, t('all')),
      categories.map((category) => el('option', { value: category.id }, categoryText(category))),
    )),
    labeled(t('people.contact'), el('select', { dataset: { scope: 'filter', bind: 'person' }, value: store.filters.person },
      el('option', { value: '' }, t('all')),
      options.contacts.map((name) => el('option', { value: name }, name)),
    )),
    labeled(t('people.owner'), el('select', { dataset: { scope: 'filter', bind: 'owner' }, value: store.filters.owner },
      el('option', { value: '' }, t('all')),
      options.owners.map((name) => el('option', { value: name }, name)),
    )),
    el('label', { class: 'checkline' },
      el('input', { type: 'checkbox', dataset: { scope: 'filter', bind: 'overdue' }, checked: !!store.filters.overdue }),
      t('overdueOnly'),
    ),
    el('button', { class: 'btn wide', dataset: { action: 'clear-filters' } }, t('clearFilters')),
  );
}

function passSheet() {
  return shell(t('pass.title'),
    el('p', { class: 'lead' }, t('pass.lead')),
    labeled(t('sync.pass'), el('input', {
      id: 'pass-input',
      type: 'password',
      value: '',
      autocomplete: 'current-password',
      autocapitalize: 'off',
      dataset: { scope: 'pass', bind: 'passphrase' },
    })),
    el('label', { class: 'checkline' },
      el('input', { type: 'checkbox', dataset: { scope: 'sync', bind: 'remember' }, checked: !!store.secrets.remember }),
      t('sync.remember'),
    ),
    el('button', { class: 'btn primary wide', dataset: { action: 'submit-pass' } }, t('pass.start')),
  );
}

function moveSheet(id) {
  const item = activeItems(store.doc).find((row) => row.id === id);
  if (!item) return null;
  return shell(t('move.title'),
    el('p', { class: 'lead' }, item.title),
    sortByOrder(store.doc.statuses).map((status) => el('button', {
      class: status.id === item.statusId ? 'btn primary wide' : 'btn wide',
      style: { 'margin-bottom': '8px' },
      dataset: { action: 'pick-status', id: item.id, status: status.id },
    }, statusText(status))),
  );
}

function itemSheet(id) {
  const item = activeItems(store.doc).find((row) => row.id === id);
  if (!item) return null;
  const filled = moreFilled(item);
  return shell(item.isExample ? t('example') : t('edit'),
    peopleList(),
    el('p', { class: 'muted' }, t('autosave')),
    labeled(t('title'), el('input', {
      id: 'item-title',
      type: 'text',
      value: item.title,
      dataset: { scope: 'item', bind: 'title', id: item.id },
    })),
    labeled(t('status'), el('select', { dataset: { scope: 'item', bind: 'statusId', id: item.id }, value: item.statusId },
      sortByOrder(store.doc.statuses).map((status) => el('option', { value: status.id }, statusText(status))),
    )),
    labeled(t('category'), el('select', { dataset: { scope: 'item', bind: 'categoryId', id: item.id }, value: item.categoryId || '' },
      el('option', { value: '' }, t('uncategorized')),
      sortByOrder(store.doc.categories).map((category) => el('option', { value: category.id }, categoryText(category))),
    )),
    el('details', { class: 'more' },
      el('summary', { class: 'sum' }, filled ? t('moreFilled', { n: filled }) : t('more')),
      visibleFields(store.doc).filter((field) => field.section === 'more' && field.visible).map((field) => renderField(item, field)),
    ),
    el('button', { class: 'btn danger', dataset: { action: 'ask-delete-item', id: item.id } }, t('deleteItem')),
  );
}

function renderField(item, field) {
  if (!field.builtin) {
    const value = item.custom?.[field.id] || '';
    const control = field.type === 'date'
      ? el('input', { type: 'date', value, dataset: { scope: 'custom', bind: 'value', id: item.id, field: field.id } })
      : el('input', { type: 'text', value, dataset: { scope: 'custom', bind: 'value', id: item.id, field: field.id } });
    return labeled(fieldText(field), control);
  }
  if (field.key === 'contact' || field.key === 'owner' || field.key === 'waitingOn') {
    return labeled(fieldText(field), el('input', {
      type: 'text',
      value: item[field.key] || '',
      list: field.key === 'waitingOn' ? null : 'people-list',
      dataset: { scope: 'item', bind: field.key, id: item.id },
    }));
  }
  if (field.key === 'issue' || field.key === 'solution' || field.key === 'notes') {
    return labeled(fieldText(field), el('textarea', {
      dataset: { scope: 'item', bind: field.key, id: item.id },
    }, item[field.key] || ''));
  }
  if (field.key === 'dueAt' || field.key === 'startAt') {
    const isDue = field.key === 'dueAt';
    const iso = item[field.key];
    const timeSet = isDue ? item.dueTimeSet : item.startTimeSet;
    return el('div', { class: 'field' },
      el('label', {}, fieldText(field)),
      el('div', { class: 'split' },
        el('input', {
          type: 'date',
          'aria-label': t('datePart', { label: fieldText(field) }),
          value: iso ? hkDateString(new Date(iso)) : '',
          dataset: { scope: 'item', bind: isDue ? 'dueDate' : 'startDate', id: item.id },
        }),
        el('input', {
          type: 'time',
          'aria-label': t('timePart', { label: fieldText(field) }),
          value: iso && timeSet ? hmValue(iso) : '',
          dataset: { scope: 'item', bind: isDue ? 'dueTime' : 'startTime', id: item.id },
        }),
      ),
      el('button', { class: 'btn tiny', dataset: { action: isDue ? 'clear-due' : 'clear-start', id: item.id } }, t('clear')),
    );
  }
  if (field.key === 'nextFollowUp') {
    return labeled(fieldText(field), el('input', {
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
  return { date: shortDate(iso, now, L()), week: weekdayLabel(iso, L()) };
}

function canDrag() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export { waitingDays };
