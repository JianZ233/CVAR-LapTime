import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

import { redisCommand, redisIsConfigured } from './_redis.js';

type ResultCar = {
  number: string;
  driver: string;
  car: string;
  groupName: string;
  className: string;
  position: number;
  laps: number;
  bestLapNumber: number;
  bestLap: string;
  gap: string;
};

type ResultSnapshot = {
  eventName: string;
  trackName: string;
  trackLength: string;
  runName: string;
  sessionMode: 'race' | 'practice';
  flag: string;
  timeToGo: string;
  raceTime: string;
  initializedAt: string;
  updatedAt: string;
  cars: ResultCar[];
};

const EVENT_ID = 'canyon-classic-2026';
const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.027, 0.086, 0.125);
const BLUE = rgb(0.075, 0.2, 0.275);
const SKY = rgb(0.56, 0.79, 0.92);
const YELLOW = rgb(0.96, 0.79, 0.27);
const PAPER = rgb(0.975, 0.97, 0.94);
const INK = rgb(0.06, 0.1, 0.12);
const MUTED = rgb(0.36, 0.43, 0.47);
const LINE = rgb(0.78, 0.8, 0.79);

export async function GET(request: Request) {
  if (!redisIsConfigured()) {
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || EVENT_ID;
  const sessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (sessionId && !safeId(sessionId))) {
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const stored = await redisCommand([
      'GET',
      sessionId
        ? `cvar:event:${eventId}:session:${sessionId}:latest`
        : 'cvar:live',
    ]);
    if (typeof stored !== 'string') {
      return Response.json(
        { error: 'Result sheet data is not available' },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const snapshot = parseSnapshot(stored);
    if (!snapshot) {
      return Response.json(
        { error: 'Result sheet data is invalid' },
        { status: 502, headers: noStoreHeaders },
      );
    }

    const logo = await loadLogo(request.url);
    const pdf = await createResultSheet(snapshot, logo);
    const filename = `${slugify(formatSessionName(snapshot.runName)) || 'cvar-session'}-results.pdf`;

    const body = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unable to create result sheet', error);
    return Response.json(
      { error: 'Unable to create result sheet' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

export async function createResultSheet(
  snapshot: ResultSnapshot,
  logoBytes: Uint8Array | null,
) {
  const document = await PDFDocument.create();
  document.setTitle(`${formatSessionName(snapshot.runName)} results`);
  document.setAuthor('Corinthian Vintage Auto Racing');
  document.setSubject('Unofficial session result sheet');
  document.setCreator('CVAR Live Timing');

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const italic = await document.embedFont(StandardFonts.HelveticaOblique);
  const logo = logoBytes
    ? await document.embedPng(logoBytes).catch(() => null)
    : null;
  const cars = rankCars(snapshot.cars);
  const rowsPerPage = 28;
  const pageCount = Math.max(1, Math.ceil(cars.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.addPage(A4);
    const rows = cars.slice(
      pageIndex * rowsPerPage,
      (pageIndex + 1) * rowsPerPage,
    );
    drawPage({
      page,
      snapshot,
      rows,
      pageIndex,
      pageCount,
      regular,
      bold,
      italic,
      logo,
    });
  }

  return document.save();
}

function drawPage({
  page,
  snapshot,
  rows,
  pageIndex,
  pageCount,
  regular,
  bold,
  italic,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  rows: ResultCar[];
  pageIndex: number;
  pageCount: number;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  logo: PDFImage | null;
}) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({
    x: 0,
    y: height - 12,
    width,
    height: 12,
    color: YELLOW,
  });

  if (logo) {
    const fitted = logo.scale(0.31);
    page.drawImage(logo, {
      x: 28,
      y: height - 86,
      width: fitted.width,
      height: fitted.height,
    });
  } else {
    page.drawText('CVAR', {
      x: 30,
      y: height - 61,
      size: 24,
      font: bold,
      color: NAVY,
    });
  }

  drawRight(
    page,
    'OFFICIAL EVENT TIMING',
    width - 28,
    height - 43,
    7,
    bold,
    NAVY,
  );
  drawRight(page, 'RESULT SHEET', width - 28, height - 62, 18, bold, NAVY);
  drawRight(
    page,
    'SORTED ON BEST LAP',
    width - 28,
    height - 78,
    7.5,
    bold,
    MUTED,
  );

  const headerY = height - 177;
  page.drawRectangle({
    x: 28,
    y: headerY,
    width: width - 56,
    height: 78,
    color: NAVY,
  });
  page.drawRectangle({
    x: 28,
    y: headerY,
    width: 5,
    height: 78,
    color: YELLOW,
  });
  page.drawText(safeText(snapshot.eventName || 'Canyon Classic'), {
    x: 45,
    y: headerY + 54,
    size: 8,
    font: bold,
    color: SKY,
  });
  page.drawText(fitText(formatSessionName(snapshot.runName), bold, 18, 320), {
    x: 45,
    y: headerY + 29,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(sessionDescription(snapshot), {
    x: 45,
    y: headerY + 12,
    size: 7.5,
    font: italic,
    color: rgb(0.78, 0.84, 0.87),
  });
  drawRight(
    page,
    fitText(trackLine(snapshot), regular, 8.5, 180),
    width - 43,
    headerY + 47,
    8.5,
    regular,
    rgb(1, 1, 1),
  );
  drawRight(
    page,
    formatDate(snapshot.initializedAt || snapshot.updatedAt),
    width - 43,
    headerY + 28,
    8,
    regular,
    rgb(0.78, 0.84, 0.87),
  );
  drawCheckers(page, width - 91, headerY + 7);

  const columns = [
    { label: 'Pos', x: 34, width: 24, align: 'right' as const },
    { label: 'No.', x: 63, width: 31, align: 'left' as const },
    { label: 'Driver', x: 99, width: 98, align: 'left' as const },
    { label: 'Class', x: 202, width: 47, align: 'left' as const },
    { label: 'Vehicle', x: 254, width: 142, align: 'left' as const },
    { label: 'Laps', x: 401, width: 28, align: 'right' as const },
    { label: 'Best Tm', x: 434, width: 55, align: 'right' as const },
    { label: 'In Lap', x: 494, width: 34, align: 'right' as const },
    { label: 'Gap', x: 533, width: 34, align: 'right' as const },
  ];
  const tableTop = headerY - 17;
  page.drawRectangle({
    x: 28,
    y: tableTop - 2,
    width: width - 56,
    height: 18,
    color: BLUE,
  });
  for (const column of columns)
    drawCell(
      page,
      column.label,
      column.x,
      tableTop + 4,
      column.width,
      7,
      bold,
      rgb(1, 1, 1),
      column.align,
    );

  const rowHeight = 17;
  rows.forEach((car, index) => {
    const rowY = tableTop - 18 - index * rowHeight;
    if (index % 2 === 1)
      page.drawRectangle({
        x: 28,
        y: rowY - 3,
        width: width - 56,
        height: rowHeight,
        color: rgb(0.93, 0.93, 0.9),
      });
    const position = pageIndex * 28 + index + 1;
    const cells = [
      String(position),
      car.number || '—',
      car.driver || `Car ${car.number || position}`,
      car.className || car.groupName || '—',
      car.car || '—',
      String(car.laps || 0),
      car.bestLap || '—',
      car.bestLapNumber ? String(car.bestLapNumber) : '—',
      position === 1 ? '—' : car.gap || '—',
    ];
    columns.forEach((column, cellIndex) => {
      drawCell(
        page,
        cells[cellIndex],
        column.x,
        rowY + 2,
        column.width,
        7.2,
        cellIndex === 6 ? bold : regular,
        cellIndex === 6 && car.bestLap ? NAVY : INK,
        column.align,
      );
    });
    page.drawLine({
      start: { x: 28, y: rowY - 3 },
      end: { x: width - 28, y: rowY - 3 },
      thickness: 0.35,
      color: LINE,
    });
  });

  if (!rows.length) {
    page.drawText('No timed cars were recorded for this session.', {
      x: 38,
      y: tableTop - 50,
      size: 10,
      font: italic,
      color: MUTED,
    });
  }

  const noteY = 64;
  page.drawLine({
    start: { x: 28, y: noteY + 22 },
    end: { x: width - 28, y: noteY + 22 },
    thickness: 1.1,
    color: NAVY,
  });
  page.drawText('UNOFFICIAL RESULTS', {
    x: 28,
    y: noteY + 5,
    size: 7.5,
    font: bold,
    color: NAVY,
  });
  page.drawText('Results are final only after steward review.', {
    x: 126,
    y: noteY + 5,
    size: 7.5,
    font: regular,
    color: MUTED,
  });
  drawRight(
    page,
    `Page ${pageIndex + 1} of ${pageCount}`,
    width - 28,
    noteY + 5,
    7.5,
    bold,
    NAVY,
  );
  page.drawText('Corinthian Vintage Auto Racing', {
    x: 28,
    y: 32,
    size: 7,
    font: regular,
    color: MUTED,
  });
  drawRight(
    page,
    `Generated ${formatDateTime(snapshot.updatedAt)}`,
    width - 28,
    32,
    7,
    regular,
    MUTED,
  );
}

function drawCheckers(page: PDFPage, x: number, y: number) {
  const size = 6;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      page.drawRectangle({
        x: x + column * size,
        y: y + row * size,
        width: size,
        height: size,
        color: (row + column) % 2 === 0 ? rgb(1, 1, 1) : YELLOW,
      });
    }
  }
}

function drawCell(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  align: 'left' | 'right',
) {
  const text = fitText(safeText(value), font, size, width);
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: align === 'right' ? x + width - textWidth : x,
    y,
    size,
    font,
    color,
  });
}

function drawRight(
  page: PDFPage,
  value: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const text = safeText(value);
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function fitText(value: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let text = value;
  while (
    text.length > 1 &&
    font.widthOfTextAtSize(`${text}...`, size) > maxWidth
  )
    text = text.slice(0, -1);
  return `${text.trimEnd()}...`;
}

function rankCars(cars: ResultCar[]) {
  const ranked = [...cars].sort((left, right) => {
    const timeDifference =
      lapTimeToMilliseconds(left.bestLap) -
      lapTimeToMilliseconds(right.bestLap);
    return Number.isNaN(timeDifference)
      ? left.position - right.position
      : timeDifference || left.position - right.position;
  });
  const leaderTime = ranked.length
    ? lapTimeToMilliseconds(ranked[0].bestLap)
    : Number.POSITIVE_INFINITY;
  return ranked.map((car, index) => {
    const lapTime = lapTimeToMilliseconds(car.bestLap);
    return {
      ...car,
      position: index + 1,
      gap:
        index === 0 || !Number.isFinite(leaderTime) || !Number.isFinite(lapTime)
          ? ''
          : `+${((lapTime - leaderTime) / 1000).toFixed(3)}`,
    };
  });
}

function parseSnapshot(value: string): ResultSnapshot | null {
  try {
    const snapshot = JSON.parse(value) as Record<string, unknown>;
    if (typeof snapshot.runName !== 'string' || !Array.isArray(snapshot.cars))
      return null;
    return {
      eventName: stringValue(snapshot.eventName),
      trackName: stringValue(snapshot.trackName),
      trackLength: stringValue(snapshot.trackLength),
      runName: snapshot.runName,
      sessionMode: snapshot.sessionMode === 'race' ? 'race' : 'practice',
      flag: stringValue(snapshot.flag),
      timeToGo: stringValue(snapshot.timeToGo),
      raceTime: stringValue(snapshot.raceTime),
      initializedAt: stringValue(snapshot.initializedAt),
      updatedAt: stringValue(snapshot.updatedAt),
      cars: snapshot.cars
        .map(parseCar)
        .filter((car): car is ResultCar => Boolean(car)),
    };
  } catch {
    return null;
  }
}

function parseCar(value: unknown): ResultCar | null {
  if (!value || typeof value !== 'object') return null;
  const car = value as Record<string, unknown>;
  return {
    number: stringValue(car.number),
    driver: stringValue(car.driver),
    car: stringValue(car.car),
    groupName: stringValue(car.groupName),
    className: stringValue(car.className),
    position: numberValue(car.position),
    laps: numberValue(car.laps),
    bestLapNumber: numberValue(car.bestLapNumber),
    bestLap: stringValue(car.bestLap),
    gap: stringValue(car.gap),
  };
}

async function loadLogo(requestUrl: string) {
  try {
    const response = await fetch(new URL('/cvar-logo.png', requestUrl));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function sessionDescription(snapshot: ResultSnapshot) {
  const type = snapshot.sessionMode === 'race' ? 'Race' : 'Practice';
  const duration = snapshot.raceTime
    ? ` · ${shortTime(snapshot.raceTime)} elapsed`
    : snapshot.timeToGo
      ? ` · ${shortTime(snapshot.timeToGo)} scheduled`
      : '';
  return `${type}${duration} · ${snapshot.flag || 'Timing recorded'}`;
}

function trackLine(snapshot: ResultSnapshot) {
  const distance = snapshot.trackLength.split('·')[0]?.trim();
  return [snapshot.trackName, distance].filter(Boolean).join(' · ');
}

function formatSessionName(value: string) {
  const match = value.match(/^Gp([0-9,]+)-([^=]+)(?:=(.+))?$/i);
  if (!match) return safeText(value);
  const groups = match[1].split(',');
  const groupLabel =
    groups.length === 1
      ? `Group ${groups[0]}`
      : `Groups ${groups.slice(0, -1).join(', ')} & ${groups.at(-1)}`;
  const sessionLabel = (match[3] || match[2])
    .replace(/^TT(\d+)$/i, 'Test & Tune $1')
    .replace(/^R(\d+)$/i, 'Race $1')
    .replace(/^PQ$/i, 'Practice / Qualifying');
  return `${groupLabel} · ${sessionLabel}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    : '';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)
    : 'from saved timing data';
}

function lapTimeToMilliseconds(value: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parts = value.split(':');
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop() || 0);
  const hours = Number(parts.pop() || 0);
  return Number.isFinite(seconds) &&
    Number.isFinite(minutes) &&
    Number.isFinite(hours)
    ? ((hours * 60 + minutes) * 60 + seconds) * 1000
    : Number.POSITIVE_INFINITY;
}

function safeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[·•]/g, ' / ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, '');
}

function slugify(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function shortTime(value: string) {
  return value.replace(/^00:/, '');
}
function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
