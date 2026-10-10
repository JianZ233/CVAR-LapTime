import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fontkit from '@pdf-lib/fontkit';
import {
  LineCapStyle,
  PDFDocument,
  TextRenderingMode,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

import { redisCommand, redisIsConfigured } from './_redis.js';
import { readAdjustments, type ResultAdjustment } from './_adjustments.js';
import {
  racePositionForCar,
  readRacePositions,
  snapshotUsesRacePositions,
} from './_race_positions.js';
import { applyCvarRacePoints } from '../lib/race-points.js';
import {
  deduplicateDriverEntries,
  formatSessionName as displaySessionName,
  raceGapAtLastLap,
  withRaceStatuses,
  type RaceStatus,
} from '../lib/timing.js';
import { CURRENT_EVENT_ID } from '../lib/events.js';

type ResultCar = {
  registrationKey: string;
  registrationNumber: string;
  number: string;
  driver: string;
  car: string;
  groupName: string;
  className: string;
  position: number;
  racePosition?: number;
  laps: number;
  bestLapNumber: number;
  totalTime: string;
  bestLap: string;
  gap: string;
  points: number | null;
  gapToPrevious?: string;
  gapToLeader?: string;
  adjustedBestLap?: string;
  resultAdjustment?: ResultAdjustment;
  raceStatus?: RaceStatus;
};

type LapPassing = {
  registrationKey: string;
  registrationNumber: string;
  number: string;
  driver: string;
  lapNumber: number;
  lapTime: string;
  lapTimeMs: number | null;
  totalTimeMs: number | null;
  recordedAt: string;
};

type ResultSnapshot = {
  eventName: string;
  trackName: string;
  trackLength: string;
  runName: string;
  sessionMode: 'race' | 'practice';
  flag: string;
  flagStartedAt: string;
  timeToGo: string;
  raceTime: string;
  initializedAt: string;
  updatedAt: string;
  groups: string[];
  cars: ResultCar[];
};

type ResultOrder = 'best-lap' | 'position';
type FontRole = keyof typeof FONT_FILES;
type Fonts = Record<FontRole, PDFFont>;
type Sheet = {
  document: PDFDocument;
  snapshot: ResultSnapshot;
  fonts: Fonts;
  logo: PDFImage | null;
  title: string;
  order: ResultOrder;
  cars: ResultCar[];
  passings: LapPassing[];
};
type Cursor = { page: PDFPage; y: number };
type Align = 'left' | 'right' | 'center';
type Column = {
  key: string;
  label: string[];
  x: number;
  width: number;
  align: Align;
};

const EVENT_ID = CURRENT_EVENT_ID;
const TRACK_TIME_ZONE = 'America/Chicago';

// US Letter, posted on notice boards at the track. Half-inch side margins
// keep everything printable on A4 at actual size, which is 17pt narrower.
const LETTER: [number, number] = [612, 792];
const LEFT = 36;
const RIGHT = 576;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 64;
const FIRST_HEADER_BOTTOM = 610;
const RUNNING_HEADER_BOTTOM = 712;

// Mostly black ink on white paper, with CVAR yellow as the only accent.
const INK = rgb(0.043, 0.051, 0.055);
const INK_2 = rgb(0.255, 0.278, 0.294);
const INK_3 = rgb(0.337, 0.361, 0.376);
const RULE = rgb(0.78, 0.79, 0.79);
const SHADE = rgb(0.953, 0.941, 0.91);
const WHITE = rgb(1, 1, 1);
const YELLOW = rgb(0.961, 0.769, 0);
const PODIUM_2 = rgb(0.71, 0.745, 0.769);
const PODIUM_3 = rgb(0.878, 0.69, 0.533);
const CHART_LINE = rgb(0.62, 0.63, 0.64);
const FLAG_COLORS: Record<string, Color> = {
  green: rgb(0.071, 0.533, 0.29),
  yellow: YELLOW,
  red: rgb(0.843, 0.149, 0.118),
  blue: rgb(0.114, 0.373, 0.847),
  white: WHITE,
  black: INK,
};

// Static cuts of the variable font the site uses; see assets/fonts/archivo.
const FONT_FILES = {
  display: 'Archivo-ExpandedExtraBold.ttf',
  label: 'Archivo-SemiExpandedBold.ttf',
  text: 'Archivo-Regular.ttf',
  textBold: 'Archivo-SemiBold.ttf',
  data: 'Archivo-NarrowMedium.ttf',
  dataBold: 'Archivo-NarrowExtraBold.ttf',
} as const;
// vercel.json ships the font folder with this function.
const FONT_DIRECTORIES = [
  fileURLToPath(new URL('../assets/fonts/archivo/', import.meta.url)),
  path.join(process.cwd(), 'assets/fonts/archivo'),
];
const CAP_HEIGHT = 0.686;
const FINISH_FLAGS = ['FINISH', 'FINISHED', 'CHECKERED', 'CHEQUERED'];
const STOPPED_STATUSES = ['DNF', 'DNS', 'DQ'];

const CLASSIFICATION_KICKER = 22;
const TABLE_HEAD = 20;
const MIN_ROW = 15.5;
const MAX_ROW = 21;
const BLOCK_GAP = 14;
const SIGN_OFF_HEIGHT = 64;
const SIGN_OFF_GAP = 24;
const LAPS_PER_LINE = 10;
const STATUS_STAMP = {
  title: 'Provisional',
  subtitle: 'Until reviewed by the stewards',
  filled: false,
};
const LAP_LINE = 20;
const LAP_CELLS_X = 172;
// A real lap takes well over this; a car tripping the loop twice comes
// through as a lap of a few hundredths of a second.
const MIN_LAP_MS = 10_000;

export async function GET(request: Request) {
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || EVENT_ID;
  const requestedSessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (requestedSessionId && !safeId(requestedSessionId))) {
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const liveSessionId = await redisCommand(['GET', 'cvar:live-session']);
    const sessionId = requestedSessionId || liveSessionId;
    if (typeof sessionId !== 'string' || !safeId(sessionId)) {
      return Response.json(
        { error: 'Result sheet data is not available' },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const sessionPrefix = `cvar:event:${eventId}:session:${sessionId}`;
    const [stored, passingIdValues, adjustments] = await Promise.all([
      redisCommand([
        'GET',
        requestedSessionId ? `${sessionPrefix}:latest` : 'cvar:live',
      ]),
      redisCommand(['ZRANGE', `${sessionPrefix}:passing-order`, 0, -1]),
      readAdjustments(eventId, sessionId),
    ]);
    if (typeof stored !== 'string') {
      return Response.json(
        { error: 'Result sheet data is not available' },
        { status: 404, headers: noStoreHeaders },
      );
    }
    const racePositions = snapshotUsesRacePositions(stored)
      ? await readRacePositions(sessionPrefix)
      : {};
    const snapshot = parseSnapshot(stored, racePositions);
    if (!snapshot)
      return Response.json(
        { error: 'Result sheet data is invalid' },
        { status: 502, headers: noStoreHeaders },
      );

    const passingIds = Array.isArray(passingIdValues)
      ? passingIdValues.map(String)
      : [];
    const passingValues = passingIds.length
      ? await redisCommand([
          'HMGET',
          `${sessionPrefix}:passings`,
          ...passingIds,
        ])
      : [];
    const pdf = await createResultSheet(
      snapshot,
      parsePassings(passingValues),
      await loadLogo(request.url),
      adjustments,
      sessionId !== liveSessionId,
    );
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
  passings: LapPassing[],
  logoBytes: Uint8Array | null,
  adjustments: Record<string, ResultAdjustment> = {},
  sessionOver = true,
) {
  const document = await PDFDocument.create();
  const title = sessionTitle(snapshot);
  document.setTitle(
    `${title} · Provisional results${snapshot.eventName ? ` · ${snapshot.eventName}` : ''}`,
    { showInWindowTitleBar: true },
  );
  document.setAuthor('Corinthian Vintage Auto Racing');
  document.setSubject('Provisional session results, subject to steward review');
  document.setKeywords(
    [snapshot.eventName, snapshot.trackName, title, 'CVAR results'].filter(
      Boolean,
    ),
  );
  document.setCreator('CVAR Live Timing');
  document.setLanguage('en-US');
  const fonts = await embedFonts(document);
  const logo = logoBytes
    ? await document.embedPng(logoBytes).catch(() => null)
    : null;
  const resultOrder = resultOrderForSession(
    snapshot.runName,
    snapshot.sessionMode,
  );
  const rankedCars = rankCars(
    deduplicateDriverEntries(snapshot.cars),
    adjustments,
    resultOrder,
  );
  const cars =
    resultOrder === 'position'
      ? applyCvarRacePoints(
          snapshot.runName,
          withRaceStatuses(rankedCars, snapshot, sessionOver),
        )
      : rankedCars;
  const selectedKeys = new Set(
    cars.map((car) => car.registrationKey || car.registrationNumber),
  );
  const selectedPassings = numberLaps(
    passings.filter((passing) =>
      selectedKeys.has(passing.registrationKey || passing.registrationNumber),
    ),
  );
  const sheet: Sheet = {
    document,
    snapshot,
    fonts,
    logo,
    title,
    order: resultOrder,
    cars,
    passings: selectedPassings,
  };

  drawClassification(sheet);
  let section = 1;
  let cursor: Cursor | null = null;
  if (cars.some((car) => car.resultAdjustment)) {
    section += 1;
    // Where each car would have finished without any steward decisions.
    const unadjusted = new Map(
      rankCars(deduplicateDriverEntries(snapshot.cars), {}, resultOrder).map(
        (car) => [carKey(car), car.position],
      ),
    );
    cursor = drawPenalties(sheet, sectionNumber(section), unadjusted);
  }
  section += 1;
  cursor = drawLapBreakdown(sheet, cursor, sectionNumber(section));
  section += 1;
  drawLapChart(sheet, cursor, sectionNumber(section));

  const pages = document.getPages();
  pages.forEach((page, index) =>
    drawFooter(page, sheet, index + 1, pages.length),
  );
  return document.save();
}

/* Classification ---------------------------------------------------------- */

function drawClassification(sheet: Sheet) {
  const { cars, fonts } = sheet;
  const columns = classificationColumns(sheet.order, cars, fonts);
  const summary = classificationSummary(sheet);
  const finalHeight =
    legendHeight(sheet) +
    BLOCK_GAP +
    summaryHeight(summary) +
    SIGN_OFF_GAP +
    SIGN_OFF_HEIGHT;
  const plan = planClassification(cars.length, finalHeight);
  const fastestKey = summary.fastest ? carKey(summary.fastest) : '';
  let start = 0;

  plan.pages.forEach((count, pageIndex) => {
    const page = sheet.document.addPage(LETTER);
    const last = pageIndex === plan.pages.length - 1;
    let y =
      pageIndex === 0
        ? drawFirstHeader(page, sheet)
        : drawRunningHeader(page, sheet);
    drawKicker(page, fonts, {
      y: y - 14,
      index: '01',
      label: pageIndex ? 'Classification, continued' : 'Classification',
      note: `${cars.length} ${cars.length === 1 ? 'entry' : 'entries'} · ${
        sheet.order === 'position'
          ? 'classified by finishing position'
          : 'classified by best lap time'
      }`,
    });
    y -= CLASSIFICATION_KICKER;
    y = drawTableHead(page, fonts, columns, y);
    cars.slice(start, start + count).forEach((car, index) =>
      drawClassificationRow(page, sheet, columns, car, {
        top: y - index * plan.rowHeight,
        height: plan.rowHeight,
        shaded: (start + index) % 2 === 1,
        fastest: carKey(car) === fastestKey,
      }),
    );
    y -= count * plan.rowHeight;
    rule(page, y, 0.6, INK);
    start += count;

    if (!cars.length)
      drawLabel(page, 'No timed cars were recorded for this session.', {
        x: LEFT,
        y: y - 22,
        size: 10,
        font: fonts.text,
        color: INK_2,
      });
    if (!last) {
      drawLabel(page, 'Classification continues on the next page', {
        x: RIGHT,
        y: y - 12,
        size: 6.5,
        font: fonts.text,
        color: INK_3,
        align: 'right',
      });
      return;
    }
    y = drawLegend(page, sheet, y - 12);
    drawSummary(page, sheet, summary, y - BLOCK_GAP);
    drawSignOff(page, sheet);
  });
}

function planClassification(rows: number, finalHeight: number) {
  const firstSpace =
    FIRST_HEADER_BOTTOM - CLASSIFICATION_KICKER - TABLE_HEAD - BOTTOM;
  const nextSpace =
    RUNNING_HEADER_BOTTOM - CLASSIFICATION_KICKER - TABLE_HEAD - BOTTOM;
  if (!rows) return { rowHeight: MAX_ROW, pages: [0] };
  const singlePageRow = (firstSpace - finalHeight) / rows;
  if (singlePageRow >= MIN_ROW)
    return { rowHeight: Math.min(MAX_ROW, singlePageRow), pages: [rows] };

  const pages: number[] = [];
  let remaining = rows;
  while (remaining > 0) {
    const space = pages.length ? nextSpace : firstSpace;
    const capacity = Math.floor(space / MIN_ROW);
    const withSummary = Math.floor((space - finalHeight) / MIN_ROW);
    if (remaining <= withSummary) {
      pages.push(remaining);
      remaining = 0;
    } else if (remaining <= capacity) {
      // The rows fit but the summary would not: carry a few rows over so
      // the summary and sign-off never sit on a page of their own.
      const carried = Math.min(remaining - 1, 3);
      pages.push(remaining - carried);
      remaining = carried;
      if (!carried) pages.push(0);
    } else {
      pages.push(capacity);
      remaining -= capacity;
    }
  }
  return { rowHeight: MIN_ROW, pages };
}

function classificationColumns(
  order: ResultOrder,
  cars: ResultCar[],
  fonts: Fonts,
): Column[] {
  const race = order === 'position';
  const extra = race ? 0 : 12;
  // Long class names ("ECR Big Bore") borrow width from the car column.
  const carWidth = 86 + extra;
  const classWidth = Math.min(
    48 + carWidth - 62,
    Math.max(
      48,
      ...cars.map(
        (car) =>
          measure(car.className.toUpperCase(), fonts.label, 5.6, 0.06) + 11,
      ),
    ),
  );
  const widths: Array<[string, string[], number, Align]> = [
    ['pos', ['Pos'], 30, 'left'],
    ['no', ['No.'], 28, 'center'],
    ['driver', ['Driver'], 116 + extra, 'left'],
    ['car', ['Car'], carWidth - (classWidth - 48), 'left'],
    ['class', ['Class'], classWidth, 'left'],
    ['laps', ['Laps'], 24, 'right'],
    ['total', ['Total'], 50, 'right'],
    ['best', ['Best lap'], 58, 'right'],
    ['ahead', ['Gap to', 'ahead'], 38, 'right'],
    ['leader', ['Gap to', race ? 'leader' : 'fastest'], 38, 'right'],
    ...(race
      ? [['points', ['Pts'], 24, 'right'] as [string, string[], number, Align]]
      : []),
  ];
  let x = LEFT;
  return widths.map(([key, label, width, align]) => {
    const column = { key, label, x, width, align };
    x += width;
    return column;
  });
}

function drawClassificationRow(
  page: PDFPage,
  sheet: Sheet,
  columns: Column[],
  car: ResultCar,
  row: { top: number; height: number; shaded: boolean; fastest: boolean },
) {
  const { fonts } = sheet;
  const middle = row.top - row.height / 2;
  const size = Math.min(9, 8.2 + (row.height - MIN_ROW) * 0.12);
  const baseline = middle - CAP_HEIGHT * size * 0.5;
  if (row.shaded)
    page.drawRectangle({
      x: LEFT,
      y: row.top - row.height,
      width: WIDTH,
      height: row.height,
      color: SHADE,
    });
  const column = (key: string) => columns.find((item) => item.key === key)!;

  drawPosition(page, fonts, car.position, column('pos').x + 3, middle, {
    size: Math.min(13, row.height - 4),
  });
  const number = column('no');
  drawCarNumber(page, fonts, car.number, number.x + number.width / 2, middle, {
    height: Math.min(13.5, row.height - 3.5),
  });

  const driver = column('driver');
  const tags = resultTags(car);
  const tagsWidth = tags.reduce(
    (width, tag) => width + measureTag(fonts, tag.label) + 4,
    0,
  );
  const nameWidth = drawLabel(
    page,
    car.driver || `Car ${car.number || car.position}`,
    {
      x: driver.x + 3,
      y: baseline,
      size,
      font: fonts.textBold,
      maxWidth: driver.width - 6 - tagsWidth,
      minSize: 6.6,
    },
  );
  let tagX = driver.x + 3 + nameWidth + 4;
  tags.forEach((tag) => {
    drawTag(page, fonts, tag.label, tagX, middle, { filled: tag.filled });
    tagX += measureTag(fonts, tag.label) + 4;
  });

  const carColumn = column('car');
  cellText(page, car.car, carColumn, baseline, {
    size: size - 0.9,
    font: fonts.text,
    color: INK_2,
    minSize: 6,
  });

  const classColumn = column('class');
  if (car.className)
    drawClassTag(page, fonts, car.className, classColumn.x + 3, middle, {
      maxWidth: classColumn.width - 6,
    });
  else cellText(page, '', classColumn, baseline, { size, font: fonts.data });

  cellText(page, String(car.laps || 0), column('laps'), baseline, {
    size,
    font: fonts.data,
  });
  cellText(page, car.totalTime, column('total'), baseline, {
    size,
    font: fonts.data,
  });

  const best = column('best');
  if (car.bestLap) {
    const right = best.x + best.width - 3;
    const lapLabel = car.bestLapNumber ? `L${car.bestLapNumber}` : '';
    const lapWidth = lapLabel
      ? drawLabel(page, lapLabel, {
          x: right,
          y: baseline,
          size: size - 2.3,
          font: fonts.data,
          color: INK_3,
          align: 'right',
        })
      : 0;
    const timeRight = right - (lapWidth ? lapWidth + 3 : 0);
    const timeWidth = drawLabel(page, car.bestLap, {
      x: timeRight,
      y: baseline,
      size,
      font: fonts.dataBold,
      align: 'right',
      maxWidth: best.width - 8 - lapWidth,
      minSize: 6.5,
    });
    if (row.fastest)
      drawFastestBox(page, timeRight - timeWidth, baseline, timeWidth, size);
  } else cellText(page, '', best, baseline, { size, font: fonts.data });

  cellText(page, car.gapToPrevious || '', column('ahead'), baseline, {
    size: size - 0.3,
    font: fonts.data,
    color: INK_2,
  });
  cellText(page, car.gapToLeader || '', column('leader'), baseline, {
    size: size - 0.3,
    font: fonts.data,
    color: INK_2,
  });
  if (sheet.order === 'position')
    cellText(page, formatPoints(car.points), column('points'), baseline, {
      size: size + 0.3,
      font: fonts.dataBold,
    });
}

type LegendItem = {
  width: number;
  draw: (page: PDFPage, x: number, baseline: number) => void;
};

/** Key to the marks used in the table, wrapped to the page width. */
function legendLines(sheet: Sheet) {
  const { fonts, cars } = sheet;
  const labelSize = 6.5;
  const item = (
    markWidth: number,
    mark: (page: PDFPage, x: number, middle: number, baseline: number) => void,
    label: string,
  ): LegendItem => ({
    width: markWidth + 4 + measure(label, fonts.text, labelSize),
    draw: (page, x, baseline) => {
      mark(page, x, baseline + CAP_HEIGHT * labelSize * 0.5, baseline);
      drawLabel(page, label, {
        x: x + markWidth + 4,
        y: baseline,
        size: labelSize,
        font: fonts.text,
        color: INK_2,
      });
    },
  });
  const items: LegendItem[] = [];
  if (cars.length)
    items.push(
      item(
        19,
        (page, x, middle) =>
          drawPosition(page, fonts, 1, x, middle, { size: 9 }),
        'Top three',
      ),
    );
  if (cars.some((car) => car.bestLap)) {
    const sample = '1:23.456';
    const width = measure(sample, fonts.dataBold, 6.8);
    items.push(
      item(
        width + 4,
        (page, x, _middle, baseline) => {
          drawLabel(page, sample, {
            x: x + 2,
            y: baseline,
            size: 6.8,
            font: fonts.dataBold,
          });
          drawFastestBox(page, x + 2, baseline, width, 6.8);
        },
        'Fastest lap of the session',
      ),
      item(
        measure('L7', fonts.data, 6),
        (page, x, _middle, baseline) =>
          drawLabel(page, 'L7', {
            x,
            y: baseline,
            size: 6,
            font: fonts.data,
            color: INK_3,
          }),
        'Lap the best time was set on',
      ),
    );
  }
  const used = new Set(
    cars.flatMap((car) =>
      resultTags(car).map((tag) => tag.label.split(' ')[0]),
    ),
  );
  [
    ['PEN', 'Time penalty'],
    ['DNF', 'Did not finish'],
    ['DNS', 'Did not start'],
    ['DQ', 'Disqualified'],
  ].forEach(([code, label]) => {
    if (used.has(code))
      items.push(
        item(
          measureTag(fonts, code),
          (page, x, middle) =>
            drawTag(page, fonts, code, x, middle, { filled: code !== 'PEN' }),
          label,
        ),
      );
  });
  const lines: LegendItem[][] = [];
  let width = 0;
  items.forEach((entry) => {
    if (!lines.length || width + entry.width > WIDTH) {
      lines.push([]);
      width = 0;
    }
    lines.at(-1)!.push(entry);
    width += entry.width + 14;
  });
  return lines;
}

function legendHeight(sheet: Sheet) {
  return 10 + legendLines(sheet).length * 11;
}

function drawLegend(page: PDFPage, sheet: Sheet, y: number) {
  legendLines(sheet).forEach((line, index) => {
    let x = LEFT;
    line.forEach((entry) => {
      entry.draw(page, x, y - 9 - index * 11);
      x += entry.width + 14;
    });
  });
  return y - legendHeight(sheet);
}

type Summary = ReturnType<typeof classificationSummary>;

function classificationSummary(sheet: Sheet) {
  const { cars } = sheet;
  // Best-lap sessions are ranked on the adjusted lap, so the fastest lap is
  // too; in races a time penalty applies to race time, not to the lap.
  const lapFor = (car: ResultCar) =>
    sheet.order === 'best-lap'
      ? adjustedLapMilliseconds(car)
      : lapTimeToMilliseconds(car.bestLap);
  const fastest = cars.reduce<ResultCar | null>((best, car) => {
    if (['DQ', 'DNS'].includes(car.resultAdjustment?.status || '')) return best;
    const time = lapFor(car);
    if (!Number.isFinite(time)) return best;
    return !best || time < lapFor(best) ? car : best;
  }, null);
  const winners = new Map<string, ResultCar>();
  cars.forEach((car) => {
    const className = car.className.trim();
    if (!className || winners.has(className) || !classified(car)) return;
    winners.set(className, car);
  });
  return {
    fastest,
    starters: cars.filter(started).length,
    entries: cars.length,
    winners: [...winners.entries()],
  };
}

function summaryHeight(summary: Summary) {
  return Math.max(58, 26 + Math.ceil(summary.winners.length / 2) * 10.5);
}

function drawSummary(
  page: PDFPage,
  sheet: Sheet,
  summary: Summary,
  top: number,
) {
  const { fonts } = sheet;
  const height = summaryHeight(summary);
  rule(page, top, 1.2, INK);
  [186, 296].forEach((x) =>
    page.drawLine({
      start: { x, y: top - 6 },
      end: { x, y: top - height + 2 },
      thickness: 0.4,
      color: RULE,
    }),
  );

  drawEyebrow(page, fonts, 'Fastest lap', LEFT, top - 12);
  if (summary.fastest) {
    const car = summary.fastest;
    drawLabel(page, car.bestLap, {
      x: LEFT,
      y: top - 33,
      size: 19,
      font: fonts.dataBold,
    });
    drawLabel(page, `#${car.number || '–'} ${car.driver}`, {
      x: LEFT,
      y: top - 44,
      size: 7.6,
      font: fonts.textBold,
      maxWidth: 140,
      minSize: 6.4,
    });
    drawLabel(page, car.bestLapNumber ? `on lap ${car.bestLapNumber}` : '', {
      x: LEFT,
      y: top - 53.5,
      size: 7,
      font: fonts.text,
      color: INK_2,
    });
  } else
    drawLabel(page, 'No timed laps', {
      x: LEFT,
      y: top - 30,
      size: 8,
      font: fonts.text,
      color: INK_2,
    });

  drawEyebrow(page, fonts, 'Starters', 196, top - 12);
  const startersWidth = drawLabel(page, String(summary.starters), {
    x: 196,
    y: top - 39,
    size: 28,
    font: fonts.display,
    outline: 0.85,
  });
  drawLabel(page, `of ${summary.entries}`, {
    x: 196 + startersWidth + 5,
    y: top - 30,
    size: 7.6,
    font: fonts.textBold,
  });
  drawLabel(page, 'entered', {
    x: 196 + startersWidth + 5,
    y: top - 39,
    size: 7.6,
    font: fonts.text,
    color: INK_2,
  });

  drawEyebrow(
    page,
    fonts,
    sheet.order === 'position' ? 'Class winners' : 'Fastest in class',
    306,
    top - 12,
  );
  if (!summary.winners.length)
    drawLabel(page, 'No classified finishers', {
      x: 306,
      y: top - 26,
      size: 7.5,
      font: fonts.text,
      color: INK_2,
    });
  const perColumn = Math.ceil(summary.winners.length / 2);
  summary.winners.forEach(([className, car], index) => {
    const x = 306 + Math.floor(index / perColumn) * 136;
    const baseline = top - 26 - (index % perColumn) * 10.5;
    const middle = baseline + CAP_HEIGHT * 3.6;
    const tagWidth = drawClassTag(page, fonts, className, x, middle, {
      maxWidth: 64,
      size: 5.2,
    });
    drawLabel(page, `#${car.number || '–'} ${car.driver}`, {
      x: x + tagWidth + 4,
      y: baseline,
      size: 7.2,
      font: fonts.textBold,
      maxWidth: 128 - tagWidth - 4,
      minSize: 6,
    });
  });
}

function drawSignOff(page: PDFPage, sheet: Sheet) {
  const { fonts } = sheet;
  const y = BOTTOM;
  page.drawRectangle({
    x: LEFT,
    y,
    width: WIDTH,
    height: SIGN_OFF_HEIGHT,
    borderColor: INK,
    borderWidth: 1,
  });
  drawStamp(page, fonts, LEFT + 10, y + 12, 172, 40, {
    title: 'Provisional',
    subtitle: 'Results',
    filled: true,
  });
  wrapText(
    `These results are provisional until a steward has reviewed them and initialled this sheet. ${
      sheet.cars.some((car) => car.resultAdjustment)
        ? 'Steward decisions are listed under Penalties.'
        : 'No steward decisions have been recorded.'
    }`,
    fonts.text,
    7.2,
    150,
  ).forEach((line, index) =>
    drawLabel(page, line, {
      x: 230,
      y: y + 42 - index * 9.6,
      size: 7.2,
      font: fonts.text,
      color: INK_2,
    }),
  );
  const fields = [
    { label: 'Posted at', y: y + 38 },
    { label: "Steward's initials", y: y + 14 },
  ];
  const lineStart =
    396 +
    Math.max(
      ...fields.map((field) =>
        measure(field.label.toUpperCase(), fonts.label, 6.2, 0.12),
      ),
    ) +
    10;
  fields.forEach((field) => {
    drawEyebrow(page, fonts, field.label, 396, field.y);
    page.drawLine({
      start: { x: lineStart, y: field.y - 2 },
      end: { x: RIGHT - 10, y: field.y - 2 },
      thickness: 0.8,
      color: INK,
    });
  });
}

/* Penalties --------------------------------------------------------------- */

function drawPenalties(
  sheet: Sheet,
  index: string,
  unadjusted: Map<string, number>,
) {
  const { fonts } = sheet;
  const rows = sheet.cars.filter((car) => Boolean(car.resultAdjustment));
  const columns: Column[] = [
    { key: 'no', label: ['No.'], x: LEFT, width: 30, align: 'center' },
    {
      key: 'driver',
      label: ['Driver'],
      x: LEFT + 30,
      width: 112,
      align: 'left',
    },
    {
      key: 'decision',
      label: ['Decision'],
      x: LEFT + 142,
      width: 80,
      align: 'left',
    },
    {
      key: 'penalty',
      label: ['Penalty'],
      x: LEFT + 222,
      width: 48,
      align: 'right',
    },
    {
      key: 'position',
      label: ['Position', 'before → after'],
      x: LEFT + 276,
      width: 66,
      align: 'left',
    },
    {
      key: 'best',
      label: ['Best lap', 'before → after'],
      x: LEFT + 342,
      width: 62,
      align: 'left',
    },
    {
      key: 'note',
      label: ["Steward's note"],
      x: LEFT + 404,
      width: 136,
      align: 'left',
    },
  ];
  const note = columns[6];
  let cursor = newPage(sheet);
  const heading = {
    index,
    title: 'Penalties',
    note: 'Steward decisions applied to this classification, with each car’s position before and after them.',
  };
  cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, heading);
  cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);

  rows.forEach((car, rowIndex) => {
    const adjustment = car.resultAdjustment!;
    const noteLines = wrapText(
      adjustment.note || defaultAdjustmentNote(adjustment),
      fonts.text,
      7.2,
      note.width - 6,
    );
    const decisions = decisionLines(adjustment);
    const driver = columns[1];
    const names = wrapLines(
      car.driver || `Car ${car.number || '–'}`,
      fonts.textBold,
      8.4,
      driver.width - 6,
      2,
    );
    const details = wrapLines(
      [car.className && `Class ${car.className}`, car.car]
        .filter(Boolean)
        .join(' · '),
      fonts.text,
      6.6,
      driver.width - 6,
      2,
    );
    const height = Math.max(
      30,
      10 +
        Math.max(
          noteLines.length,
          decisions.length * 1.25,
          names.length + details.length,
        ) *
          9.4,
    );
    if (cursor.y - height < BOTTOM) {
      cursor = newPage(sheet);
      cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, {
        ...heading,
        continued: true,
      });
      cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);
    }
    const { page } = cursor;
    const top = cursor.y;
    const baseline = top - 12;
    if (rowIndex % 2 === 1)
      page.drawRectangle({
        x: LEFT,
        y: top - height,
        width: WIDTH,
        height,
        color: SHADE,
      });
    drawCarNumber(page, fonts, car.number, LEFT + 15, baseline + 3, {
      height: 14,
    });
    names.forEach((line, lineIndex) =>
      drawLabel(page, line, {
        x: driver.x + 3,
        y: baseline - lineIndex * 9.4,
        size: 8.4,
        font: fonts.textBold,
        maxWidth: driver.width - 6,
      }),
    );
    details.forEach((line, lineIndex) =>
      drawLabel(page, line, {
        x: driver.x + 3,
        y: baseline - (names.length + lineIndex) * 9.4,
        size: 6.6,
        font: fonts.text,
        color: INK_3,
        maxWidth: driver.width - 6,
      }),
    );

    const decision = columns[2];
    decisions.forEach((line, lineIndex) => {
      const lineBaseline = baseline - lineIndex * 11.5;
      const tagWidth = drawTag(
        page,
        fonts,
        line.tag,
        decision.x + 3,
        lineBaseline + CAP_HEIGHT * 4,
        { filled: line.filled },
      );
      drawLabel(page, line.label, {
        x: decision.x + 3 + tagWidth + 4,
        y: lineBaseline,
        size: 7.2,
        font: fonts.text,
        maxWidth: decision.width - tagWidth - 10,
        minSize: 6,
      });
    });

    cellText(
      page,
      adjustment.penaltySeconds > 0
        ? `+${adjustment.penaltySeconds.toFixed(3)} s`
        : '',
      columns[3],
      baseline,
      { size: 8.4, font: fonts.dataBold },
    );

    const before = unadjusted.get(carKey(car));
    const position = columns[4];
    drawLabel(
      page,
      before && before !== car.position
        ? `P${before} → P${car.position}`
        : `P${car.position}`,
      { x: position.x + 3, y: baseline, size: 8.4, font: fonts.dataBold },
    );
    drawLabel(
      page,
      adjustment.positionOverride
        ? 'set by steward'
        : before && before !== car.position
          ? `${before < car.position ? 'down' : 'up'} ${Math.abs(before - car.position)}`
          : 'no change',
      {
        x: position.x + 3,
        y: baseline - 9.4,
        size: 6.6,
        font: fonts.text,
        color: INK_3,
      },
    );

    const best = columns[5];
    drawLabel(page, car.bestLap || '–', {
      x: best.x + 3,
      y: baseline,
      size: 8.4,
      font: fonts.data,
      color: car.bestLap ? INK : INK_3,
    });
    const after = STOPPED_STATUSES.includes(adjustment.status)
      ? adjustment.status
      : car.adjustedBestLap;
    if (after)
      drawLabel(page, `→ ${after}`, {
        x: best.x + 3,
        y: baseline - 9.4,
        size: 8.4,
        font: fonts.dataBold,
      });

    noteLines.forEach((line, lineIndex) =>
      drawLabel(page, line, {
        x: note.x + 3,
        y: baseline - lineIndex * 9.4,
        size: 7.2,
        font: fonts.text,
        color: INK_2,
      }),
    );
    cursor.y -= height;
    rule(page, cursor.y, 0.3, RULE);
  });
  rule(cursor.page, cursor.y, 0.6, INK);
  cursor.y -= BLOCK_GAP;
  return cursor;
}

