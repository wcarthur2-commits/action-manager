import { addHkDays, hkDateString, hkDow, hkWallToISO, padDate, validYmd } from './time.js';

const WEEKDAYS = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const DATE_RE = /(大後日|後日|聽日|明天|今日|今天|下(?:週|星期|禮拜)[一二三四五六日天]|(?:星期|週|禮拜)[一二三四五六日天]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/;

function cleanToken(token) {
  return String(token || '').replace(/^[，。,.、:：]+|[，。,.、:：]+$/g, '');
}

function thisOrNextYear(month, day, todayStr) {
  const year = Number(todayStr.slice(0, 4));
  if (!validYmd(year, month, day)) return null;
  const candidate = padDate(year, month, day);
  if (candidate < todayStr && validYmd(year + 1, month, day)) return padDate(year + 1, month, day);
  return candidate;
}

function dateOfWeek(todayStr, targetDow, mode) {
  const todayDow = hkDow(todayStr);
  if (mode === 'upcoming') {
    const delta = (targetDow - todayDow + 7) % 7;
    return addHkDays(todayStr, delta);
  }
  const targetIndex = targetDow === 0 ? 6 : targetDow - 1;
  const todayIndex = todayDow === 0 ? 6 : todayDow - 1;
  const thisMonday = addHkDays(todayStr, -todayIndex);
  return addHkDays(addHkDays(thisMonday, 7), targetIndex);
}

export function parseDateToken(token, now = new Date()) {
  const text = cleanToken(token);
  const today = hkDateString(now);
  const relative = { 今日: 0, 今天: 0, 聽日: 1, 明天: 1, 後日: 2, 大後日: 3 };
  if (Object.prototype.hasOwnProperty.call(relative, text)) return addHkDays(today, relative[text]);

  let match = text.match(/^下(?:週|星期|禮拜)([一二三四五六日天])$/);
  if (match) return dateOfWeek(today, WEEKDAYS[match[1]], 'next');

  match = text.match(/^(?:星期|週|禮拜)([一二三四五六日天])$/);
  if (match) return dateOfWeek(today, WEEKDAYS[match[1]], 'upcoming');

  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match && validYmd(+match[1], +match[2], +match[3])) return padDate(+match[1], +match[2], +match[3]);

  match = text.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (match) return thisOrNextYear(+match[1], +match[2], today);

  match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) {
    let year = match[3] ? +match[3] : null;
    if (year != null && year < 100) year += 2000;
    const day = +match[1];
    const month = +match[2];
    const monthFirst = +match[1];
    const daySecond = +match[2];
    if (year) {
      if (validYmd(year, month, day)) return padDate(year, month, day);
      if (validYmd(year, monthFirst, daySecond)) return padDate(year, monthFirst, daySecond);
      return null;
    }
    if (validYmd(Number(today.slice(0, 4)), month, day)) return thisOrNextYear(month, day, today);
    if (validYmd(Number(today.slice(0, 4)), monthFirst, daySecond)) return thisOrNextYear(monthFirst, daySecond, today);
  }
  return null;
}

function to24(hour, daypart, usedDian) {
  let hh = hour;
  const part = String(daypart || '').toLowerCase();
  const pm = part === '下午' || part === '下晝' || part === '晚上' || part === '夜晚' || part === 'pm';
  const am = part === '上午' || part === '上晝' || part === '凌晨' || part === '朝早' || part === 'am';
  if (pm && hh < 12) hh += 12;
  else if (am && hh === 12) hh = 0;
  else if (!part && usedDian && hh >= 1 && hh <= 6) hh += 12;
  if (hh < 0 || hh > 23) return null;
  return hh;
}

function findTime(text) {
  const re = /(上午|下午|上晝|下晝|晚上|凌晨|朝早|夜晚)?\s*(\d{1,2})(?::(\d{2}))?\s*(點半|點)?\s*(am|pm)?/gi;
  let match = re.exec(text);
  while (match) {
    const daypart = match[1] || match[5] || '';
    const hasMarker = !!(match[1] || match[3] || match[4] || match[5]);
    if (hasMarker) {
      const minute = match[4] === '點半' ? 30 : match[3] ? +match[3] : 0;
      const hour = to24(+match[2], daypart, !!match[4]);
      if (hour != null && minute >= 0 && minute <= 59) {
        return {
          index: match.index,
          length: match[0].length,
          time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        };
      }
    }
    match = re.exec(text);
  }
  return null;
}

export function parseQuick(input, now = new Date()) {
  let text = String(input || '').replace(/＠/g, '@').replace(/＃/g, '#').trim();
  const result = {
    title: '',
    contact: '',
    owner: '',
    categoryName: '',
    dueAt: null,
    dueTimeSet: false,
    nextFollowUp: null,
  };

  const owner = text.match(/(?:負責人|負責)[:：]\s*([^\s@#]+)/);
  if (owner) {
    result.owner = owner[1];
    text = text.replace(owner[0], ' ');
  }

  const follow = text.match(/跟進[:：]\s*(\S+)/);
  if (follow) {
    const date = parseDateToken(follow[1], now);
    if (date) {
      result.nextFollowUp = date;
      text = text.replace(follow[0], ' ');
    }
  }

  const contacts = [];
  text = text.replace(/@([^\s@#]+)/g, (_, name) => {
    contacts.push(name);
    return ' ';
  });
  result.contact = contacts.join('、');

  const category = text.match(/#([^\s@#]+)/);
  if (category) {
    result.categoryName = category[1];
    text = text.replace(category[0], ' ');
  }

  const dateMatch = text.match(DATE_RE);
  let dueDate = null;
  if (dateMatch) {
    dueDate = parseDateToken(dateMatch[1], now);
    if (dueDate) text = text.replace(dateMatch[0], ' ');
  }

  const timeMatch = findTime(text);
  let dueTime = null;
  if (timeMatch) {
    dueTime = timeMatch.time;
    text = `${text.slice(0, timeMatch.index)} ${text.slice(timeMatch.index + timeMatch.length)}`;
  }

  if (dueDate || dueTime) {
    const date = dueDate || hkDateString(now);
    result.dueAt = hkWallToISO(date, dueTime || '00:00');
    result.dueTimeSet = !!dueTime;
  }

  result.title = text.replace(/\s+/g, ' ').trim();
  if (!result.title) result.title = '（未命名）';
  return result;
}
