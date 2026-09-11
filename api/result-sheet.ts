import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

import { redisCommand, redisIsConfigured } from './_redis.js';
import { readAdjustments, type ResultAdjustment } from './_adjustments.js';

type ResultCar = {
  registrationKey: string;
  registrationNumber: string;
  number: string;
  driver: string;
  groupName: string;
  className: string;
  position: number;
  laps: number;
  bestLapNumber: number;
  totalTime: string;
  bestLap: string;
  gap: string;
  gapToPrevious?: string;
  gapToLeader?: string;
  adjustedBestLap?: string;
  resultAdjustment?: ResultAdjustment;
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
  timeToGo: string;
  raceTime: string;
  initializedAt: string;
  updatedAt: string;
  cars: ResultCar[];
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };
type LapBlock = { car: ResultCar; laps: LapPassing[]; continued?: boolean };

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
const ROW_SHADE = rgb(0.93, 0.93, 0.9);

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
    const sessionId =
      requestedSessionId || (await redisCommand(['GET', 'cvar:live-session']));
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
    const snapshot = parseSnapshot(stored);
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
) {
  const document = await PDFDocument.create();
  document.setTitle(`${formatSessionName(snapshot.runName)} results`);
  document.setAuthor('Corinthian Vintage Auto Racing');
  document.setSubject('Unofficial session result packet');
  document.setCreator('CVAR Live Timing');
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    italic: await document.embedFont(StandardFonts.HelveticaOblique),
  };
  const logo = logoBytes
    ? await document.embedPng(logoBytes).catch(() => null)
    : null;
  const cars = rankCars(snapshot.cars, adjustments);
  const classificationPages = chunk(cars, 34);
  if (!classificationPages.length) classificationPages.push([]);
  const penaltyPages = chunk(
    cars.filter((car) => Boolean(car.resultAdjustment)),
    18,
  );
  const lapPages = planLapBreakdownPages(cars, passings);
  const chartPages = planLapChartPages(passings);
  const totalPages =
    classificationPages.length +
    penaltyPages.length +
    lapPages.length +
    chartPages.length;
  let pageNumber = 1;

  classificationPages.forEach((rows, index) => {
    const page = document.addPage(A4);
    drawClassificationPage({
      page,
      snapshot,
      rows,
      startPosition: index * 34,
      pageNumber,
      totalPages,
      fonts,
      logo,
    });
    pageNumber += 1;
  });
  penaltyPages.forEach((rows) => {
    const page = document.addPage(A4);
    drawPenaltyPage({
      page,
      snapshot,
      rows,
      pageNumber,
      totalPages,
      fonts,
      logo,
    });
    pageNumber += 1;
  });
  lapPages.forEach((columns) => {
    const page = document.addPage(A4);
    drawLapBreakdownPage({
      page,
      snapshot,
      columns,
      pageNumber,
      totalPages,
      fonts,
      logo,
    });
    pageNumber += 1;
  });
  chartPages.forEach((lapNumbers) => {
    const page = document.addPage(A4);
    drawLapChartPage({
      page,
      snapshot,
      cars,
      passings,
      lapNumbers,
      pageNumber,
      totalPages,
      fonts,
      logo,
    });
    pageNumber += 1;
  });
  return document.save();
}