function decisionLines(adjustment: ResultAdjustment) {
  const lines: Array<{ tag: string; label: string; filled: boolean }> = [];
  if (adjustment.status === 'DQ')
    lines.push({ tag: 'DQ', label: 'Disqualified', filled: true });
  if (adjustment.status === 'DNS')
    lines.push({ tag: 'DNS', label: 'Did not start', filled: true });
  if (adjustment.status === 'DNF')
    lines.push({ tag: 'DNF', label: 'Did not finish', filled: true });
  if (adjustment.penaltySeconds > 0 || adjustment.status === 'PENALTY')
    lines.push({
      tag: 'PEN',
      label: adjustment.penaltySeconds > 0 ? 'Time penalty' : 'Penalty',
      filled: false,
    });
  if (adjustment.positionOverride)
    lines.push({
      tag: `P${adjustment.positionOverride}`,
      label: 'Position set',
      filled: false,
    });
  if (!lines.length)
    lines.push({ tag: 'NOTE', label: 'Steward note', filled: false });
  return lines;
}

/* Lap breakdown ----------------------------------------------------------- */

function drawLapBreakdown(sheet: Sheet, cursor: Cursor | null, index: string) {
  const { fonts, cars, passings } = sheet;
  const lapsByCar = new Map<string, LapPassing[]>();
  passings.forEach((passing) => {
    const key = passing.registrationKey || passing.registrationNumber;
    lapsByCar.set(key, [...(lapsByCar.get(key) || []), passing]);
  });
  const timed = cars.filter((car) => lapsByCar.has(carKey(car)));
  const untimed = cars.filter((car) => !lapsByCar.has(carKey(car)));
  const blocks = timed.map((car) => {
    const laps = [...(lapsByCar.get(carKey(car)) || [])].sort(
      (left, right) =>
        left.lapNumber - right.lapNumber ||
        Date.parse(left.recordedAt) - Date.parse(right.recordedAt),
    );
    const times = laps.map(lapMilliseconds);
    const best = Math.min(...times.filter(Number.isFinite));
    return {
      car,
      laps,
      best,
      bestLap: laps[times.indexOf(best)],
      lines: Math.max(1, Math.ceil(laps.length / LAPS_PER_LINE)),
    };
  });
  const fastest = classificationSummary(sheet).fastest;
  const fastestKey = fastest ? carKey(fastest) : '';
  const heading = {
    index,
    title: 'Lap breakdown',
    note: 'Every timed lap. Bold marks each driver’s best lap; a box marks the fastest lap of the session. The small figures under each time are the time of day (CT).',
  };
  const columns: Column[] = [
    { key: 'no', label: ['No.'], x: LEFT, width: 28, align: 'center' },
    {
      key: 'driver',
      label: ['Driver'],
      x: LEFT + 28,
      width: 94,
      align: 'left',
    },
    { key: 'best', label: ['Best'], x: LEFT + 122, width: 46, align: 'right' },
    {
      key: 'laps',
      label: ['Lap number and lap time'],
      x: LEFT + LAP_CELLS_X,
      width: WIDTH - LAP_CELLS_X,
      align: 'left',
    },
  ];
  const firstBlock = blocks[0] ? blocks[0].lines * LAP_LINE + 4 : 40;
  cursor = startSection(sheet, cursor, 60 + TABLE_HEAD + firstBlock);
  cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, heading);
  if (!passings.length) {
    drawLabel(cursor.page, 'No lap passings were recorded for this session.', {
      x: LEFT,
      y: cursor.y - 14,
      size: 9,
      font: fonts.text,
      color: INK_2,
    });
    cursor.y -= 26 + BLOCK_GAP;
    return cursor;
  }
  cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);
  const cellWidth = (WIDTH - LAP_CELLS_X) / LAPS_PER_LINE;

  blocks.forEach((block, blockIndex) => {
    const height = block.lines * LAP_LINE + 4;
    if (cursor!.y - height < BOTTOM) {
      cursor = newPage(sheet);
      cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, {
        ...heading,
        continued: true,
      });
      cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);
    }
    const { page } = cursor!;
    const top = cursor!.y;
    const baseline = top - 11.5;
    if (blockIndex % 2 === 1)
      page.drawRectangle({
        x: LEFT,
        y: top - height,
        width: WIDTH,
        height,
        color: SHADE,
      });
    drawCarNumber(page, fonts, block.car.number, LEFT + 14, top - 10, {
      height: 13,
    });
    drawLabel(page, block.car.driver || `Car ${block.car.number || '–'}`, {
      x: LEFT + 31,
      y: baseline,
      size: 7.8,
      font: fonts.textBold,
      maxWidth: 89,
      minSize: 6.2,
    });
    drawLabel(
      page,
      [
        block.car.className,
        `${block.laps.length} ${block.laps.length === 1 ? 'lap' : 'laps'}`,
      ]
        .filter(Boolean)
        .join(' · '),
      {
        x: LEFT + 31,
        y: baseline - 8.5,
        size: 6.2,
        font: fonts.text,
        color: INK_3,
        maxWidth: 89,
      },
    );
    if (block.bestLap) {
      drawLabel(
        page,
        block.bestLap.lapTime || millisecondsToLapTime(block.best),
        {
          x: LEFT + 165,
          y: baseline,
          size: 8,
          font: fonts.dataBold,
          align: 'right',
        },
      );
      drawLabel(page, `lap ${block.bestLap.lapNumber}`, {
        x: LEFT + 165,
        y: baseline - 8.5,
        size: 6.2,
        font: fonts.text,
        color: INK_3,
        align: 'right',
      });
    }
    block.laps.forEach((lap, lapIndex) => {
      const line = Math.floor(lapIndex / LAPS_PER_LINE);
      const x = LEFT + LAP_CELLS_X + (lapIndex % LAPS_PER_LINE) * cellWidth;
      const lineBaseline = baseline - line * LAP_LINE;
      const time = lapMilliseconds(lap);
      const personalBest = time === block.best;
      if (lapIndex % LAPS_PER_LINE)
        page.drawLine({
          start: { x, y: lineBaseline + 8 },
          end: { x, y: lineBaseline - 9 },
          thickness: 0.3,
          color: RULE,
        });
      drawLabel(page, String(lap.lapNumber || '–'), {
        x: x + 2.5,
        y: lineBaseline,
        size: 5.3,
        font: fonts.data,
        color: INK_3,
      });
      const right = x + cellWidth - 3;
      const width = drawLabel(page, lap.lapTime || '–', {
        x: right,
        y: lineBaseline,
        size: 7.6,
        font: personalBest ? fonts.dataBold : fonts.data,
        align: 'right',
        maxWidth: cellWidth - 13,
        minSize: 6,
      });
      if (personalBest && carKey(block.car) === fastestKey)
        drawFastestBox(page, right - width, lineBaseline, width, 7.6);
      drawLabel(page, formatTimeOfDay(lap.recordedAt), {
        x: right,
        y: lineBaseline - 8,
        size: 5.4,
        font: fonts.data,
        color: INK_3,
        align: 'right',
      });
    });
    cursor!.y -= height;
  });
  rule(cursor.page, cursor.y, 0.6, INK);
  if (untimed.length) {
    const lines = wrapText(
      untimed
        .map((car) => `#${car.number || '–'} ${car.driver || 'Unknown driver'}`)
        .join('  ·  '),
      fonts.text,
      7.2,
      WIDTH - 110,
    );
    if (cursor.y - 12 - lines.length * 9.6 < BOTTOM) cursor = newPage(sheet);
    drawEyebrow(cursor.page, fonts, 'No laps recorded', LEFT, cursor.y - 12);
    lines.forEach((line, lineIndex) =>
      drawLabel(cursor!.page, line, {
        x: LEFT + 110,
        y: cursor!.y - 12 - lineIndex * 9.6,
        size: 7.2,
        font: fonts.text,
        color: INK_2,
      }),
    );
    cursor.y -= 12 + lines.length * 9.6;
  }
  cursor.y -= BLOCK_GAP;
  return cursor;
}

