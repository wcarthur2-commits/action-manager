const DB_NAME = 'action-manager';
const DB_VERSION = 1;
const STORES = ['items', 'statuses', 'categories', 'fields'];

let dbPromise = null;

export function supported() {
  return typeof indexedDB !== 'undefined';
}

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function requestResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });
}

export async function getAll(store) {
  const db = await open();
  const tx = db.transaction(store, 'readonly');
  const rows = await requestResult(tx.objectStore(store).getAll());
  await transactionDone(tx);
  return rows || [];
}

export async function getRecord(store, id) {
  const db = await open();
  const tx = db.transaction(store, 'readonly');
  const row = await requestResult(tx.objectStore(store).get(id));
  await transactionDone(tx);
  return row || null;
}

export async function putRecord(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await transactionDone(tx);
}

export async function loadDoc() {
  const [items, statuses, categories, fields] = await Promise.all([
    getAll('items'),
    getAll('statuses'),
    getAll('categories'),
    getAll('fields'),
  ]);
  return { v: 1, items, statuses, categories, fields };
}

export async function replaceAll(doc) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) {
    const store = tx.objectStore(name);
    store.clear();
    for (const rec of doc[name] || []) store.put(rec);
  }
  await transactionDone(tx);
}

export async function getMeta(key) {
  const db = await open();
  const tx = db.transaction('meta', 'readonly');
  const row = await requestResult(tx.objectStore('meta').get(key));
  await transactionDone(tx);
  return row ? row.value : null;
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await transactionDone(tx);
}