function drawClassificationPage({
  page,
  snapshot,
  rows,
  startPosition,
  pageNumber,
  totalPages,
  fonts,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  rows: ResultCar[];
  startPosition: number;
  pageNumber: number;
  totalPages: number;
  fonts: Fonts;
  logo: PDFImage | null;
}) {
  const { width } = page.getSize();
  const contentTop = drawDocumentHeader({
    page,
    snapshot,
    title: 'RESULT SHEET',
    label: 'ADJUSTED BEST-LAP ORDER',
    fonts,
    logo,
  });
  const columns = [
    { label: 'Pos', x: 34, width: 22, align: 'right' as const },
    { label: 'No.', x: 61, width: 27, align: 'left' as const },
    { label: 'Driver', x: 93, width: 98, align: 'left' as const },
    { label: 'Class', x: 196, width: 41, align: 'left' as const },
    { label: 'Laps', x: 242, width: 28, align: 'right' as const },
    { label: 'Total time', x: 275, width: 62, align: 'right' as const },
    { label: 'Best Tm', x: 342, width: 53, align: 'right' as const },
    { label: 'Result', x: 400, width: 53, align: 'right' as const },
    { label: 'To prev.', x: 458, width: 49, align: 'right' as const },
    { label: 'To lead', x: 512, width: 55, align: 'right' as const },
  ];
  const tableTop = contentTop - 17;
  page.drawRectangle({
    x: 28,
    y: tableTop - 2,
    width: width - 56,
    height: 18,
    color: BLUE,
  });
  columns.forEach((column) =>
    drawCell(
      page,
      column.label,
      column.x,
      tableTop + 4,
      column.width,
      7,
      fonts.bold,
      rgb(1, 1, 1),
      column.align,
    ),
  );

  const rowHeight = 14.8;
  rows.forEach((car, index) => {
    const rowY = tableTop - 17 - index * rowHeight;
    if (index % 2 === 1)
      page.drawRectangle({
        x: 28,
        y: rowY - 2.5,
        width: width - 56,
        height: rowHeight,
        color: ROW_SHADE,
      });
    const position = startPosition + index + 1;
    const cells = [
      String(position),
      car.number || '-',
      car.driver || `Car ${car.number || position}`,
      car.className || '-',
      String(car.laps || 0),
      car.totalTime || '-',
      car.bestLap || '-',
      ['DNF', 'DNS', 'DQ'].includes(car.resultAdjustment?.status || '')
        ? '-'
        : car.adjustedBestLap || car.bestLap || '-',
      car.gapToPrevious || '-',
      car.gapToLeader || '-',
    ];
    columns.forEach((column, cellIndex) =>
      drawCell(
        page,
        cells[cellIndex],
        column.x,
        rowY + 1.5,
        column.width,
        6.9,
        cellIndex === 7 ? fonts.bold : fonts.regular,
        cellIndex === 7 && car.bestLap ? NAVY : INK,
        column.align,
      ),
    );
    page.drawLine({
      start: { x: 28, y: rowY - 2.5 },
      end: { x: width - 28, y: rowY - 2.5 },
      thickness: 0.3,
      color: LINE,
    });
  });
  if (!rows.length)
    page.drawText('No timed cars were recorded for this session.', {
      x: 38,
      y: tableTop - 50,
      size: 10,
      font: fonts.italic,
      color: MUTED,
    });
  drawFooter(page, snapshot, pageNumber, totalPages, fonts);
}