/* Lap chart --------------------------------------------------------------- */

function drawLapChart(sheet: Sheet, cursor: Cursor, index: string) {
  const { fonts, cars, passings } = sheet;
  const maxLap = passings.reduce(
    (maximum, passing) => Math.max(maximum, passing.lapNumber),
    0,
  );
  const laps = Array.from({ length: maxLap }, (_, lap) => lap + 1);
  const orders = new Map(laps.map((lap) => [lap, orderAtLap(passings, lap)]));
  const rows = Math.max(
    0,
    ...[...orders.values()].map((order) => order.length),
  );
  const podium = new Map(
    cars
      .filter((car) => car.laps > 0)
      .slice(0, 3)
      .map((car, place) => [carKey(car), place]),
  );
  const showGraph = sheet.order === 'position' && maxLap >= 2 && rows >= 2;
  const heading = {
    index,
    title: 'Lap chart',
    note:
      sheet.order === 'position'
        ? 'Running order at the end of each lap. Each line follows one car; the top three finishers are drawn in black.'
        : 'The order in which cars completed each lap, by elapsed time.',
  };
  const graphHeight = Math.min(300, Math.max(110, (rows - 1) * 9.5));
  const tableRow = rows > 30 ? 9.6 : 11;
  const firstNeed = showGraph
    ? graphHeight + 48
    : TABLE_HEAD + Math.min(rows, 6) * tableRow;
  cursor = startSection(sheet, cursor, 60 + firstNeed);
  cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, heading);
  if (!passings.length) {
    drawLabel(cursor.page, 'No lap positions were recorded for this session.', {
      x: LEFT,
      y: cursor.y - 14,
      size: 9,
      font: fonts.text,
      color: INK_2,
    });
    return;
  }
  const numberFor = (passing: LapPassing) =>
    cars.find((car) => carKey(car) === passingKey(passing))?.number ||
    passing.number;

  if (showGraph) {
    cursor.y = drawPositionGraph(cursor.page, sheet, {
      top: cursor.y - 4,
      height: graphHeight,
      laps,
      orders,
      rows,
      podium,
      numberFor,
    });
    cursor.y -= 6;
  }

  const chunks = Math.ceil(maxLap / 20);
  const perChunk = Math.ceil(maxLap / chunks);
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const chunkLaps = laps.slice(chunk * perChunk, (chunk + 1) * perChunk);
    const cellWidth = Math.min(40, (WIDTH - 28) / perChunk);
    const columns: Column[] = [
      { key: 'pos', label: ['Pos'], x: LEFT, width: 28, align: 'left' },
      ...chunkLaps.map((lap, lapIndex) => ({
        key: String(lap),
        label: [lapIndex ? String(lap) : `Lap ${lap}`],
        x: LEFT + 28 + lapIndex * cellWidth,
        width: cellWidth,
        align: 'center' as const,
      })),
    ];
    if (cursor.y - TABLE_HEAD - Math.min(rows, 5) * tableRow < BOTTOM) {
      cursor = newPage(sheet);
      cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, {
        ...heading,
        continued: true,
      });
    }
    cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);
    for (let row = 0; row < rows; row += 1) {
      if (cursor.y - tableRow < BOTTOM) {
        rule(cursor.page, cursor.y, 0.6, INK);
        cursor = newPage(sheet);
        cursor.y = drawSectionHeading(cursor.page, fonts, cursor.y, {
          ...heading,
          continued: true,
        });
        cursor.y = drawTableHead(cursor.page, fonts, columns, cursor.y);
      }
      const { page } = cursor;
      const baseline = cursor.y - tableRow / 2 - CAP_HEIGHT * 3.4;
      if (row % 2 === 1)
        page.drawRectangle({
          x: LEFT,
          y: cursor.y - tableRow,
          width: WIDTH,
          height: tableRow,
          color: SHADE,
        });
      drawLabel(page, `P${row + 1}`, {
        x: LEFT + 3,
        y: baseline,
        size: 6.8,
        font: fonts.dataBold,
        color: INK_2,
      });
      chunkLaps.forEach((lap, lapIndex) => {
        const passing = orders.get(lap)?.[row];
        if (!passing) return;
        const column = columns[lapIndex + 1];
        drawLabel(page, numberFor(passing), {
          x: column.x + column.width / 2,
          y: baseline,
          size: 6.8,
          font: podium.has(passingKey(passing)) ? fonts.dataBold : fonts.data,
          align: 'center',
          maxWidth: column.width - 2,
          minSize: 5,
        });
      });
      cursor.y -= tableRow;
    }
    rule(cursor.page, cursor.y, 0.6, INK);
    cursor.y -= BLOCK_GAP;
  }
}

