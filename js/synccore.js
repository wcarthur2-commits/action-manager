import { canonicalDoc, mergeDocs } from './model.js?v=v4';

/**
 * Pull the remote ciphertext, decrypt, merge by updatedAt, then push.
 * A 409/422 from GitHub retries the whole read-merge-write up to 4 times.
 * Decrypt failures abort before any write.
 */
export async function syncLoop(ctx) {
  await ctx.assertRepo();
  const max = ctx.maxAttempts || 4;
  let lastError = null;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    const remote = await ctx.getRemote();
    const local = await ctx.getLocal();
    let salt = await ctx.getSalt();
    let remoteData = null;
    if (remote) {
      const decrypted = await ctx.decrypt(remote.text, ctx.passphrase);
      remoteData = decrypted.data;
      salt = decrypted.salt || salt;
    }
    const base = remoteData ? mergeDocs(local, remoteData) : local;
    const localNow = await ctx.getLocal();
    const finalDoc = mergeDocs(base, localNow);
    await ctx.apply(finalDoc);
    const after = await ctx.getLocal();
    const toSend = mergeDocs(finalDoc, after);
    if (remoteData && canonicalDoc(remoteData) === canonicalDoc(toSend)) {
      return { ok: true, uploaded: false, attempts: attempt, doc: toSend };
    }
    const sealed = await ctx.encrypt(toSend, ctx.passphrase, { salt });
    await ctx.saveSalt(sealed.salt);
    try {
      await ctx.putRemote(sealed.text, remote?.sha || null);
      return { ok: true, uploaded: true, attempts: attempt, doc: toSend };
    } catch (err) {
      lastError = err;
      const conflict = err?.code === 'CONFLICT' || err?.status === 409 || err?.status === 422;
      if (!conflict || attempt === max) throw err;
    }
  }
  throw lastError;
}