function drawPenaltyPage({
  page,
  snapshot,
  rows,
  pageNumber,
  totalPages,
  fonts,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  rows: ResultCar[];
  pageNumber: number;
  totalPages: number;
  fonts: Fonts;
  logo: PDFImage | null;
}) {
  const { width } = page.getSize();
  const contentTop = drawDocumentHeader({
    page,
    snapshot,
    title: 'PENALTIES & STEWARD DECISIONS',
    label: 'OFFICIAL RESULT ADJUSTMENTS',
    fonts,
    logo,
  });
  const columns = [
    { label: 'No.', x: 34, width: 34, align: 'left' as const },
    { label: 'Driver', x: 72, width: 94, align: 'left' as const },
    { label: 'Decision', x: 170, width: 112, align: 'left' as const },
    { label: 'Original', x: 286, width: 55, align: 'right' as const },
    { label: 'Final', x: 345, width: 58, align: 'right' as const },
    { label: 'Steward note', x: 411, width: 156, align: 'left' as const },
  ];
  const tableTop = contentTop - 17;
  page.drawRectangle({
    x: 28,
    y: tableTop - 2,
    width: width - 56,
    height: 18,
    color: BLUE,
  });
  columns.forEach((column) =>
    drawCell(
      page,
      column.label,
      column.x,
      tableTop + 4,
      column.width,
      7,
      fonts.bold,
      rgb(1, 1, 1),
      column.align,
    ),
  );

  const rowHeight = 29;
  rows.forEach((car, index) => {
    const adjustment = car.resultAdjustment!;
    const rowY = tableTop - 22 - index * rowHeight;
    if (index % 2 === 1)
      page.drawRectangle({
        x: 28,
        y: rowY - 11,
        width: width - 56,
        height: rowHeight,
        color: ROW_SHADE,
      });
    const cells = [
      car.number || '-',
      car.driver || `Car ${car.number || '-'}`,
      penaltyDecision(adjustment),
      car.bestLap || '-',
      ['DNF', 'DNS', 'DQ'].includes(adjustment.status)
        ? adjustment.status
        : car.adjustedBestLap || car.bestLap || '-',
      adjustment.note || defaultAdjustmentNote(adjustment),
    ];
    columns.forEach((column, cellIndex) =>
      drawCell(
        page,
        cells[cellIndex],
        column.x,
        rowY + 2,
        column.width,
        7.2,
        cellIndex === 2 || cellIndex === 4 ? fonts.bold : fonts.regular,
        cellIndex === 2 || cellIndex === 4 ? NAVY : INK,
        column.align,
      ),
    );
    page.drawText(
      fitText(
        safeText(
          `Class ${car.className || '-'} | Final position P${car.position}`,
        ),
        fonts.regular,
        6.1,
        columns[1].width + columns[2].width + 4,
      ),
      {
        x: columns[1].x,
        y: rowY - 8,
        size: 6.1,
        font: fonts.regular,
        color: MUTED,
      },
    );
    page.drawLine({
      start: { x: 28, y: rowY - 11 },
      end: { x: width - 28, y: rowY - 11 },
      thickness: 0.3,
      color: LINE,
    });
  });

  drawFooter(page, snapshot, pageNumber, totalPages, fonts);
}

function drawLapBreakdownPage({
  page,
  snapshot,
  columns,
  pageNumber,
  totalPages,
  fonts,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  columns: LapBlock[][];
  pageNumber: number;
  totalPages: number;
  fonts: Fonts;
  logo: PDFImage | null;
}) {
  const contentTop = drawDocumentHeader({
    page,
    snapshot,
    title: 'LAP BREAKDOWN',
    label: 'INDIVIDUAL LAP TIMES',
    fonts,
    logo,
  });
  const columnWidth = 171;
  const columnXs = [31, 211, 391];
  const lineHeight = 10.5;
  columnXs.slice(1).forEach((x) =>
    page.drawLine({
      start: { x: x - 8, y: contentTop + 1 },
      end: { x: x - 8, y: 103 },
      thickness: 0.45,
      color: LINE,
    }),
  );

  columns.forEach((blocks, columnIndex) => {
    const x = columnXs[columnIndex];
    let y = contentTop - 11;
    page.drawText('Lap', { x, y, size: 6.2, font: fonts.bold, color: MUTED });
    page.drawText('Lap Tm', {
      x: x + 30,
      y,
      size: 6.2,
      font: fonts.bold,
      color: MUTED,
    });
    page.drawText('Diff', {
      x: x + 82,
      y,
      size: 6.2,
      font: fonts.bold,
      color: MUTED,
    });
    page.drawText('Time of Day', {
      x: x + 115,
      y,
      size: 6.2,
      font: fonts.bold,
      color: MUTED,
    });
    y -= 15;
    blocks.forEach((block) => {
      const title = `(${block.car.number || '-'}) ${block.car.driver || 'Unknown driver'}${block.continued ? ' (cont.)' : ''}`;
      page.drawText(fitText(safeText(title), fonts.bold, 6.6, columnWidth), {
        x,
        y,
        size: 6.6,
        font: fonts.bold,
        color: NAVY,
      });
      page.drawLine({
        start: { x, y: y - 2.5 },
        end: { x: x + columnWidth - 4, y: y - 2.5 },
        thickness: 0.7,
        color: NAVY,
      });
      y -= lineHeight;
      const best = Math.min(
        ...block.laps
          .map((lap) => lap.lapTimeMs ?? lapTimeToMilliseconds(lap.lapTime))
          .filter(Number.isFinite),
      );
      block.laps.forEach((lap) => {
        const lapMs = lap.lapTimeMs ?? lapTimeToMilliseconds(lap.lapTime);
        const isBest = Number.isFinite(best) && lapMs === best;
        const diff =
          Number.isFinite(best) && Number.isFinite(lapMs) && lapMs > best
            ? `+${((lapMs - best) / 1000).toFixed(3)}`
            : '';
        drawRight(
          page,
          String(lap.lapNumber || '-'),
          x + 22,
          y,
          6.25,
          fonts.regular,
          INK,
        );
        drawRight(
          page,
          lap.lapTime || '-',
          x + 76,
          y,
          6.25,
          isBest ? fonts.bold : fonts.regular,
          INK,
        );
        drawRight(page, diff, x + 110, y, 6.1, fonts.regular, MUTED);
        drawRight(
          page,
          formatTimeOfDay(lap.recordedAt),
          x + columnWidth - 4,
          y,
          6.1,
          fonts.regular,
          INK,
        );
        y -= lineHeight;
      });
      y -= 5;
    });
  });
  if (columns.every((column) => column.length === 0))
    page.drawText('No lap passings were recorded for this session.', {
      x: 38,
      y: contentTop - 55,
      size: 10,
      font: fonts.italic,
      color: MUTED,
    });
  drawFooter(page, snapshot, pageNumber, totalPages, fonts);
}