function drawPositionGraph(
  page: PDFPage,
  sheet: Sheet,
  graph: {
    top: number;
    height: number;
    laps: number[];
    orders: Map<number, LapPassing[]>;
    rows: number;
    podium: Map<string, number>;
    numberFor: (passing: LapPassing) => string;
  },
) {
  const { fonts, cars } = sheet;
  const { top, height, laps, orders, rows, podium } = graph;
  const left = LEFT + 26;
  const right = RIGHT - 30;
  const bottom = top - height;
  const xFor = (lap: number) =>
    left + ((lap - 1) / (laps.length - 1)) * (right - left);
  const yFor = (position: number) =>
    top - ((position - 1) / (rows - 1)) * height;
  const spacing = height / (rows - 1);
  const labelEvery = spacing >= 7 ? 1 : 5;
  const lapEvery = (right - left) / (laps.length - 1) >= 12 ? 1 : 5;

  for (let position = 1; position <= rows; position += 1) {
    if (position !== 1 && position % labelEvery && position !== rows) continue;
    page.drawLine({
      start: { x: left, y: yFor(position) },
      end: { x: right, y: yFor(position) },
      thickness: 0.25,
      color: RULE,
    });
    drawLabel(page, `P${position}`, {
      x: left - 6,
      y: yFor(position) - CAP_HEIGHT * 2.9,
      size: 5.8,
      font: fonts.data,
      color: INK_3,
      align: 'right',
    });
  }
  laps.forEach((lap) => {
    if (lap !== 1 && lap % lapEvery && lap !== laps.length) return;
    page.drawLine({
      start: { x: xFor(lap), y: top + 3 },
      end: { x: xFor(lap), y: bottom - 3 },
      thickness: 0.25,
      color: RULE,
    });
    drawLabel(page, String(lap), {
      x: xFor(lap),
      y: bottom - 11,
      size: 5.8,
      font: fonts.data,
      color: INK_3,
      align: 'center',
    });
  });
  drawLabel(page, 'Lap', {
    x: left - 6,
    y: bottom - 11,
    size: 5.8,
    font: fonts.label,
    color: INK_3,
    align: 'right',
  });

  const tracks = new Map<string, Array<{ lap: number; position: number }>>();
  laps.forEach((lap) =>
    orders.get(lap)?.forEach((passing, index) => {
      const key = passingKey(passing);
      tracks.set(key, [
        ...(tracks.get(key) || []),
        { lap, position: index + 1 },
      ]);
    }),
  );
  const styles = [
    { thickness: 1.7, dashArray: undefined, lineCap: LineCapStyle.Round },
    { thickness: 1.35, dashArray: [3.6, 1.8], lineCap: LineCapStyle.Butt },
    { thickness: 1.5, dashArray: [0.01, 2.6], lineCap: LineCapStyle.Round },
  ];
  const ordered = [...tracks.entries()].sort(
    ([left], [right]) => (podium.get(right) ?? -1) - (podium.get(left) ?? -1),
  );
  ordered.forEach(([key, points]) => {
    const place = podium.get(key);
    const style =
      place === undefined
        ? { thickness: 0.7, dashArray: undefined, lineCap: LineCapStyle.Round }
        : styles[place];
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      if (point.lap !== previous.lap + 1) return;
      page.drawLine({
        start: { x: xFor(previous.lap), y: yFor(previous.position) },
        end: { x: xFor(point.lap), y: yFor(point.position) },
        thickness: style.thickness,
        color: place === undefined ? CHART_LINE : INK,
        dashArray: style.dashArray,
        lineCap: style.lineCap,
      });
    });
  });
  ordered.forEach(([key, points]) => {
    const last = points.at(-1)!;
    const passing = graph.orders.get(last.lap)?.[last.position - 1];
    if (!passing) return;
    const size = spacing >= 9 ? 6.4 : 5.6;
    const label = graph.numberFor(passing);
    const x = xFor(last.lap) + 4;
    const y = yFor(last.position);
    if (last.lap !== laps.length) {
      const width = measure(label, fonts.dataBold, size);
      page.drawRectangle({
        x: x - 1,
        y: y - size * 0.45,
        width: width + 2,
        height: size * 0.9,
        color: WHITE,
      });
    }
    drawLabel(page, label, {
      x,
      y: y - CAP_HEIGHT * size * 0.5,
      size,
      font: podium.has(key) ? fonts.dataBold : fonts.data,
      color: podium.has(key) ? INK : INK_2,
    });
  });

  let x = left;
  const legendY = bottom - 26;
  const podiumCars = cars.filter((car) => podium.has(carKey(car)));
  podiumCars.forEach((car) => {
    const style = styles[podium.get(carKey(car))!];
    page.drawLine({
      start: { x, y: legendY + 2.4 },
      end: { x: x + 22, y: legendY + 2.4 },
      thickness: style.thickness,
      color: INK,
      dashArray: style.dashArray,
      lineCap: style.lineCap,
    });
    x += 27;
    x +=
      drawLabel(
        page,
        `${ordinal(podium.get(carKey(car))! + 1)} #${car.number} ${car.driver}`,
        {
          x,
          y: legendY,
          size: 6.6,
          font: fonts.text,
          color: INK_2,
          maxWidth: 120,
        },
      ) + 14;
  });
  page.drawLine({
    start: { x, y: legendY + 2.4 },
    end: { x: x + 22, y: legendY + 2.4 },
    thickness: 0.7,
    color: CHART_LINE,
  });
  drawLabel(page, 'Other cars, labelled with the car number', {
    x: x + 27,
    y: legendY,
    size: 6.6,
    font: fonts.text,
    color: INK_2,
  });
  return legendY - 10;
}

