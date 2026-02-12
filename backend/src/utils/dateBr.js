const { getBrParts } = require('./timeZoneBr');

function formatDateTimeBr(date, options = {}) {
  if (!date) return null;

  const dt = getBrParts(date);
  if (!dt) return null;

  const dd = String(dt.day).padStart(2, '0');
  const mm = String(dt.month).padStart(2, '0');
  const yyyy = dt.year;
  const hh = String(dt.hour).padStart(2, '0');
  const mi = String(dt.minute).padStart(2, '0');
  const ss = String(dt.second).padStart(2, '0');
  const sep = options.withDash ? ' - ' : ' ';

  return `${dd}/${mm}/${yyyy}${sep}${hh}:${mi}:${ss}`;
}

module.exports = { formatDateTimeBr };