function drawLapChartPage({
  page,
  snapshot,
  cars,
  passings,
  lapNumbers,
  pageNumber,
  totalPages,
  fonts,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  cars: ResultCar[];
  passings: LapPassing[];
  lapNumbers: number[];
  pageNumber: number;
  totalPages: number;
  fonts: Fonts;
  logo: PDFImage | null;
}) {
  const contentTop = drawDocumentHeader({
    page,
    snapshot,
    title: 'LAP CHART',
    label: 'POSITION BY LAP',
    fonts,
    logo,
  });
  const { width } = page.getSize();
  const firstOrder = initialPassingOrder(cars, passings);
  const chartStart = 218;
  const includeGrid = lapNumbers[0] === 1;
  const chartColumns = includeGrid ? [0, ...lapNumbers] : lapNumbers;
  const cellWidth = Math.min(
    31,
    (width - 32 - chartStart) / Math.max(1, chartColumns.length),
  );
  const rowCount = passings.length
    ? Math.max(cars.length, firstOrder.length)
    : 0;
  const rowHeight = Math.min(13.5, 435 / Math.max(1, rowCount));
  const fontSize = Math.max(5.5, Math.min(6.8, rowHeight - 4.8));
  page.drawText('Competitors', {
    x: 34,
    y: contentTop - 11,
    size: 6.5,
    font: fonts.bold,
    color: MUTED,
  });
  page.drawText('Pos', {
    x: 190,
    y: contentTop - 11,
    size: 6.5,
    font: fonts.bold,
    color: MUTED,
  });
  page.drawText('Laps', {
    x: chartStart,
    y: contentTop - 11,
    size: 6.5,
    font: fonts.bold,
    color: MUTED,
  });
  const headerY = contentTop - 28;
  chartColumns.forEach((lap, index) =>
    drawCell(
      page,
      String(lap),
      chartStart + index * cellWidth,
      headerY,
      cellWidth - 2,
      6.3,
      fonts.bold,
      NAVY,
      'center',
    ),
  );
  const orderByLap = new Map(
    lapNumbers.map((lap) => [lap, orderAtLap(passings, lap)]),
  );
  const rowYStart = headerY - 19;
  for (let row = 0; row < rowCount; row += 1) {
    const y = rowYStart - row * rowHeight;
    if (row % 2 === 1)
      page.drawRectangle({
        x: 28,
        y: y - 3,
        width: width - 56,
        height: rowHeight,
        color: ROW_SHADE,
      });
    const entrant = firstOrder[row] || cars[row];
    const entrantLabel = entrant
      ? `${entrant.driver || 'Unknown'} (${entrant.number || '-'})`
      : '-';
    page.drawText(
      fitText(safeText(entrantLabel), fonts.regular, fontSize, 150),
      { x: 34, y, size: fontSize, font: fonts.regular, color: INK },
    );
    drawRight(page, String(row + 1), 204, y, fontSize, fonts.bold, NAVY);
    chartColumns.forEach((lap, index) => {
      const orderedCar =
        lap === 0 ? firstOrder[row] : orderByLap.get(lap)?.[row];
      drawCell(
        page,
        orderedCar?.number || '',
        chartStart + index * cellWidth,
        y,
        cellWidth - 2,
        fontSize,
        fonts.bold,
        INK,
        'center',
      );
    });
    page.drawLine({
      start: { x: 28, y: y - 3 },
      end: { x: width - 28, y: y - 3 },
      thickness: 0.25,
      color: LINE,
    });
  }
  if (!passings.length)
    page.drawText('No lap positions were recorded for this session.', {
      x: 38,
      y: contentTop - 55,
      size: 10,
      font: fonts.italic,
      color: MUTED,
    });
  drawFooter(page, snapshot, pageNumber, totalPages, fonts);
}

