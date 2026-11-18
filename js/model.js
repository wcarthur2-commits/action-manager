import { addHkDays, diffHkDays, hkDateString, hkWallToISO } from './time.js';

export const SEED_TS = Date.parse('2020-01-01T00:00:00.000Z');
export const EXAMPLE_IDS = ['ex-tax', 'ex-quote', 'ex-meeting'];

export const PALETTE = [
  '#8a8175',
  '#0c6b56',
  '#a15c07',
  '#1f7a4d',
  '#1d4e89',
  '#9c3b5a',
  '#5c4d8a',
  '#a33b32',
  '#3d6b8c',
  '#5c6b2f',
];

const FIELD_DEFS = [
  ['fld-title', 'title', '標題', 'text', false, true, 'main', 0],
  ['fld-status', 'statusId', '狀態', 'status', false, true, 'main', 1],
  ['fld-category', 'categoryId', '分類', 'category', false, true, 'main', 2],
  ['fld-contact', 'contact', '要搵嘅人', 'text', true, true, 'more', 10],
  ['fld-owner', 'owner', '負責人', 'text', true, true, 'more', 11],
  ['fld-start', 'startAt', '開始時間', 'datetime', true, true, 'more', 12],
  ['fld-due', 'dueAt', '期限', 'datetime', true, true, 'more', 13],
  ['fld-waiting', 'waitingOn', '等緊乜', 'text', true, true, 'more', 14],
  ['fld-follow', 'nextFollowUp', '下次跟進日期', 'date', true, true, 'more', 15],
  ['fld-issue', 'issue', 'Issue', 'textarea', true, true, 'more', 16],
  ['fld-solution', 'solution', '解決辦法', 'textarea', true, true, 'more', 17],
  ['fld-notes', 'notes', '備註', 'textarea', true, true, 'more', 18],
];

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

export function canon(value) {
  return JSON.stringify(sortKeys(value));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function sortByOrder(list) {
  return [...(list || [])]
    .filter((rec) => rec && !rec.deletedAt)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)));
}

export function nextOrder(list) {
  const live = (list || []).filter((rec) => rec && !rec.deletedAt);
  if (!live.length) return 0;
  return Math.max(...live.map((rec) => rec.order ?? 0)) + 1;
}

export function markUpdated(rec, now = Date.now()) {
  rec.updatedAt = now;
  return rec;
}

export function noteUserEdit(item, now = Date.now()) {
  if (item.isExample) item.isExample = false;
  item.updatedAt = now;
  return item;
}

export function markDeleted(rec, now = Date.now()) {
  rec.deletedAt = now;
  rec.updatedAt = now;
  return rec;
}

export function pick(a, b) {
  const aTime = a?.updatedAt || 0;
  const bTime = b?.updatedAt || 0;
  if (aTime !== bTime) return aTime > bTime ? a : b;
  if (!!a?.deletedAt !== !!b?.deletedAt) return a?.deletedAt ? a : b;
  const aCanon = canon(a);
  const bCanon = canon(b);
  if (aCanon === bCanon) return a;
  return aCanon > bCanon ? a : b;
}