function orderAtLap(passings: LapPassing[], lapNumber: number) {
  return passings
    .filter((passing) => passing.lapNumber === lapNumber)
    .sort((left, right) => {
      if (left.totalTimeMs !== null && right.totalTimeMs !== null)
        return left.totalTimeMs - right.totalTimeMs;
      return Date.parse(left.recordedAt) - Date.parse(right.recordedAt);
    });
}

/* Page furniture ---------------------------------------------------------- */

function drawFirstHeader(page: PDFPage, sheet: Sheet) {
  const { fonts, snapshot, logo } = sheet;
  drawCheckerStrip(page);
  const logoHeight = 40;
  const textX = drawLogo(page, fonts, logo, 752, logoHeight) + 14;
  drawEyebrow(page, fonts, 'CVAR Live Timing — Result sheet', textX, 742);
  drawLabel(page, snapshot.eventName || 'CVAR race weekend', {
    x: textX,
    y: 726,
    size: 12,
    font: fonts.textBold,
    maxWidth: 410 - textX,
    minSize: 9,
  });
  drawLabel(page, 'Corinthian Vintage Auto Racing', {
    x: textX,
    y: 714.5,
    size: 7.6,
    font: fonts.text,
    color: INK_2,
  });
  drawStamp(page, fonts, RIGHT - 150, 712, 150, 40, STATUS_STAMP);

  const date = trackDateParts(snapshot.initializedAt || snapshot.updatedAt);
  let titleWidth = WIDTH;
  if (date) {
    const dayWidth = measure(date.day, fonts.display, 36);
    const textWidth = Math.max(
      measure(date.weekday.toUpperCase(), fonts.label, 7, 0.14),
      measure(date.date, fonts.text, 8.6),
    );
    const x = RIGHT - textWidth - dayWidth - 7;
    drawLabel(page, date.day, {
      x,
      y: 664,
      size: 36,
      font: fonts.display,
      outline: 0.9,
    });
    drawEyebrow(page, fonts, date.weekday, x + dayWidth + 7, 680, INK);
    drawLabel(page, date.date, {
      x: x + dayWidth + 7,
      y: 668,
      size: 8.6,
      font: fonts.text,
    });
    titleWidth = x - LEFT - 16;
  }
  const title = sheet.title.toUpperCase();
  if (measure(title, fonts.display, 17, -0.01) <= titleWidth)
    drawLabel(page, title, {
      x: LEFT,
      y: 668,
      size: 27,
      font: fonts.display,
      maxWidth: titleWidth,
      minSize: 17,
      tracking: -0.01,
    });
  else {
    // Long run names take two lines rather than shrinking out of sight.
    let size = 17;
    let lines = wrapText(title, fonts.display, size, titleWidth);
    while (lines.length > 2 && size > 12) {
      size -= 0.5;
      lines = wrapText(title, fonts.display, size, titleWidth);
    }
    [lines[0], lines.slice(1).join(' ')].forEach((line, index) =>
      drawLabel(page, line, {
        x: LEFT,
        y: 664 + (1 - index) * size * 1.08,
        size,
        font: fonts.display,
        maxWidth: titleWidth,
        tracking: -0.01,
      }),
    );
  }

  const flag = flagStatus(snapshot.flag);
  const facts = [
    {
      label: 'Track',
      value: [snapshot.trackName, trackDistance(snapshot.trackLength)]
        .filter(Boolean)
        .join(' · '),
      width: 206,
    },
    { label: 'Start', value: date ? `${date.time} CT` : '', width: 96 },
    { label: 'Session status', value: flag.label, width: 128, flag },
    {
      label: 'Elapsed',
      value: snapshot.raceTime ? shortTime(snapshot.raceTime) : '',
      width: 110,
    },
  ];
  rule(page, 646, 1.2, INK);
  rule(page, FIRST_HEADER_BOTTOM, 0.5, RULE);
  let x = LEFT;
  facts.forEach((fact, index) => {
    const pad = index ? 9 : 0;
    if (index)
      page.drawLine({
        start: { x, y: FIRST_HEADER_BOTTOM + 5 },
        end: { x, y: 641 },
        thickness: 0.4,
        color: RULE,
      });
    drawEyebrow(page, fonts, fact.label, x + pad, 634);
    let valueX = x + pad;
    if (fact.flag)
      valueX += drawFlagSwatch(page, fact.flag.tone, valueX, 619.5) + 5;
    drawLabel(page, fact.value || '–', {
      x: valueX,
      y: 618,
      size: 9.6,
      font: fonts.textBold,
      color: fact.value ? INK : INK_3,
      maxWidth: fact.width - (valueX - x) - 6,
      minSize: 7,
    });
    x += fact.width;
  });
  return FIRST_HEADER_BOTTOM;
}