function drawDocumentHeader({
  page,
  snapshot,
  title,
  label,
  fonts,
  logo,
}: {
  page: PDFPage;
  snapshot: ResultSnapshot;
  title: string;
  label: string;
  fonts: Fonts;
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
    const fitted = logo.scale(0.27);
    page.drawImage(logo, {
      x: 28,
      y: height - 80,
      width: fitted.width,
      height: fitted.height,
    });
  } else
    page.drawText('CVAR', {
      x: 30,
      y: height - 58,
      size: 22,
      font: fonts.bold,
      color: NAVY,
    });
  drawRight(
    page,
    'OFFICIAL EVENT TIMING',
    width - 28,
    height - 39,
    7,
    fonts.bold,
    NAVY,
  );
  drawRight(page, title, width - 28, height - 59, 17, fonts.bold, NAVY);
  drawRight(page, label, width - 28, height - 74, 7.2, fonts.bold, MUTED);
  const headerY = height - 169;
  page.drawRectangle({
    x: 28,
    y: headerY,
    width: width - 56,
    height: 76,
    color: NAVY,
  });
  page.drawRectangle({
    x: 28,
    y: headerY,
    width: 5,
    height: 76,
    color: YELLOW,
  });
  page.drawText(safeText(snapshot.eventName || 'Canyon Classic'), {
    x: 45,
    y: headerY + 52,
    size: 8,
    font: fonts.bold,
    color: SKY,
  });
  page.drawText(
    fitText(formatSessionName(snapshot.runName), fonts.bold, 17, 330),
    { x: 45, y: headerY + 29, size: 17, font: fonts.bold, color: rgb(1, 1, 1) },
  );
  page.drawText(sessionDescription(snapshot), {
    x: 45,
    y: headerY + 12,
    size: 7.4,
    font: fonts.italic,
    color: rgb(0.78, 0.84, 0.87),
  });
  drawRight(
    page,
    fitText(trackLine(snapshot), fonts.regular, 8.2, 178),
    width - 43,
    headerY + 46,
    8.2,
    fonts.regular,
    rgb(1, 1, 1),
  );
  drawRight(
    page,
    formatDate(snapshot.initializedAt || snapshot.updatedAt),
    width - 43,
    headerY + 27,
    7.7,
    fonts.regular,
    rgb(0.78, 0.84, 0.87),
  );
  drawCheckers(page, width - 91, headerY + 6);
  return headerY;
}

