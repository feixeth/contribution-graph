const COLORS = {
  0: '#eaedf0',
  1: '#c4b5fd',
  2: '#a78bfa',
  3: '#7c3aed',
  4: '#4c1d95',
};

const CELL_SIZE = 11;
const CELL_GAP = 2;
const CELL_PITCH = CELL_SIZE + CELL_GAP;
const LEFT_LABEL_WIDTH = 28;
const HEADER_HEIGHT = 18;
const TOP_LABEL_HEIGHT = 15;
const LEGEND_HEIGHT = 20;
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABEL_ROWS = { 0: 'Lun', 2: 'Mer', 4: 'Ven' };

function getLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getSunday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(d) {
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = [
    'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function buildWeeks(rangeStart, rangeEnd, dataMap) {
  const weeks = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = formatDate(cursor);
      week.push({ date: new Date(cursor), dateStr, count: dataMap[dateStr] || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSVG(dataMap, options = {}) {
  const { githubCount = 0, gitlabCount = 0, theme = 'light' } = options;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = getSunday(today);
  const rawStart = new Date(today);
  rawStart.setDate(rawStart.getDate() - 364);
  const rangeStart = getMonday(rawStart);

  const weeks = buildWeeks(rangeStart, rangeEnd, dataMap);
  const numWeeks = weeks.length;

  const width = LEFT_LABEL_WIDTH + numWeeks * CELL_PITCH + CELL_GAP;
  const height = HEADER_HEIGHT + TOP_LABEL_HEIGHT + 7 * CELL_PITCH + LEGEND_HEIGHT;

  const bgColor = theme === 'dark' ? '#0d1117' : 'transparent';
  const textColor = theme === 'dark' ? '#c9d1d9' : '#57606a';

  let total = 0;
  for (const week of weeks) for (const day of week) total += day.count;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT_FAMILY}">`;

  if (bgColor !== 'transparent') {
    svg += `<rect width="${width}" height="${height}" fill="${bgColor}" />`;
  }

  svg += `<text x="0" y="12" font-size="10" fill="${textColor}">GitHub: ${githubCount}  •  GitLab: ${gitlabCount}  •  Total: ${total} contributions (52 dernieres semaines)</text>`;

  let lastMonth = null;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth) {
      const x = LEFT_LABEL_WIDTH + i * CELL_PITCH;
      svg += `<text x="${x}" y="${HEADER_HEIGHT + 10}" font-size="9" fill="${textColor}">${MONTH_NAMES[month]}</text>`;
      lastMonth = month;
    }
  });

  for (let row = 0; row < 7; row++) {
    if (DAY_LABEL_ROWS[row]) {
      const y = HEADER_HEIGHT + TOP_LABEL_HEIGHT + row * CELL_PITCH + CELL_SIZE - 2;
      svg += `<text x="0" y="${y}" font-size="9" fill="${textColor}">${DAY_LABEL_ROWS[row]}</text>`;
    }
  }

  weeks.forEach((week, col) => {
    week.forEach((day, row) => {
      const x = LEFT_LABEL_WIDTH + col * CELL_PITCH;
      const y = HEADER_HEIGHT + TOP_LABEL_HEIGHT + row * CELL_PITCH;
      const color = COLORS[getLevel(day.count)];
      const label = day.count === 0
        ? `Aucune contribution — ${formatDisplayDate(day.date)}`
        : `${day.count} contribution${day.count > 1 ? 's' : ''} — ${formatDisplayDate(day.date)}`;
      svg += `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${color}"><title>${escapeXml(label)}</title></rect>`;
    });
  });

  const legendY = HEADER_HEIGHT + TOP_LABEL_HEIGHT + 7 * CELL_PITCH + 14;
  svg += `<text x="${LEFT_LABEL_WIDTH}" y="${legendY}" font-size="9" fill="${textColor}">Moins</text>`;
  let legendX = LEFT_LABEL_WIDTH + 34;
  for (let level = 0; level <= 4; level++) {
    svg += `<rect x="${legendX}" y="${legendY - 9}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${COLORS[level]}" />`;
    legendX += CELL_PITCH;
  }
  svg += `<text x="${legendX + 4}" y="${legendY}" font-size="9" fill="${textColor}">Plus</text>`;

  svg += '</svg>';
  return svg;
}

module.exports = { renderSVG, getLevel, COLORS };
