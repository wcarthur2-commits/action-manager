import { t } from './i18n.js?v=v4';
import { hkDateString, hkParts } from './time.js?v=v4';

function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function fold(line) {
  const chars = [...line];
  if (chars.length <= 73) return line;
  const parts = [];
  parts.push(chars.slice(0, 73).join(''));
  for (let i = 73; i < chars.length; i += 72) parts.push(` ${chars.slice(i, i + 72).join('')}`);
  return parts.join('\r\n');
}

function stamp(date) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return iso;
}

function hkStamp(iso) {
  const p = hkParts(new Date(iso));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

function dateStamp(dateStr) {
  return dateStr.replace(/-/g, '');
}

function addDaysDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getUTCDate()).padStart(2, '0');
  return `${y2}${m2}${d2}`;
}

function descriptionOf(item) {
  const lines = [];
  if (item.contact) lines.push(t('ics.contact', { value: item.contact }));
  if (item.owner) lines.push(t('ics.owner', { value: item.owner }));
  if (item.waitingOn) lines.push(t('ics.waiting', { value: item.waitingOn }));
  if (item.issue) lines.push(t('ics.issue', { value: item.issue }));
  if (item.solution) lines.push(t('ics.solution', { value: item.solution }));
  if (item.notes) lines.push(item.notes);
  return lines.join('\n');
}

function eventBlock(item, { uid, summary, description, start, end, allDay, now }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART;TZID=Asia/Hong_Kong:${start}`,
  ];
  if (end) lines.push(allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND;TZID=Asia/Hong_Kong:${end}`);
  lines.push(`SUMMARY:${icsEscape(summary)}`);
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

function plusMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function toIcs(doc, now = new Date()) {
  const events = [];
  for (const item of doc.items || []) {
    if (!item || item.deletedAt) continue;
    const description = descriptionOf(item);
    const primary = item.startAt || item.dueAt;
    if (primary) {
      const timed = item.startAt ? item.startTimeSet : item.dueTimeSet;
      if (timed) {
        const endIso = item.startAt && item.dueAt && item.dueTimeSet && new Date(item.dueAt) > new Date(item.startAt)
          ? item.dueAt
          : plusMinutes(primary, 30);
        events.push(eventBlock(item, {
          uid: `${item.id}@action-manager`,
          summary: item.title || t('untitled'),
          description,
          start: hkStamp(primary),
          end: hkStamp(endIso),
          allDay: false,
          now,
        }));
      } else {
        const day = hkDateString(new Date(primary));
        events.push(eventBlock(item, {
          uid: `${item.id}@action-manager`,
          summary: item.title || t('untitled'),
          description,
          start: dateStamp(day),
          end: addDaysDate(day),
          allDay: true,
          now,
        }));
      }
    }
    if (item.nextFollowUp) {
      const primaryDay = primary ? hkDateString(new Date(primary)) : '';
      if (item.nextFollowUp !== primaryDay) {
        events.push(eventBlock(item, {
          uid: `${item.id}-follow@action-manager`,
          summary: t('ics.follow', { title: item.title || t('untitled') }),
          description,
          start: dateStamp(item.nextFollowUp),
          end: addDaysDate(item.nextFollowUp),
          allDay: true,
          now,
        }));
      }
    }
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Action Manager//EN-ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${t('ics.calendar')}`,
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Hong_Kong',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:HKT',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}