function drawFooter(
  page: PDFPage,
  snapshot: ResultSnapshot,
  pageNumber: number,
  totalPages: number,
  fonts: Fonts,
) {
  const { width } = page.getSize();
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
    font: fonts.bold,
    color: NAVY,
  });
  page.drawText('Results are final only after steward review.', {
    x: 126,
    y: noteY + 5,
    size: 7.5,
    font: fonts.regular,
    color: MUTED,
  });
  drawRight(
    page,
    `Page ${pageNumber} of ${totalPages}`,
    width - 28,
    noteY + 5,
    7.5,
    fonts.bold,
    NAVY,
  );
  page.drawText('Corinthian Vintage Auto Racing', {
    x: 28,
    y: 32,
    size: 7,
    font: fonts.regular,
    color: MUTED,
  });
  drawRight(
    page,
    `Generated ${formatDateTime(snapshot.updatedAt)}`,
    width - 28,
    32,
    7,
    fonts.regular,
    MUTED,
  );
}

function planLapBreakdownPages(cars: ResultCar[], passings: LapPassing[]) {
  const passingsByCar = new Map<string, LapPassing[]>();
  passings.forEach((passing) => {
    const key = passing.registrationKey || passing.registrationNumber;
    passingsByCar.set(key, [...(passingsByCar.get(key) || []), passing]);
  });
  const blocks: LapBlock[] = [];
  cars.forEach((car) => {
    const key = car.registrationKey || car.registrationNumber;
    const laps = [...(passingsByCar.get(key) || [])].sort(
      (left, right) =>
        left.lapNumber - right.lapNumber ||
        Date.parse(left.recordedAt) - Date.parse(right.recordedAt),
    );
    for (let index = 0; index < laps.length; index += 32)
      blocks.push({
        car,
        laps: laps.slice(index, index + 32),
        continued: index > 0,
      });
  });
  if (!blocks.length) return [[[], [], []] as LapBlock[][]];
  const pages: LapBlock[][][] = [];
  let columns: LapBlock[][] = [[], [], []];
  let columnIndex = 0;
  let usedLines = 0;
  blocks.forEach((block) => {
    const neededLines = block.laps.length + 2;
    if (usedLines && usedLines + neededLines > 43) {
      columnIndex += 1;
      usedLines = 0;
    }
    if (columnIndex === 3) {
      pages.push(columns);
      columns = [[], [], []];
      columnIndex = 0;
    }
    columns[columnIndex].push(block);
    usedLines += neededLines;
  });
  pages.push(columns);
  return pages;
}

function planLapChartPages(passings: LapPassing[]) {
  const maxLap = passings.reduce(
    (maximum, passing) => Math.max(maximum, passing.lapNumber),
    0,
  );
  return maxLap
    ? chunk(
        Array.from({ length: maxLap }, (_, index) => index + 1),
        10,
      )
    : [[]];
}

