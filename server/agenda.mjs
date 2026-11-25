export const DEFAULT_WEEKLY = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [
  String(day), day === 0 ? [] : [['09:00', '12:30'], ['14:00', '17:30']]
]));

const STUDIO_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function studioNow(now) {
  const parts = Object.fromEntries(STUDIO_CLOCK.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function isDate(date) {
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

export function isBookableDate(date, now) {
  if (!isDate(date) || date < now.date) return false;
  return (Date.parse(date) - Date.parse(now.date)) / 86400000 <= 366;
}

export function isTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMinutes(value) {
  if (value === '24:00') return 1440;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function toTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function durationMinutes(value) {
  if (Number.isInteger(value) && value >= 5 && value <= 720) return value;
  if (typeof value !== 'string') return null;
  const input = value.trim().toLowerCase();
  const clock = input.match(/^(\d{1,2}):(\d{2})$/);
  const hours = input.match(/^(\d{1,2})\s*h(?:oras?)?\s*(?:(\d{1,2})\s*(?:min(?:utos?)?)?)?$/);
  const decimal = input.match(/^(\d{1,2}[.,]\d{1,2})\s*h(?:oras?)?$/);
  const mins = input.match(/^(\d{1,3})\s*(?:m|min(?:utos?)?)?$/);
  let total = null;
  if (clock && Number(clock[2]) < 60) total = Number(clock[1]) * 60 + Number(clock[2]);
  if (hours && Number(hours[2] || 0) < 60) total = Number(hours[1]) * 60 + Number(hours[2] || 0);
  if (decimal) total = Math.round(Number(decimal[1].replace(',', '.')) * 60);
  if (mins) total = Number(mins[1]);
  return total >= 5 && total <= 720 ? total : null;
}

export function normalizeWindows(windows) {
  if (!Array.isArray(windows) || windows.length > 12) return null;
  if (windows.some(window => !Array.isArray(window) || window.length !== 2
    || !isTime(window[0]) || !(isTime(window[1]) || window[1] === '24:00') || window[0] >= window[1])) return null;
  const sorted = windows.map(window => [...window]).sort((left, right) => left[0].localeCompare(right[0]));
  return sorted.some((window, index) => index > 0 && sorted[index - 1][1] > window[0]) ? null : sorted;
}

export function effectiveWindows(date, weekly, exception) {
  return exception?.windows ?? weekly[String(new Date(`${date}T00:00:00Z`).getUTCDay())] ?? [];
}

export function dayStarts(windows) {
  return windows.flatMap(([start, end]) => {
    const starts = [];
    for (let minute = toMinutes(start); minute < toMinutes(end); minute += 60) starts.push(toTime(minute));
    return starts;
  });
}

export function occupies(appointment) {
  return !['recusado', 'cancelado'].includes(appointment.status);
}

function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && otherStart < end;
}

export function fitsSchedule(time, duration, windows, closed = []) {
  if (!isTime(time)) return false;
  const start = toMinutes(time);
  const end = start + duration;
  return windows.some(([from, to]) => start >= toMinutes(from) && end <= toMinutes(to))
    && !closed.some(value => isTime(value) && overlaps(start, end, toMinutes(value), toMinutes(value) + 60));
}

export function appointmentDuration(appointment, services) {
  const service = services.get(String(appointment.servicoId));
  return durationMinutes(appointment.duracaoMinutos) ?? durationMinutes(service?.legacyDurationMinutes)
    ?? durationMinutes(service?.duration) ?? 60;
}

export function freeSlots({ date, duration, weekly, exception, appointments, services, now, excludeIds }) {
  const windows = effectiveWindows(date, weekly, exception);
  const context = { date, duration, windows, exception, appointments, services, now, excludeIds };
  return dayStarts(windows).filter(time => isFreeAt(time, context));
}

export function isFreeAt(time, { date, duration, windows, exception, appointments, services, now, excludeIds = [] }) {
  if (!isBookableDate(date, now) || (date === now.date && time <= now.time)
    || !fitsSchedule(time, duration, windows, exception?.closed)) return false;
  const start = toMinutes(time);
  return !appointments.some(appointment => {
    if (excludeIds.includes(appointment.id) || !occupies(appointment) || !isTime(appointment.horario)) return false;
    const other = toMinutes(appointment.horario);
    return overlaps(start, start + duration, other, other + appointmentDuration(appointment, services));
  });
}
