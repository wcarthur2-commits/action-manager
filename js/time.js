// Hong Kong civil time. The territory is UTC+8 all year (no daylight saving).

export const HK = 'Asia/Hong_Kong';

function digits(value, len) {
  const clean = String(value ?? '').replace(/\D/g, '');
  return clean.padStart(len, '0').slice(-len);
}

export function hkParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: HK,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out = { year: '1970', month: '01', day: '01', hour: '00', minute: '00', second: '00' };
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal' && part.type in out) out[part.type] = digits(part.value, part.type === 'year' ? 4 : 2);
  }
  if (out.hour === '24') out.hour = '00';
  return out;
}

export function hkDateString(date = new Date()) {
  const p = hkParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function hkWallToISO(dateStr, timeStr = '00:00') {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, (hh || 0) - 8, mm || 0, 0, 0)).toISOString();
}

export function padDate(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function validYmd(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addHkDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return padDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function diffHkDays(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday, for a civil date. */
export function hkDow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayLabel(dateStr) {
  const noon = new Date(hkWallToISO(dateStr, '12:00'));
  return new Intl.DateTimeFormat('zh-HK', { timeZone: HK, weekday: 'long' }).format(noon);
}

export function shortDate(dateStr, now = new Date()) {
  const [y, m, d] = dateStr.split('-');
  const thisYear = hkDateString(now).slice(0, 4);
  const prefix = y !== thisYear ? `${y}年` : '';
  return `${prefix}${Number(m)}月${Number(d)}日`;
}

export function formatHm(iso) {
  const p = hkParts(new Date(iso));
  const h = Number(p.hour);
  const ap = h >= 12 ? '下午' : '上午';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${ap}${h12}:${p.minute}`;
}

export function hmValue(iso) {
  const p = hkParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

export function formatSyncTime(ts, now = new Date()) {
  if (!ts) return '未同步過';
  const diff = Math.max(0, now.getTime() - ts);
  if (diff < 15000) return '剛剛同步';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前同步`;
  if (diff < 6 * 3600000) return `${Math.floor(diff / 3600000)} 個鐘前同步`;
  const d = hkDateString(new Date(ts));
  const t = formatHm(new Date(ts).toISOString());
  const today = hkDateString(now);
  if (d === today) return `今日 ${t} 同步`;
  if (d === addHkDays(today, -1)) return `尋日 ${t} 同步`;
  return `${shortDate(d, now)} ${t} 同步`;
}

export function dayNickname(dateStr, todayStr) {
  const diff = diffHkDays(todayStr, dateStr);
  if (diff === 0) return '今日';
  if (diff === 1) return '聽日';
  if (diff === 2) return '後日';
  return weekdayLabel(dateStr);
}
