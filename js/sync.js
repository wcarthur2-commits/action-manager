import { getContent, getRepo, normalizeRepoPath, putContent, validSlug } from './github.js';
import { decryptJson, encryptJson } from './crypto.js';
import { ERROR_TEXT, coded } from './errors.js';
import { shouldWrite } from './model.js';
import { syncLoop } from './synccore.js';

export function createSyncController({ store, db, toast, refresh }) {
  let inSync = false;
  let dirty = false;
  let timer = 0;

  function setPhase(phase) {
    store.sync.phase = phase;
    refresh?.({ chip: true });
  }

  async function saveSecrets() {
    const remember = !!store.secrets.remember;
    await db.setMeta('sync', {
      owner: store.secrets.owner.trim(),
      repo: store.secrets.repo.trim(),
      path: (store.secrets.path || '').trim(),
      token: store.secrets.token.trim(),
      remember,
      passphrase: remember ? store.secrets.passphrase : '',
      salt: store.secrets.salt || '',
      lastSyncedAt: store.sync.lastSyncedAt || null,
      lastError: store.sync.error || '',
    });
  }

  function configured() {
    const { owner, repo, token } = store.secrets;
    return !!(owner.trim() && repo.trim() && token.trim());
  }

  function schedule() {
    if (inSync) {
      dirty = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      run({ manual: false, reason: 'edit' });
    }, 3000);
  }

  async function applyDoc(doc) {
    for (const [name, list] of [
      ['items', doc.items],
      ['statuses', doc.statuses],
      ['categories', doc.categories],
      ['fields', doc.fields],
    ]) {
      for (const rec of list || []) {
        const current = await db.getRecord(name, rec.id);
        if (shouldWrite(current, rec)) await db.putRecord(name, rec);
      }
    }
  }

  async function run({ manual = false } = {}) {
    if (inSync) {
      dirty = true;
      return;
    }
    if (!manual && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase('offline');
      return;
    }
    const owner = store.secrets.owner.trim();
    const repo = store.secrets.repo.trim();
    const path = (store.secrets.path || '').trim();
    const token = store.secrets.token.trim();
    const passphrase = store.secrets.passphrase;
    if (!owner || !repo || !token) {
      if (manual) toast(ERROR_TEXT.MISSING_CONFIG);
      setPhase(store.sync.lastSyncedAt ? 'ok' : 'idle');
      return;
    }
    if (!validSlug(owner) || !validSlug(repo)) {
      store.sync.error = ERROR_TEXT.BAD_NAME;
      setPhase('error');
      if (manual) toast(ERROR_TEXT.BAD_NAME);
      return;
    }
    if (!normalizeRepoPath(path)) {
      store.sync.error = ERROR_TEXT.BAD_PATH;
      setPhase('error');
      if (manual) toast(ERROR_TEXT.BAD_PATH);
      return;
    }
    if (!passphrase) {
      setPhase('need-pass');
      if (manual) refresh?.({ passphrase: true });
      return;
    }

    inSync = true;
    setPhase('syncing');
    try {
      do {
        dirty = false;
        await syncLoop({
          passphrase,
          assertRepo: async () => {
            const info = await getRepo({ owner, repo, token });
            if (!info.private) throw coded('PUBLIC_REPO');
          },
          getRemote: () => getContent({ owner, repo, path, token }),
          putRemote: (text, sha) => putContent({ owner, repo, path, token, text, sha, message: 'sync' }),
          getLocal: () => db.loadDoc(),
          apply: applyDoc,
          encrypt: (doc, pw, opts) => encryptJson(doc, pw, opts),
          decrypt: (text, pw) => decryptJson(text, pw),
          getSalt: async () => store.secrets.salt || null,
          saveSalt: async (salt) => {
            store.secrets.salt = salt || '';
          },
        });
      } while (dirty);
      store.sync.lastSyncedAt = Date.now();
      store.sync.error = '';
      setPhase('ok');
      await saveSecrets();
      store.doc = await db.loadDoc();
      refresh?.({ main: true });
      if (manual) toast('同步完成');
    } catch (err) {
      const msg = ERROR_TEXT[err.code] || ERROR_TEXT.GITHUB;
      const repeat = store.sync.error === msg && !manual;
      store.sync.error = msg;
      store.sync.lastSyncedAt = store.sync.lastSyncedAt || null;
      setPhase('error');
      await saveSecrets();
      if (!repeat) toast(msg);
    } finally {
      inSync = false;
      if (dirty) {
        dirty = false;
        schedule();
      }
    }
  }

  return { schedule, run, saveSecrets, configured };
}