function drawRunningHeader(page: PDFPage, sheet: Sheet) {
  const { fonts, snapshot, logo } = sheet;
  drawCheckerStrip(page);
  const textX = drawLogo(page, fonts, logo, 752, 26) + 12;
  drawEyebrow(page, fonts, 'CVAR Live Timing — Result sheet', textX, 745);
  drawLabel(page, sheet.title.toUpperCase(), {
    x: textX,
    y: 731,
    size: 12.5,
    font: fonts.display,
    maxWidth: RIGHT - 130 - textX,
    minSize: 8,
  });
  const date = trackDateParts(snapshot.initializedAt || snapshot.updatedAt);
  drawLabel(
    page,
    [snapshot.eventName, snapshot.trackName, date?.date]
      .filter(Boolean)
      .join(' · '),
    {
      x: textX,
      y: 720,
      size: 7.4,
      font: fonts.text,
      color: INK_2,
      maxWidth: RIGHT - 130 - textX,
    },
  );
  drawStamp(page, fonts, RIGHT - 112, 722, 112, 28, STATUS_STAMP);
  rule(page, RUNNING_HEADER_BOTTOM, 1.2, INK);
  return RUNNING_HEADER_BOTTOM;
}

function drawFooter(
  page: PDFPage,
  sheet: Sheet,
  pageNumber: number,
  totalPages: number,
) {
  const { fonts, snapshot } = sheet;
  rule(page, 50, 0.5, RULE);
  const statusWidth = drawEyebrow(
    page,
    fonts,
    'Provisional results',
    LEFT,
    39,
    INK,
  );
  drawLabel(page, '· Subject to steward review', {
    x: LEFT + statusWidth + 4,
    y: 39,
    size: 6.8,
    font: fonts.text,
    color: INK_2,
  });
  drawLabel(page, `Page ${pageNumber} of ${totalPages}`, {
    x: RIGHT,
    y: 39,
    size: 7.4,
    font: fonts.label,
    align: 'right',
  });
  drawLabel(
    page,
    `Corinthian Vintage Auto Racing · CVAR Live Timing · ${sheet.title}`,
    {
      x: LEFT,
      y: 29,
      size: 6.4,
      font: fonts.text,
      color: INK_3,
      maxWidth: 330,
    },
  );
  drawLabel(page, `Timing data as of ${formatDateTime(snapshot.updatedAt)}`, {
    x: RIGHT,
    y: 29,
    size: 6.4,
    font: fonts.text,
    color: INK_3,
    align: 'right',
  });
}

function drawSectionHeading(
  page: PDFPage,
  fonts: Fonts,
  top: number,
  heading: { index: string; title: string; note: string; continued?: boolean },
) {
  const baseline = top - 28;
  const indexWidth = drawLabel(page, heading.index, {
    x: LEFT,
    y: baseline,
    size: 17,
    font: fonts.display,
    outline: 0.7,
  });
  const titleWidth = drawLabel(page, heading.title.toUpperCase(), {
    x: LEFT + indexWidth + 7,
    y: baseline,
    size: 17,
    font: fonts.display,
  });
  if (heading.continued) {
    drawEyebrow(
      page,
      fonts,
      'Continued',
      LEFT + indexWidth + titleWidth + 14,
      baseline,
    );
    return baseline - 12;
  }
  const lines = wrapText(heading.note, fonts.text, 7.6, WIDTH);
  lines.forEach((line, index) =>
    drawLabel(page, line, {
      x: LEFT,
      y: baseline - 13 - index * 9.6,
      size: 7.6,
      font: fonts.text,
      color: INK_2,
    }),
  );
  return baseline - 13 - (lines.length - 1) * 9.6 - 10;
}

function drawKicker(
  page: PDFPage,
  fonts: Fonts,
  kicker: { y: number; index: string; label: string; note: string },
) {
  const indexWidth = drawEyebrow(
    page,
    fonts,
    kicker.index,
    LEFT,
    kicker.y,
    INK,
  );
  page.drawLine({
    start: { x: LEFT + indexWidth + 6, y: kicker.y + 2.2 },
    end: { x: LEFT + indexWidth + 28, y: kicker.y + 2.2 },
    thickness: 0.8,
    color: INK,
  });
  drawEyebrow(page, fonts, kicker.label, LEFT + indexWidth + 34, kicker.y, INK);
  drawLabel(page, kicker.note, {
    x: RIGHT,
    y: kicker.y,
    size: 7,
    font: fonts.text,
    color: INK_2,
    align: 'right',
  });
}

function drawTableHead(
  page: PDFPage,
  fonts: Fonts,
  columns: Column[],
  top: number,
) {
  rule(page, top, 1.2, INK);
  columns.forEach((column) => {
    const lines = column.label;
    lines.forEach((line, index) => {
      const baseline = top - TABLE_HEAD + 6 + (lines.length - 1 - index) * 7;
      const anchor =
        column.align === 'right'
          ? column.x + column.width - 3
          : column.align === 'center'
            ? column.x + column.width / 2
            : column.x + 3;
      drawLabel(page, line.toUpperCase(), {
        x: anchor,
        y: baseline,
        size: 5.6,
        font: fonts.label,
        color: INK_3,
        align: column.align,
        tracking: 0.08,
        maxWidth: Math.max(column.width - 4, 12),
        minSize: 4.4,
      });
    });
  });
  rule(page, top - TABLE_HEAD, 0.5, INK);
  return top - TABLE_HEAD;
}

function newPage(sheet: Sheet): Cursor {
  const page = sheet.document.addPage(LETTER);
  return { page, y: drawRunningHeader(page, sheet) - 4 };
}

function startSection(sheet: Sheet, cursor: Cursor | null, needed: number) {
  return cursor && cursor.y - needed >= BOTTOM ? cursor : newPage(sheet);
}

/* Marks ------------------------------------------------------------------- */

function drawCheckerStrip(page: PDFPage) {
  const size = 3;
  for (let column = 0; column < WIDTH / size; column += 1)
    for (let row = 0; row < 2; row += 1)
      if ((column + row) % 2 === 0)
        page.drawRectangle({
          x: LEFT + column * size,
          y: 762 + row * size,
          width: size,
          height: size,
          color: INK,
        });
}

function drawLogo(
  page: PDFPage,
  fonts: Fonts,
  logo: PDFImage | null,
  top: number,
  height: number,
) {
  if (logo) {
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { x: LEFT, y: top - height, width, height });
    return LEFT + width;
  }
  return (
    LEFT +
    drawLabel(page, 'CVAR', {
      x: LEFT,
      y: top - height * 0.75,
      size: height * 0.6,
      font: fonts.display,
    })
  );
}

function drawStamp(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  y: number,
  width: number,
  height: number,
  stamp: { title: string; subtitle: string; filled: boolean },
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: stamp.filled ? YELLOW : undefined,
    borderColor: INK,
    borderWidth: 1.3,
  });
  page.drawRectangle({
    x: x + 2.6,
    y: y + 2.6,
    width: width - 5.2,
    height: height - 5.2,
    borderColor: INK,
    borderWidth: 0.5,
  });
  const titleSize = Math.min(14, height * 0.36);
  drawLabel(page, stamp.title.toUpperCase(), {
    x: x + width / 2,
    y: y + height * 0.5,
    size: titleSize,
    font: fonts.display,
    align: 'center',
    maxWidth: width - 14,
    minSize: 7,
  });
  drawLabel(page, stamp.subtitle.toUpperCase(), {
    x: x + width / 2,
    y: y + height * 0.5 - titleSize * 0.95,
    size: Math.min(5.6, height * 0.16),
    font: fonts.label,
    align: 'center',
    tracking: 0.1,
    maxWidth: width - 14,
    minSize: 3.8,
  });
}

function drawPosition(
  page: PDFPage,
  fonts: Fonts,
  position: number,
  x: number,
  middle: number,
  { size }: { size: number },
) {
  const fill =
    position === 1
      ? YELLOW
      : position === 2
        ? PODIUM_2
        : position === 3
          ? PODIUM_3
          : null;
  if (fill)
    page.drawRectangle({
      x,
      y: middle - size / 2,
      width: size,
      height: size,
      color: fill,
      borderColor: INK,
      borderWidth: 0.9,
    });
  const textSize = size * 0.66;
  drawLabel(page, String(position || '–'), {
    x: x + size / 2,
    y: middle - CAP_HEIGHT * textSize * 0.5,
    size: textSize,
    font: fonts.dataBold,
    align: 'center',
  });
  if (!fill) return;
  // Podium steps (2nd, 1st, 3rd) with this car's step filled in, so the
  // top three read in black-and-white print as well as in colour.
  const bar = size * 0.19;
  const gap = size * 0.06;
  const base = middle - size / 2;
  [
    { place: 2, height: 0.62 },
    { place: 1, height: 0.88 },
    { place: 3, height: 0.42 },
  ].forEach((step, index) =>
    page.drawRectangle({
      x: x + size + 2.5 + index * (bar + gap),
      y: base,
      width: bar,
      height: size * step.height,
      color: step.place === position ? INK : undefined,
      borderColor: INK,
      borderWidth: 0.45,
    }),
  );
}

function drawCarNumber(
  page: PDFPage,
  fonts: Fonts,
  value: string,
  center: number,
  middle: number,
  { height }: { height: number },
) {
  const label = printable(value || '–', fonts.dataBold);
  const size = height * (label.length > 2 ? 0.52 : 0.58);
  const width = Math.max(
    height,
    measure(label, fonts.dataBold, size) + height * 0.55,
  );
  const radius = height / 2;
  const left = center - width / 2;
  page.drawSvgPath(
    `M ${radius} 0 H ${width - radius} A ${radius} ${radius} 0 0 1 ${width - radius} ${height} H ${radius} A ${radius} ${radius} 0 0 1 ${radius} 0 Z`,
    {
      x: left,
      y: middle + radius,
      color: WHITE,
      borderColor: INK,
      borderWidth: Math.max(0.9, height * 0.085),
    },
  );
  drawLabel(page, label, {
    x: center,
    y: middle - CAP_HEIGHT * size * 0.5,
    size,
    font: fonts.dataBold,
    align: 'center',
  });
}

/** The steward's tag, then a DNF or DNS from the timing unless the steward
 * set a status of their own. */
