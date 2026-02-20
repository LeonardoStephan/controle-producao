const TIME_ZONE_BR = 'America/Sao_Paulo';

function getBrParts(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE_BR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = fmt.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getOffsetMinutesAt(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 0;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE_BR,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const tzName = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = tzName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return 0;

  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm);
}

function brLocalToUtcDate(year, month, day, hour = 0, minute = 0, second = 0) {
  // initial UTC guess
  let ts = Date.UTC(year, month - 1, day, hour, minute, second, 0);

  // converge offset for this local wall-clock time
  for (let i = 0; i < 3; i += 1) {
    const offsetMin = getOffsetMinutesAt(ts);
    const nextTs = Date.UTC(year, month - 1, day, hour, minute, second, 0) - offsetMin * 60 * 1000;
    if (nextTs === ts) break;
    ts = nextTs;
  }

  return new Date(ts);
}

function addOneDayYmd(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

function compareYmd(a, b) {
  const av = a.year * 10000 + a.month * 100 + a.day;
  const bv = b.year * 10000 + b.month * 100 + b.day;
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

module.exports = {
  TIME_ZONE_BR,
  getBrParts,
  brLocalToUtcDate,
  addOneDayYmd,
  compareYmd
};