export function mergeById(listA = [], listB = []) {
  const map = new Map();
  for (const rec of [...listA, ...listB]) {
    if (!rec?.id) continue;
    const prev = map.get(rec.id);
    map.set(rec.id, prev ? pick(prev, rec) : rec);
  }
  return [...map.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function mergeDocs(a = {}, b = {}) {
  return {
    v: 1,
    items: mergeById(a.items, b.items),
    statuses: mergeById(a.statuses, b.statuses),
    categories: mergeById(a.categories, b.categories),
    fields: mergeById(a.fields, b.fields),
  };
}

export function canonicalDoc(doc) {
  return canon({
    v: 1,
    items: mergeById(doc?.items || [], []),
    statuses: mergeById(doc?.statuses || [], []),
    categories: mergeById(doc?.categories || [], []),
    fields: mergeById(doc?.fields || [], []),
  });
}

export function shouldWrite(current, incoming) {
  if (!incoming?.id) return false;
  if (!current) return true;
  return canon(pick(current, incoming)) === canon(incoming) && canon(current) !== canon(incoming);
}

export function defaultStatuses(now = SEED_TS) {
  return [
    { id: 'st-todo', name: '待做', color: '#8a8175', role: 'open', order: 0, updatedAt: now, deletedAt: null },
    { id: 'st-doing', name: '進行中', color: '#0c6b56', role: 'open', order: 1, updatedAt: now, deletedAt: null },
    { id: 'st-wait', name: '等緊人／等回覆', color: '#a15c07', role: 'waiting', order: 2, updatedAt: now, deletedAt: null },
    { id: 'st-done', name: '已完成', color: '#1f7a4d', role: 'done', order: 3, updatedAt: now, deletedAt: null },
  ];
}

export function defaultCategories(now = SEED_TS) {
  return [
    { id: 'cat-work', name: '工作', color: '#1d4e89', order: 0, updatedAt: now, deletedAt: null },
    { id: 'cat-client', name: '客戶', color: '#9c3b5a', order: 1, updatedAt: now, deletedAt: null },
    { id: 'cat-personal', name: '個人', color: '#3d6b4f', order: 2, updatedAt: now, deletedAt: null },
    { id: 'cat-money', name: '財務', color: '#8a5a10', order: 3, updatedAt: now, deletedAt: null },
  ];
}

export function defaultFields(now = SEED_TS) {
  return FIELD_DEFS.map(([id, key, label, type, hideable, visible, section, order]) => ({
    id,
    key,
    label,
    type,
    builtin: true,
    hideable,
    visible,
    section,
    order,
    updatedAt: now,
    deletedAt: null,
  }));
}

export function blankItem(partial = {}, now = Date.now()) {
  return {
    id: partial.id || uid(),
    title: partial.title || '',
    statusId: partial.statusId || 'st-todo',
    categoryId: partial.categoryId || null,
    contact: partial.contact || '',
    owner: partial.owner || '',
    startAt: partial.startAt || null,
    startTimeSet: !!partial.startTimeSet,
    dueAt: partial.dueAt || null,
    dueTimeSet: !!partial.dueTimeSet,
    waitingOn: partial.waitingOn || '',
    waitingSince: partial.waitingSince || null,
    nextFollowUp: partial.nextFollowUp || null,
    issue: partial.issue || '',
    solution: partial.solution || '',
    notes: partial.notes || '',
    custom: partial.custom || {},
    isExample: !!partial.isExample,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    deletedAt: partial.deletedAt || null,
  };
}

export function exampleItems(now = new Date()) {
  const today = hkDateString(now);
  return [
    blankItem({
      id: 'ex-tax',
      title: '例子：交稅表俾會計師',
      statusId: 'st-doing',
      categoryId: 'cat-money',
      contact: '李會計',
      owner: '我',
      dueAt: hkWallToISO(today, '15:00'),
      dueTimeSet: true,
      notes: '記得帶埋收據',
      isExample: true,
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    }),
    blankItem({
      id: 'ex-quote',
      title: '例子：等陳生確認報價',
      statusId: 'st-wait',
      categoryId: 'cat-client',
      contact: '陳生',
      owner: '我',
      waitingOn: '等佢確認第三版報價',
      waitingSince: hkWallToISO(addHkDays(today, -5), '09:00'),
      nextFollowUp: today,
      issue: '價錢未夾到',
      isExample: true,
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    }),
    blankItem({
      id: 'ex-meeting',
      title: '例子：準備客戶會議議程',
      statusId: 'st-todo',
      categoryId: 'cat-work',
      contact: '黃小姐',
      owner: '我',
      dueAt: hkWallToISO(addHkDays(today, -1), '10:00'),
      dueTimeSet: true,
      notes: '帶埋上年合約',
      issue: '議程未定',
      solution: '先用三點：進度、報價、下一步',
      isExample: true,
      createdAt: SEED_TS,
      updatedAt: SEED_TS,
    }),
  ];
}

export function freshDoc(now = new Date()) {
  return {
    v: 1,
    items: exampleItems(now),
    statuses: defaultStatuses(),
    categories: defaultCategories(),
    fields: defaultFields(),
  };
}

export function activeItems(doc) {
  return (doc?.items || []).filter((item) => item && !item.deletedAt);
}

export function statusById(doc, id) {
  return (doc?.statuses || []).find((status) => status.id === id && !status.deletedAt) || null;
}

export function categoryById(doc, id) {
  return (doc?.categories || []).find((category) => category.id === id && !category.deletedAt) || null;
}

export function isDone(doc, item) {
  return statusById(doc, item?.statusId)?.role === 'done';
}

export function isOverdue(item, doc, now = new Date()) {
  if (!item?.dueAt || item.deletedAt || isDone(doc, item)) return false;
  if (item.dueTimeSet) return new Date(item.dueAt).getTime() < now.getTime();
  return hkDateString(new Date(item.dueAt)) < hkDateString(now);
}

export function waitingDays(item, now = new Date()) {
  const since = item?.waitingSince || item?.createdAt;
  if (!since) return 0;
  const from = typeof since === 'number' ? hkDateString(new Date(since)) : hkDateString(new Date(since));
  return Math.max(0, diffHkDays(from, hkDateString(now)));
}

export function overdueDays(item, now = new Date()) {
  if (!item?.dueAt) return 0;
  return Math.max(0, diffHkDays(hkDateString(new Date(item.dueAt)), hkDateString(now)));
}

export function visibleFields(doc) {
  return sortByOrder(doc?.fields || []);
}

export function matchesItem(doc, item, filters = {}, now = new Date()) {
  if (!item || item.deletedAt) return false;
  if (filters.statusId && item.statusId !== filters.statusId) return false;
  if (filters.categoryId && item.categoryId !== filters.categoryId) return false;
  if (filters.person && normText(item.contact) !== filters.person) return false;
  if (filters.owner && normText(item.owner) !== filters.owner) return false;
  if (filters.overdue && !isOverdue(item, doc, now)) return false;
  const query = normText(filters.query).toLocaleLowerCase('zh-HK');
  if (!query) return true;
  const category = categoryById(doc, item.categoryId);
  const status = statusById(doc, item.statusId);
  const custom = Object.values(item.custom || {}).join('\n');
  const haystack = [
    item.title,
    item.contact,
    item.owner,
    item.waitingOn,
    item.issue,
    item.solution,
    item.notes,
    category?.name,
    status?.name,
    custom,
  ].join('\n').toLocaleLowerCase('zh-HK');
  return haystack.includes(query);
}

function compareSchedule(a, b) {
  if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
  if (a.dueAt && !b.dueAt) return -1;
  if (!a.dueAt && b.dueAt) return 1;
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

export function dashboard(doc, filters = {}, now = new Date()) {
  const today = hkDateString(now);
  const items = activeItems(doc).filter((item) => matchesItem(doc, item, filters, now) && !isDone(doc, item));
  const overdue = [];
  const dueToday = [];
  for (const item of items) {
    if (!item.dueAt) continue;
    if (isOverdue(item, doc, now)) overdue.push(item);
    else if (hkDateString(new Date(item.dueAt)) === today) dueToday.push(item);
  }
  overdue.sort(compareSchedule);
  dueToday.sort(compareSchedule);
  const followUps = items
    .filter((item) => item.nextFollowUp && item.nextFollowUp <= today)
    .sort((a, b) => String(a.nextFollowUp).localeCompare(String(b.nextFollowUp)) || compareSchedule(a, b));
  const waiting = waitingGroups(items, doc, now);
  return { today, overdue, dueToday, followUps, waiting, openCount: items.length };
}

function waitingGroups(items, doc, now) {
  const map = new Map();
  for (const item of items) {
    if (statusById(doc, item.statusId)?.role !== 'waiting') continue;
    const name = normText(item.contact) || '未寫邊個';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(item);
  }
  const groups = [...map.entries()].map(([name, list]) => {
    const enriched = list
      .map((item) => ({ item, days: waitingDays(item, now) }))
      .sort((a, b) => b.days - a.days || compareSchedule(a.item, b.item));
    return { name, items: enriched, maxDays: enriched[0]?.days || 0 };
  });
  groups.sort((a, b) => b.maxDays - a.maxDays || a.name.localeCompare(b.name, 'zh-HK'));
  return groups;
}

function minutesOf(iso) {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function agenda(doc, filters = {}, now = new Date()) {
  const today = hkDateString(now);
  const items = activeItems(doc).filter((item) => matchesItem(doc, item, filters, now) && !isDone(doc, item));
  const overdue = items.filter((item) => isOverdue(item, doc, now)).sort(compareSchedule);
  const days = [];
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addHkDays(today, offset);
    const entries = [];
    for (const item of items) {
      const startDay = item.startAt ? hkDateString(new Date(item.startAt)) : '';
      const dueDay = item.dueAt ? hkDateString(new Date(item.dueAt)) : '';
      let placed = false;
      if (startDay === date) {
        entries.push({
          item,
          kind: 'start',
          sort: item.startTimeSet ? minutesOf(item.startAt) : 24 * 60,
          timeSet: !!item.startTimeSet,
          at: item.startAt,
        });
        placed = true;
      } else if (dueDay === date && !isOverdue(item, doc, now)) {
        entries.push({
          item,
          kind: 'due',
          sort: item.dueTimeSet ? minutesOf(item.dueAt) : 24 * 60,
          timeSet: !!item.dueTimeSet,
          at: item.dueAt,
        });
        placed = true;
      }
      if (item.nextFollowUp === date && !placed) {
        entries.push({ item, kind: 'follow', sort: 24 * 60 + 1, timeSet: false, at: null });
      }
    }
    entries.sort((a, b) => a.sort - b.sort || a.item.title.localeCompare(b.item.title, 'zh-HK'));
    days.push({ date, entries });
  }
  const undated = items.filter((item) => !item.startAt && !item.dueAt && !item.nextFollowUp);
  return { today, overdue, days, undated };
}

export function peopleGroups(doc, filters = {}, now = new Date(), mode = 'contact') {
  const items = activeItems(doc).filter((item) => matchesItem(doc, item, filters, now));
  const map = new Map();
  for (const item of items) {
    const raw = mode === 'owner' ? item.owner : item.contact;
    const name = normText(raw) || (mode === 'owner' ? '未指定負責人' : '未指定要搵嘅人');
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(item);
  }
  const groups = [...map.entries()].map(([name, list]) => {
    list.sort((a, b) => Number(isDone(doc, a)) - Number(isDone(doc, b)) || compareSchedule(a, b));
    const waiting = list.filter((item) => statusById(doc, item.statusId)?.role === 'waiting');
    const maxDays = waiting.reduce((max, item) => Math.max(max, waitingDays(item, now)), 0);
    return { name, items: list, count: list.length, maxDays, waitingCount: waiting.length };
  });
  groups.sort((a, b) => b.maxDays - a.maxDays || b.waitingCount - a.waitingCount || a.name.localeCompare(b.name, 'zh-HK'));
  return groups;
}

export function boardColumns(doc, filters = {}, now = new Date()) {
  const columns = sortByOrder(doc?.statuses).map((status) => ({
    status,
    items: activeItems(doc)
      .filter((item) => item.statusId === status.id && matchesItem(doc, item, filters, now))
      .sort(compareSchedule),
  }));
  const known = new Set(columns.map((column) => column.status.id));
  const orphans = activeItems(doc).filter((item) => !known.has(item.statusId) && matchesItem(doc, item, filters, now));
  if (orphans.length) {
    columns.push({
      status: { id: '', name: '未有狀態', color: '#8a8175', role: 'open' },
      items: orphans.sort(compareSchedule),
    });
  }
  return columns;
}

export function peopleOptions(doc) {
  const contacts = new Set();
  const owners = new Set();
  for (const item of activeItems(doc)) {
    const contact = normText(item.contact);
    const owner = normText(item.owner);
    if (contact) contacts.add(contact);
    if (owner) owners.add(owner);
  }
  const sort = (a, b) => a.localeCompare(b, 'zh-HK');
  return {
    contacts: [...contacts].sort(sort),
    owners: [...owners].sort(sort),
    both: [...new Set([...contacts, ...owners])].sort(sort),
  };
}

export function setStatus(doc, item, statusId, now = new Date()) {
  const prev = statusById(doc, item.statusId);
  const next = (doc.statuses || []).find((status) => status.id === statusId && !status.deletedAt);
  item.statusId = statusId;
  if (next?.role === 'waiting' && prev?.role !== 'waiting') item.waitingSince = now.toISOString();
  if (next && next.role !== 'waiting' && prev?.role === 'waiting') item.waitingSince = null;
  return item;
}

export function swapOrder(list, id, dir) {
  const live = sortByOrder(list);
  const index = live.findIndex((rec) => rec.id === id);
  const target = index + dir;
  if (index < 0 || target < 0 || target >= live.length) return [];
  const before = live.map((rec) => rec.order);
  live.forEach((rec, order) => {
    rec.order = order;
  });
  const tmp = live[index].order;
  live[index].order = live[target].order;
  live[target].order = tmp;
  const now = Date.now();
  const changed = [];
  live.forEach((rec, orderIndex) => {
    if (rec.order !== before[orderIndex]) {
      rec.updatedAt = now;
      changed.push(rec);
    }
  });
  return changed;
}

export function countExamples(doc) {
  return activeItems(doc).filter((item) => item.isExample).length;
}

export function tombstoneExamples(doc, now = Date.now()) {
  let count = 0;
  for (const item of doc.items || []) {
    if (item.isExample && !item.deletedAt) {
      markDeleted(item, now);
      count += 1;
    }
  }
  return count;
}

export function toBackup(doc) {
  return {
    format: 'action-manager-backup',
    v: 1,
    exportedAt: new Date().toISOString(),
    items: doc.items || [],
    statuses: doc.statuses || [],
    categories: doc.categories || [],
    fields: doc.fields || [],
  };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error('BAD_BACKUP');
    err.code = 'BAD_BACKUP';
    throw err;
  }
  if (data?.format === 'action-manager-seal') {
    const err = new Error('ENCRYPTED_BACKUP');
    err.code = 'ENCRYPTED_BACKUP';
    throw err;
  }
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.statuses)) {
    const err = new Error('BAD_BACKUP');
    err.code = 'BAD_BACKUP';
    throw err;
  }
  return {
    v: 1,
    items: data.items,
    statuses: data.statuses,
    categories: Array.isArray(data.categories) ? data.categories : [],
    fields: Array.isArray(data.fields) ? data.fields : [],
  };
}

export function restoreDoc(local, incoming, now = Date.now()) {
  const apply = (localList = [], incomingList = []) => {
    const ids = new Set(incomingList.map((rec) => rec.id));
    const bumped = incomingList.filter((rec) => rec?.id).map((rec) => ({ ...rec, updatedAt: now }));
    const tombs = localList
      .filter((rec) => rec?.id && !ids.has(rec.id) && !rec.deletedAt)
      .map((rec) => ({ ...rec, deletedAt: now, updatedAt: now }));
    return [...bumped, ...tombs];
  };
  return {
    v: 1,
    items: apply(local.items, incoming.items),
    statuses: apply(local.statuses, incoming.statuses),
    categories: apply(local.categories, incoming.categories),
    fields: apply(local.fields, incoming.fields),
  };
}

export function filtersActive(filters) {
  return !!(filters?.statusId || filters?.categoryId || filters?.person || filters?.owner || filters?.overdue || normText(filters?.query));
}