function resultTags(car: ResultCar) {
  const tags = [adjustmentTag(car.resultAdjustment)];
  if (
    car.raceStatus &&
    !STOPPED_STATUSES.includes(car.resultAdjustment?.status || '')
  )
    tags.push({ label: car.raceStatus, filled: true });
  return tags.filter((tag) => tag !== null);
}

function adjustmentTag(adjustment?: ResultAdjustment) {
  if (!adjustment) return null;
  const penalty =
    adjustment.penaltySeconds > 0
      ? `+${adjustment.penaltySeconds.toFixed(3).replace(/\.?0+$/, '')}s`
      : '';
  if (adjustment.status === 'PENALTY' || (!adjustment.status && penalty))
    return { label: `PEN ${penalty}`.trim(), filled: false };
  if (adjustment.status) return { label: adjustment.status, filled: true };
  return {
    label: adjustment.positionOverride
      ? `P${adjustment.positionOverride}`
      : 'STEWARD',
    filled: false,
  };
}

function measureTag(fonts: Fonts, label: string) {
  return measure(label, fonts.label, 5.6, 0.06) + 5;
}

function drawTag(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  x: number,
  middle: number,
  { filled }: { filled: boolean },
) {
  const width = measureTag(fonts, label);
  page.drawRectangle({
    x,
    y: middle - 4.4,
    width,
    height: 8.8,
    color: filled ? INK : WHITE,
    borderColor: INK,
    borderWidth: 0.7,
  });
  drawLabel(page, label, {
    x: x + 2.5,
    y: middle - CAP_HEIGHT * 2.8,
    size: 5.6,
    font: fonts.label,
    color: filled ? WHITE : INK,
    tracking: 0.06,
  });
  return width;
}

function drawClassTag(
  page: PDFPage,
  fonts: Fonts,
  value: string,
  x: number,
  middle: number,
  { maxWidth, size = 5.6 }: { maxWidth: number; size?: number },
) {
  const label = fitSize(value.toUpperCase(), fonts.label, {
    size,
    minSize: 4.4,
    maxWidth: maxWidth - 5,
    tracking: 0.06,
  });
  const width = measure(label.text, fonts.label, label.size, 0.06) + 5;
  page.drawRectangle({
    x,
    y: middle - 4.3,
    width,
    height: 8.6,
    borderColor: INK_3,
    borderWidth: 0.55,
  });
  drawLabel(page, label.text, {
    x: x + 2.5,
    y: middle - CAP_HEIGHT * label.size * 0.5,
    size: label.size,
    font: fonts.label,
    color: INK_2,
    tracking: 0.06,
  });
  return width;
}

function drawFastestBox(
  page: PDFPage,
  x: number,
  baseline: number,
  width: number,
  size: number,
) {
  page.drawRectangle({
    x: x - 1.8,
    y: baseline - 2.1,
    width: width + 3.6,
    height: size * CAP_HEIGHT + 4.2,
    borderColor: INK,
    borderWidth: 0.85,
  });
}

function drawFlagSwatch(page: PDFPage, tone: string, x: number, y: number) {
  const width = 12;
  const height = 8;
  if (tone === 'checkered') {
    for (let row = 0; row < 2; row += 1)
      for (let column = 0; column < 3; column += 1)
        if ((row + column) % 2 === 0)
          page.drawRectangle({
            x: x + column * 4,
            y: y + row * 4,
            width: 4,
            height: 4,
            color: INK,
          });
  }
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: tone === 'checkered' ? undefined : FLAG_COLORS[tone] || WHITE,
    borderColor: INK,
    borderWidth: 0.7,
  });
  return width;
}

function drawEyebrow(
  page: PDFPage,
  fonts: Fonts,
  value: string,
  x: number,
  y: number,
  color: Color = INK_3,
) {
  return drawLabel(page, value.toUpperCase(), {
    x,
    y,
    size: 6.2,
    font: fonts.label,
    color,
    tracking: 0.12,
  });
}

function rule(page: PDFPage, y: number, thickness: number, color: Color) {
  page.drawLine({
    start: { x: LEFT, y },
    end: { x: RIGHT, y },
    thickness,
    color,
  });
}

/* Text -------------------------------------------------------------------- */

type TextOptions = {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: Color;
  align?: Align;
  maxWidth?: number;
  minSize?: number;
  /** Letter spacing in em. */
  tracking?: number;
  /** Stroke width for outlined lettering. */
  outline?: number;
};

/** Draws real, selectable text and returns its width. */
function drawLabel(page: PDFPage, value: string, options: TextOptions) {
  const { font, color = INK, align = 'left', tracking = 0, outline } = options;
  const fitted =
    options.maxWidth === undefined
      ? { text: printable(value, font), size: options.size }
      : fitSize(value, font, {
          size: options.size,
          minSize: options.minSize ?? options.size,
          maxWidth: options.maxWidth,
          tracking,
        });
  if (!fitted.text) return 0;
  const { text, size } = fitted;
  const width = measure(text, font, size, tracking);
  const x =
    align === 'right'
      ? options.x - width
      : align === 'center'
        ? options.x - width / 2
        : options.x;
  const styled = Boolean(tracking || outline);
  if (styled) {
    page.pushOperators(pushGraphicsState());
    if (tracking) page.pushOperators(setCharacterSpacing(tracking * size));
    if (outline)
      page.pushOperators(
        setTextRenderingMode(TextRenderingMode.Outline),
        setLineWidth(outline),
        setStrokingColor(color),
      );
  }
  page.drawText(text, { x, y: options.y, size, font, color });
  if (styled) page.pushOperators(popGraphicsState());
  return width;
}

function cellText(
  page: PDFPage,
  value: string,
  column: Column,
  baseline: number,
  options: { size: number; font: PDFFont; color?: Color; minSize?: number },
) {
  const anchor =
    column.align === 'right'
      ? column.x + column.width - 3
      : column.align === 'center'
        ? column.x + column.width / 2
        : column.x + 3;
  return drawLabel(page, value || '–', {
    ...options,
    x: anchor,
    y: baseline,
    color: value ? options.color : INK_3,
    align: column.align,
    maxWidth: column.width - 6,
    minSize: options.minSize ?? options.size - 1.2,
  });
}

/** Shrinks text towards minSize, then shortens it, to fit maxWidth. */
function fitSize(
  value: string,
  font: PDFFont,
  {
    size,
    minSize,
    maxWidth,
    tracking = 0,
  }: { size: number; minSize: number; maxWidth: number; tracking?: number },
) {
  const text = printable(value, font);
  let fittedSize = size;
  while (
    fittedSize > minSize &&
    measure(text, font, fittedSize, tracking) > maxWidth
  )
    fittedSize = Math.max(minSize, fittedSize - 0.2);
  if (measure(text, font, fittedSize, tracking) <= maxWidth)
    return { text, size: fittedSize };
  const characters = Array.from(text);
  while (
    characters.length > 1 &&
    measure(`${characters.join('').trimEnd()}…`, font, fittedSize, tracking) >
      maxWidth
  )
    characters.pop();
  return { text: `${characters.join('').trimEnd()}…`, size: fittedSize };
}

function measure(text: string, font: PDFFont, size: number, tracking = 0) {
  const glyphs = Array.from(text).length;
  return (
    font.widthOfTextAtSize(text, size) +
    tracking * size * Math.max(0, glyphs - 1)
  );
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = '';
  printable(value, font)
    .split(' ')
    .filter(Boolean)
    .forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font, size) <= width) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      let rest = word;
      while (measure(rest, font, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut), font, size) > width)
          cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Wraps to at most maxLines, shortening the last line if needed. */
function wrapLines(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
  maxLines: number,
) {
  const lines = wrapText(value, font, size, width).filter(Boolean);
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')]
    : lines;
}

const characterSets = new WeakMap<PDFFont, Set<number>>();

/** Keeps the characters the font can draw, folding the rest to plain text. */
function printable(value: string, font: PDFFont) {
  let supported = characterSets.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    characterSets.set(font, supported);
  }
  let text = '';
  for (const character of value.normalize('NFC').replace(/\s+/g, ' ')) {
    if (supported.has(character.codePointAt(0)!)) {
      text += character;
      continue;
    }
    for (const fallback of character.normalize('NFKD').replace(/\p{M}/gu, ''))
      if (supported.has(fallback.codePointAt(0)!)) text += fallback;
  }
  return text.trim();
}

async function embedFonts(document: PDFDocument): Promise<Fonts> {
  document.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const roles = Object.keys(FONT_FILES) as FontRole[];
  const fonts = await Promise.all(
    roles.map((role) =>
      // Subset to the characters used; ligatures off so copied text matches.
      document.embedFont(bytes[role], {
        subset: true,
        features: { liga: false },
      }),
    ),
  );
  return Object.fromEntries(
    roles.map((role, index) => [role, fonts[index]]),
  ) as Fonts;
}

let fontBytes: Promise<Record<FontRole, Uint8Array>> | undefined;

function loadFontBytes() {
  fontBytes ??= Promise.all(
    (Object.entries(FONT_FILES) as Array<[FontRole, string]>).map(
      async ([role, file]) => [role, await readFontFile(file)] as const,
    ),
  )
    .then(
      (entries) => Object.fromEntries(entries) as Record<FontRole, Uint8Array>,
    )
    .catch((error) => {
      fontBytes = undefined;
      throw error;
    });
  return fontBytes;
}

