// The only network calls in this app live here, and they only go to api.github.com.

import { b64ToUtf8, utf8ToB64 } from './b64.js?v=v4';
import { coded } from './errors.js?v=v4';

const API = 'https://api.github.com';

export function normalizeRepoPath(path) {
  const value = String(path || '').trim().replace(/^\/+/, '');
  if (!value || value.startsWith('/') || value.includes('..') || value.includes('\\')) return '';
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return '';
  return value;
}

export function validSlug(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(String(value || '').trim());
}

function encodePath(path) {
  return normalizeRepoPath(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function repoPath(owner, repo, rest = '') {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${rest}`;
}

function isEmptyMessage(message) {
  return /repository is empty/i.test(message || '');
}

async function request(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw coded('NETWORK');
  }
  if (response.status === 404) return { notFound: true, status: 404 };
  if (!response.ok) {
    let message = '';
    try {
      message = (await response.json()).message || '';
    } catch {
      message = '';
    }
    if (isEmptyMessage(message)) throw coded('EMPTY_REPO', response.status, message);
    if (response.status === 401) throw coded('UNAUTHORIZED', 401, message);
    if (response.status === 403) {
      if (/rate limit/i.test(message)) throw coded('RATE_LIMIT', 403, message);
      throw coded('FORBIDDEN', 403, message);
    }
    if (response.status === 409 || response.status === 422) throw coded('CONFLICT', response.status, message);
    throw coded('GITHUB', response.status, message);
  }
  return { status: response.status, data: await response.json() };
}

export async function getRepo({ owner, repo, token }) {
  const res = await request(repoPath(owner, repo), { token });
  if (res.notFound) throw coded('NOT_FOUND', 404);
  return res.data;
}

export async function getContent({ owner, repo, path, token }) {
  try {
    const res = await request(`${repoPath(owner, repo)}/contents/${encodePath(path)}`, { token });
    if (res.notFound) return null;
    if (!res.data?.content || !res.data.sha) throw coded('GITHUB', res.status, 'missing content');
    return { sha: res.data.sha, text: b64ToUtf8(res.data.content) };
  } catch (err) {
    if (err.code === 'EMPTY_REPO') return null;
    throw err;
  }
}

async function putViaContents({ owner, repo, path, token, text, sha, message }) {
  const body = { message, content: utf8ToB64(text) };
  if (sha) body.sha = sha;
  const res = await request(`${repoPath(owner, repo)}/contents/${encodePath(path)}`, {
    token,
    method: 'PUT',
    body,
  });
  if (res.notFound) throw coded('NOT_FOUND', 404);
  return res.data;
}

/**
 * A brand-new private repo has no commits, and the contents API refuses the first PUT.
 * Create the initial commit with the Git Data API, then point the default branch at it.
 */
async function createFirstFile({ owner, repo, path, token, text, message }) {
  const info = await getRepo({ owner, repo, token });
  const branch = info.default_branch || 'main';
  const filePath = normalizeRepoPath(path);
  const blob = await request(`${repoPath(owner, repo)}/git/blobs`, {
    token,
    method: 'POST',
    body: { content: utf8ToB64(text), encoding: 'base64' },
  });
  const tree = await request(`${repoPath(owner, repo)}/git/trees`, {
    token,
    method: 'POST',
    body: {
      tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blob.data.sha }],
    },
  });
  const commit = await request(`${repoPath(owner, repo)}/git/commits`, {
    token,
    method: 'POST',
    body: { message, tree: tree.data.sha, parents: [] },
  });
  try {
    await request(`${repoPath(owner, repo)}/git/refs`, {
      token,
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: commit.data.sha },
    });
  } catch (err) {
    if (err.code === 'CONFLICT' || err.status === 422) throw coded('CONFLICT', 409, err.detail || '');
    throw err;
  }
  return { commit: commit.data.sha, branch, seeded: true };
}

async function hasNoCommits(owner, repo, token) {
  try {
    const res = await request(`${repoPath(owner, repo)}/commits?per_page=1`, { token });
    return !!res.notFound;
  } catch (err) {
    if (err.code === 'EMPTY_REPO') return true;
    throw err;
  }
}

export async function putContent({ owner, repo, path, token, text, sha, message = 'sync' }) {
  try {
    return await putViaContents({ owner, repo, path, token, text, sha, message });
  } catch (err) {
    if (sha || (err.code !== 'EMPTY_REPO' && err.code !== 'CONFLICT')) throw err;
    if (err.code === 'CONFLICT' && !(await hasNoCommits(owner, repo, token))) throw err;
    return createFirstFile({ owner, repo, path, token, text, message });
  }
}
