import { addHkDays, hkDateString, hkDow, hkWallToISO, padDate, validYmd } from './time.js';

const WEEKDAYS = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WEEKDAYS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const EN_MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEK_PATTERN = 'monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun';

const DATE_PATTERNS = [
  /大後日|後日|聽日|明天|今日|今天|下(?:週|星期|禮拜)[一二三四五六日天]|(?:星期|週|禮拜)[一二三四五六日天]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/,
  /\bday after tomorrow\b/i,
  /\btomorrow\b/i,
  /\btonight\b/i,
  /\btoday\b/i,
  /\bin\s+\d+\s+days?\b/i,
  new RegExp(`\\bnext\\s+(?:${WEEK_PATTERN})\\b`, 'i'),
  new RegExp(`\\b(?:${WEEK_PATTERN})\\b`, 'i'),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_PATTERN})(?:\\s+\\d{4})?\\b`, 'i'),
  new RegExp(`\\b(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, 'i'),
];

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
  const lower = text.toLowerCase();
  const relative = { 今日: 0, 今天: 0, 聽日: 1, 明天: 1, 後日: 2, 大後日: 3, today: 0, tonight: 0, tomorrow: 1, 'day after tomorrow': 2 };
  if (Object.prototype.hasOwnProperty.call(relative, text) || Object.prototype.hasOwnProperty.call(relative, lower)) {
    return addHkDays(today, relative[text] ?? relative[lower]);
  }

  let match = lower.match(/^in\s+(\d+)\s+days?$/);
  if (match) return addHkDays(today, Number(match[1]));

  match = lower.match(/^next\s+([a-z]+)$/);
  if (match && EN_WEEKDAYS[match[1]] != null) return dateOfWeek(today, EN_WEEKDAYS[match[1]], 'next');

  match = lower.match(/^([a-z]+)$/);
  if (match && EN_WEEKDAYS[match[1]] != null) return dateOfWeek(today, EN_WEEKDAYS[match[1]], 'upcoming');

  match = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (match && EN_MONTHS[match[2]]) {
    const year = match[3] ? Number(match[3]) : null;
    return year ? (validYmd(year, EN_MONTHS[match[2]], Number(match[1])) ? padDate(year, EN_MONTHS[match[2]], Number(match[1])) : null) : thisOrNextYear(EN_MONTHS[match[2]], Number(match[1]), today);
  }

  match = lower.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (match && EN_MONTHS[match[1]]) {
    const year = match[3] ? Number(match[3]) : null;
    return year ? (validYmd(year, EN_MONTHS[match[1]], Number(match[2])) ? padDate(year, EN_MONTHS[match[1]], Number(match[2])) : null) : thisOrNextYear(EN_MONTHS[match[1]], Number(match[2]), today);
  }

  match = text.match(/^下(?:週|星期|禮拜)([一二三四五六日天])$/);
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

function findDate(text, now) {
  const found = [];
  for (const re of DATE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const date = parseDateToken(match[0], now);
    if (!date) continue;
    found.push({
      index: match.index,
      length: match[0].length,
      raw: match[0],
      date,
      tonight: /^tonight$/i.test(match[0]),
    });
  }
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  return found[0] || null;
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

export function parseQuick(input, now = new Date(), lang = 'zh-Hant') {
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

  const owner = text.match(/(?:負責人|負責|owner)[:：]\s*([^\s@#]+)/i);
  if (owner) {
    result.owner = owner[1];
    text = text.replace(owner[0], ' ');
  }

  const follow = text.match(/(?:follow(?:\s*up)?|跟進)[:：]\s*/i);
  if (follow) {
    const rest = text.slice(follow.index + follow[0].length);
    const dated = findDate(rest, now);
    const token = rest.split(/\s+/)[0] || '';
    const date = dated && dated.index === 0 ? dated.date : parseDateToken(token, now);
    if (date) {
      result.nextFollowUp = date;
      const eaten = dated && dated.index === 0 ? dated.raw.length : token.length;
      text = `${text.slice(0, follow.index)} ${rest.slice(eaten)}`;
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

  const dateMatch = findDate(text, now);
  let dueDate = null;
  let tonight = false;
  if (dateMatch) {
    dueDate = dateMatch.date;
    tonight = dateMatch.tonight;
    text = `${text.slice(0, dateMatch.index)} ${text.slice(dateMatch.index + dateMatch.length)}`;
  }

  const timeMatch = findTime(text);
  let dueTime = null;
  if (timeMatch) {
    dueTime = timeMatch.time;
    text = `${text.slice(0, timeMatch.index)} ${text.slice(timeMatch.index + timeMatch.length)}`;
  } else if (tonight) {
    dueTime = '20:00';
  }

  if (dueDate || dueTime) {
    const date = dueDate || hkDateString(now);
    result.dueAt = hkWallToISO(date, dueTime || '00:00');
    result.dueTimeSet = !!dueTime;
  }

  result.title = text.replace(/\s+/g, ' ').trim();
  if (!result.title) result.title = lang === 'en' ? '(Untitled)' : '（未命名）';
  return result;
}