async function readFontFile(file: string) {
  let lastError: unknown;
  for (const directory of FONT_DIRECTORIES) {
    try {
      return new Uint8Array(await readFile(path.join(directory, file)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/* Results ----------------------------------------------------------------- */

function rankCars(
  cars: ResultCar[],
  adjustments: Record<string, ResultAdjustment>,
  resultOrder: 'best-lap' | 'position',
) {
  const ranked = cars
    .map((car) => ({
      ...car,
      resultAdjustment:
        adjustments[car.registrationKey || car.registrationNumber],
    }))
    .sort((left, right) => {
      const statusDifference =
        resultStatusOrder(left.resultAdjustment?.status) -
        resultStatusOrder(right.resultAdjustment?.status);
      if (statusDifference) return statusDifference;
      if (resultOrder === 'position') {
        const difference = officialPosition(left) - officialPosition(right);
        return difference || left.position - right.position;
      }
      const difference =
        adjustedLapMilliseconds(left) - adjustedLapMilliseconds(right);
      return Number.isNaN(difference)
        ? left.position - right.position
        : difference || left.position - right.position;
    });
  const overrides = ranked
    .filter((car) => car.resultAdjustment?.positionOverride)
    .sort(
      (left, right) =>
        (left.resultAdjustment?.positionOverride || 0) -
        (right.resultAdjustment?.positionOverride || 0),
    );
  overrides.forEach((car) => {
    const currentIndex = ranked.indexOf(car);
    if (currentIndex >= 0) ranked.splice(currentIndex, 1);
    ranked.splice(
      Math.min(
        ranked.length,
        Math.max(0, (car.resultAdjustment?.positionOverride || 1) - 1),
      ),
      0,
      car,
    );
  });
  const leaderTime = ranked.length
    ? adjustedLapMilliseconds(ranked[0])
    : Number.POSITIVE_INFINITY;
  const raceLeader = ranked[0];
  return ranked.map((car, index) => {
    const lapTime = adjustedLapMilliseconds(car);
    const previousTime =
      index > 0
        ? adjustedLapMilliseconds(ranked[index - 1])
        : Number.POSITIVE_INFINITY;
    const hasAdjustedResult =
      (car.resultAdjustment?.penaltySeconds || 0) > 0 &&
      Number.isFinite(lapTime);
    return {
      ...car,
      position: index + 1,
      adjustedBestLap: hasAdjustedResult
        ? millisecondsToLapTime(lapTime)
        : undefined,
      gapToPrevious:
        resultOrder === 'position'
          ? index > 0
            ? raceGapAtLastLap(ranked[index - 1], car)
            : ''
          : index === 0 ||
              !Number.isFinite(previousTime) ||
              !Number.isFinite(lapTime)
            ? ''
            : formatGap(lapTime - previousTime),
      gapToLeader:
        resultOrder === 'position'
          ? index > 0 && raceLeader
            ? raceGapAtLastLap(raceLeader, car)
            : ''
          : index === 0 ||
              !Number.isFinite(leaderTime) ||
              !Number.isFinite(lapTime)
            ? ''
            : formatGap(lapTime - leaderTime),
    };
  });
}

function officialPosition(car: ResultCar) {
  const position = car.racePosition || car.position;
  return Number.isInteger(position) && position > 0
    ? position
    : Number.MAX_SAFE_INTEGER;
}

function formatGap(milliseconds: number) {
  return `+${(milliseconds / 1_000).toFixed(3)}`;
}

function adjustedLapMilliseconds(car: ResultCar) {
  if (['DNF', 'DNS', 'DQ'].includes(car.resultAdjustment?.status || ''))
    return Number.POSITIVE_INFINITY;
  const base = lapTimeToMilliseconds(car.bestLap);
  return Number.isFinite(base)
    ? base + (car.resultAdjustment?.penaltySeconds || 0) * 1_000
    : base;
}

function resultStatusOrder(status = '') {
  return status === 'DQ' ? 4 : status === 'DNS' ? 3 : status === 'DNF' ? 2 : 0;
}

/** A steward's DNF, DNS or DQ, otherwise the status the timing shows. */
function resultStatus(car: ResultCar) {
  const status = car.resultAdjustment?.status || '';
  return STOPPED_STATUSES.includes(status) ? status : car.raceStatus || '';
}

function started(car: ResultCar) {
  return car.laps > 0 && resultStatus(car) !== 'DNS';
}

function classified(car: ResultCar) {
  return started(car) && !['DNF', 'DQ'].includes(resultStatus(car));
}

function defaultAdjustmentNote(adjustment: ResultAdjustment) {
  if (adjustment.positionOverride) return 'Position set by steward.';
  if (adjustment.status) return 'Status set by steward.';
  if (adjustment.penaltySeconds > 0) return 'Time penalty applied.';
  return 'Steward adjustment recorded.';
}

function millisecondsToLapTime(value: number) {
  const totalSeconds = value / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function lapMilliseconds(passing: LapPassing) {
  return passing.lapTimeMs ?? lapTimeToMilliseconds(passing.lapTime);
}

function carKey(
  car: Pick<ResultCar, 'registrationKey' | 'registrationNumber'>,
) {
  return car.registrationKey || car.registrationNumber;
}

function passingKey(passing: LapPassing) {
  return passing.registrationKey || passing.registrationNumber;
}

/**
 * Numbers each car's laps 1, 2, 3… in elapsed-time order. Stored lap numbers
 * can't be trusted: the relay used to count every loop crossing, including
 * pit out and the start, and started its count over one lap short when it
 * was restarted mid-session. Crossings without a lap time, loop double reads
 * and records Orbits sent twice are not laps.
 */
export function numberLaps(passings: LapPassing[]) {
  const lapsByCar = new Map<string, Map<number | string, LapPassing>>();
  for (const passing of passings) {
    const time = lapMilliseconds(passing);
    if (!Number.isFinite(time) || time < MIN_LAP_MS) continue;
    const key = passingKey(passing);
    const laps = lapsByCar.get(key) || new Map<number | string, LapPassing>();
    laps.set(passing.totalTimeMs ?? passing.recordedAt, passing);
    lapsByCar.set(key, laps);
  }
  return [...lapsByCar.values()].flatMap((laps) => {
    let lapNumber = 0;
    let previous: LapPassing | undefined;
    return [...laps.values()]
      .sort((left, right) =>
        left.totalTimeMs !== null && right.totalTimeMs !== null
          ? left.totalTimeMs - right.totalTimeMs
          : Date.parse(left.recordedAt) - Date.parse(right.recordedAt),
      )
      .map((passing) => {
        lapNumber += 1 + missedCrossings(previous, passing);
        previous = passing;
        return { ...passing, lapNumber };
      });
  });
}

/**
 * Laps lost between two stored crossings, as when the relay is stopped
 * before it publishes the lap it just read. Orbits times each lap from the
 * crossing before it, so a lap that starts well after the previous stored
 * crossing means the ones in between were never stored.
 */
function missedCrossings(
  previous: LapPassing | undefined,
  passing: LapPassing,
) {
  if (previous?.totalTimeMs == null || passing.totalTimeMs === null) return 0;
  const lap = lapMilliseconds(passing);
  const gap = passing.totalTimeMs - lap - previous.totalTimeMs;
  return gap < MIN_LAP_MS ? 0 : Math.max(1, Math.round(gap / lap));
}

/* Parsing ----------------------------------------------------------------- */

function parseSnapshot(
  value: string,
  racePositions: Record<string, number>,
): ResultSnapshot | null {
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
      flagStartedAt: stringValue(snapshot.flagStartedAt),
      timeToGo: stringValue(snapshot.timeToGo),
      raceTime: stringValue(snapshot.raceTime),
      initializedAt: stringValue(snapshot.initializedAt),
      updatedAt: stringValue(snapshot.updatedAt),
      groups: Array.isArray(snapshot.groups)
        ? snapshot.groups.filter(
            (group): group is string => typeof group === 'string',
          )
        : [],
      cars: snapshot.cars
        .map((car) => parseCar(car, racePositions))
        .filter((car): car is ResultCar => Boolean(car)),
    };
  } catch {
    return null;
  }
}

function parseCar(
  value: unknown,
  racePositions: Record<string, number>,
): ResultCar | null {
  if (!value || typeof value !== 'object') return null;
  const car = value as Record<string, unknown>;
  return {
    registrationKey: stringValue(car.registrationKey),
    registrationNumber: stringValue(car.registrationNumber),
    number: stringValue(car.number),
    driver: stringValue(car.driver),
    car: stringValue(car.car),
    groupName: stringValue(car.groupName),
    className: stringValue(car.className),
    position: numberValue(car.position),
    racePosition: racePositionForCar(car, racePositions),
    laps: numberValue(car.laps),
    bestLapNumber: numberValue(car.bestLapNumber),
    totalTime: stringValue(car.totalTime),
    bestLap: stringValue(car.bestLap),
    gap: stringValue(car.gap),
    points: pointsValue(car.points),
  };
}

function parsePassings(value: unknown): LapPassing[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    try {
      const passing = JSON.parse(item) as Record<string, unknown>;
      if (
        typeof passing.registrationNumber !== 'string' ||
        typeof passing.recordedAt !== 'string'
      )
        return [];
      return [
        {
          registrationKey: stringValue(passing.registrationKey),
          registrationNumber: passing.registrationNumber,
          number: stringValue(passing.number),
          driver: stringValue(passing.driver),
          lapNumber: numberValue(passing.lapNumber),
          lapTime: stringValue(passing.lapTime),
          lapTimeMs: nullableNumber(passing.lapTimeMs),
          totalTimeMs: nullableNumber(passing.totalTimeMs),
          recordedAt: passing.recordedAt,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function loadLogo(requestUrl: string) {
  try {
    const response = await fetch(new URL('/cvar-logo.png', requestUrl));
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/* Formatting -------------------------------------------------------------- */

/** "Group SE · Race 1", adding the run groups when the run name has none. */
function sessionTitle(snapshot: ResultSnapshot) {
  const title = displaySessionName(snapshot.runName).trim() || 'Session';
  if (title.includes(' · ') || /^Groups?\s/i.test(title)) return title;
  const groups = groupList(snapshot.groups);
  return groups ? `${groups} · ${title}` : title;
}

function groupList(groups: string[]) {
  const names = [
    ...new Set(groups.map((group) => group.trim()).filter(Boolean)),
  ];
  if (!names.length) return '';
  const numbered = names.every((group) => /^Group\s+\d+$/i.test(group));
  const labels = numbered
    ? names
        .map((group) => group.replace(/^Group\s+/i, ''))
        .sort((left, right) => Number(left) - Number(right))
    : names;
  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} & ${labels.at(-1)}`;
  return numbered
    ? `${labels.length === 1 ? 'Group' : 'Groups'} ${joined}`
    : joined;
}

function flagStatus(value: string) {
  const flag = value.trim().toUpperCase();
  if (!flag || flag === 'NOT ACTIVE')
    return { label: 'Not active', tone: 'inactive' };
  if (FINISH_FLAGS.includes(flag))
    return { label: 'Checkered flag', tone: 'checkered' };
  return {
    label: `${flag.charAt(0)}${flag.slice(1).toLowerCase()} flag`,
    tone: flag.toLowerCase(),
  };
}

function trackDistance(value: string) {
  const distance = value.split(/[·/]/)[0]?.trim();
  if (!distance) return '';
  const miles = distance.match(/^(\d+(?:\.\d+)?)\s*(?:mi|miles?)?$/i)?.[1];
  return miles
    ? `${Number(miles).toLocaleString('en-US', { maximumFractionDigits: 3 })} mi`
    : distance;
}

function ordinal(place: number) {
  return place === 1
    ? '1st'
    : place === 2
      ? '2nd'
      : place === 3
        ? '3rd'
        : `${place}th`;
}

function sectionNumber(value: number) {
  return String(value).padStart(2, '0');
}

function formatSessionName(value: string) {
  return safeText(displaySessionName(value).replace(' · ', ' - '));
}

function resultOrderForSession(
  runName: string,
  sessionMode?: ResultSnapshot['sessionMode'],
): 'best-lap' | 'position' {
  return sessionMode === 'race' ||
    /\brace(?:\s*\d+)?\b/i.test(formatSessionName(runName))
    ? 'position'
    : 'best-lap';
}

function trackDateParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: TRACK_TIME_ZONE,
      ...options,
    }).format(date);
  return {
    weekday: format({ weekday: 'long' }),
    day: format({ day: 'numeric' }),
    date: format({ month: 'short', day: 'numeric', year: 'numeric' }),
    time: format({ hour: 'numeric', minute: '2-digit' }),
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat('en-US', {
        timeZone: TRACK_TIME_ZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)} CT`
    : 'the saved session';
}
function formatTimeOfDay(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: TRACK_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date)
    : '';
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
    .replace(/[^\x20-\x7e]/g, '');
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
function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function pointsValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}
function formatPoints(value: number | null) {
  return value === null ? '' : String(value);
}
function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