function initialPassingOrder(cars: ResultCar[], passings: LapPassing[]) {
  const firstByKey = new Map<string, LapPassing>();
  passings.forEach((passing) => {
    const key = passing.registrationKey || passing.registrationNumber;
    if (!firstByKey.has(key)) firstByKey.set(key, passing);
  });
  const carByKey = new Map(
    cars.map((car) => [car.registrationKey || car.registrationNumber, car]),
  );
  const ordered = [...firstByKey.entries()]
    .sort(
      (left, right) =>
        Date.parse(left[1].recordedAt) - Date.parse(right[1].recordedAt),
    )
    .flatMap(([key]) => (carByKey.has(key) ? [carByKey.get(key)!] : []));
  const seen = new Set(
    ordered.map((car) => car.registrationKey || car.registrationNumber),
  );
  return [
    ...ordered,
    ...cars.filter(
      (car) => !seen.has(car.registrationKey || car.registrationNumber),
    ),
  ];
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

function drawCheckers(page: PDFPage, x: number, y: number) {
  const size = 6;
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 7; column += 1)
      page.drawRectangle({
        x: x + column * size,
        y: y + row * size,
        width: size,
        height: size,
        color: (row + column) % 2 === 0 ? rgb(1, 1, 1) : YELLOW,
      });
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
  align: 'left' | 'right' | 'center',
) {
  const text = fitText(safeText(value), font, size, width);
  const textWidth = font.widthOfTextAtSize(text, size);
  const textX =
    align === 'right'
      ? x + width - textWidth
      : align === 'center'
        ? x + (width - textWidth) / 2
        : x;
  page.drawText(text, { x: textX, y, size, font, color });
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

function rankCars(
  cars: ResultCar[],
  adjustments: Record<string, ResultAdjustment>,
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
        index === 0 ||
        !Number.isFinite(previousTime) ||
        !Number.isFinite(lapTime)
          ? ''
          : formatGap(lapTime - previousTime),
      gapToLeader:
        index === 0 || !Number.isFinite(leaderTime) || !Number.isFinite(lapTime)
          ? ''
          : formatGap(lapTime - leaderTime),
    };
  });
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

function formatPenalty(seconds: number) {
  return seconds > 0 ? `+${seconds.toFixed(3)}s` : '-';
}

function penaltyDecision(adjustment: ResultAdjustment) {
  return [
    adjustment.penaltySeconds > 0
      ? formatPenalty(adjustment.penaltySeconds)
      : '',
    adjustment.status,
    adjustment.positionOverride ? `P${adjustment.positionOverride}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
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
    registrationKey: stringValue(car.registrationKey),
    registrationNumber: stringValue(car.registrationNumber),
    number: stringValue(car.number),
    driver: stringValue(car.driver),
    groupName: stringValue(car.groupName),
    className: stringValue(car.className),
    position: numberValue(car.position),
    laps: numberValue(car.laps),
    bestLapNumber: numberValue(car.bestLapNumber),
    totalTime: stringValue(car.totalTime),
    bestLap: stringValue(car.bestLap),
    gap: stringValue(car.gap),
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

function sessionDescription(snapshot: ResultSnapshot) {
  const type = snapshot.sessionMode === 'race' ? 'Race' : 'Practice';
  const duration = snapshot.raceTime
    ? ` - ${shortTime(snapshot.raceTime)} elapsed`
    : snapshot.timeToGo
      ? ` - ${shortTime(snapshot.timeToGo)} scheduled`
      : '';
  return safeText(`${type}${duration} - ${snapshot.flag || 'Timing recorded'}`);
}

function trackLine(snapshot: ResultSnapshot) {
  return [snapshot.trackName, formatTrackDistance(snapshot.trackLength)]
    .filter(Boolean)
    .join(' - ');
}
function formatTrackDistance(value: string) {
  const distance = value.split(/[·/]/)[0]?.trim();
  if (!distance) return '';
  return /^\d+(?:\.\d+)?$/.test(distance)
    ? `${distance} miles`
    : distance.replace(/\bmi\b/i, 'miles');
}

function formatSessionName(value: string) {
  const wheelSession = wheelSessionName(value);
  if (wheelSession) return wheelSession;
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
  return `${groupLabel} - ${sessionLabel}`;
}

function wheelSessionName(value: string) {
  const explicitName = value.match(/=(Open|Closed)\s+Wheel\s*$/i)?.[1];
  if (explicitName)
    return `${explicitName[0].toUpperCase()}${explicitName.slice(1).toLowerCase()} Wheel`;
  const code = value.match(/(?:^|[-_=])(OW|CW)(?:$|[-_=])/i)?.[1];
  return code?.toUpperCase() === 'OW'
    ? 'Open Wheel'
    : code?.toUpperCase() === 'CW'
      ? 'Closed Wheel'
      : '';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${day} - ${time}`;
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
function formatTimeOfDay(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
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
function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks;
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
function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
