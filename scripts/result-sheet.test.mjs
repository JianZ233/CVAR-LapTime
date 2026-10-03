import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';

import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';

import { loadResultSheet, readLogo, samples } from './result-sheet-samples.mjs';

const { createResultSheet } = await loadResultSheet();
const logo = await readLogo();
const UNMAPPED = String.fromCodePoint(0xfffd);

async function buildSheet(name) {
  const { snapshot, passings, adjustments } = samples[name]();
  const bytes = await createResultSheet(snapshot, passings, logo, adjustments);
  return readSheet(bytes);
}

/** Reads the text layer back through each font's ToUnicode map, the same
 * way a PDF viewer does for search and copy. */
async function readSheet(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = document.getPages().map((page) => {
    const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
    const unicode = new Map();
    for (const [name, ref] of fonts.entries()) {
      const font = document.context.lookup(ref, PDFDict);
      const cmap = decodeStream(font.lookup(PDFName.of('ToUnicode')));
      const glyphs = new Map();
      for (const [, glyph, text] of cmap.matchAll(
        /<([0-9a-f]{4})> <([0-9a-f]+)>/gi,
      ))
        glyphs.set(
          glyph.toLowerCase(),
          String.fromCharCode(
            ...text.match(/.{4}/g).map((code) => Number.parseInt(code, 16)),
          ),
        );
      unicode.set(name.asString(), glyphs);
    }
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFRawStream
        ? [contents]
        : contents.asArray().map((ref) => document.context.lookup(ref));
    const items = [];
    let glyphs = new Map();
    let at = { x: 0, y: 0 };
    for (const stream of streams)
      for (const [, font, x, y, hex] of decodeStream(stream).matchAll(
        /(\/\S+) [\d.]+ Tf|1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm|<([0-9a-f]*)> Tj/gi,
      )) {
        if (font) glyphs = unicode.get(font) || new Map();
        else if (x !== undefined) at = { x: Number(x), y: Number(y) };
        else
          items.push({
            ...at,
            text: (hex.match(/.{4}/g) || [])
              .map((glyph) => glyphs.get(glyph.toLowerCase()) ?? UNMAPPED)
              .join(''),
          });
      }
    const { width, height } = page.getSize();
    return {
      items,
      text: items.map((item) => item.text).join('\n'),
      width,
      height,
    };
  });
  return { document, pages, text: pages.map((page) => page.text).join('\n') };
}

function decodeStream(stream) {
  return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
}

function assertIncludes(text, values) {
  for (const value of values)
    assert.ok(text.includes(value), `missing "${value}"`);
}

test('race sheet shows the classification, steward decisions and lap pages', async () => {
  const sheet = await buildSheet('race-penalties');
  assert.equal(sheet.pages.length, 3);
  sheet.pages.forEach((page, index) => {
    assert.deepEqual([page.width, page.height], [612, 792]);
    assertIncludes(page.text, ['PROVISIONAL', `Page ${index + 1} of 3`]);
  });
  assert.equal(
    sheet.document.getTitle(),
    'Group 6 · Race 3 · Provisional results · 20th Annual Mike Stephens Classic',
  );
  assert.equal(sheet.document.getAuthor(), 'Corinthian Vintage Auto Racing');

  const [classification, decisions, laps] = sheet.pages.map(
    (page) => page.text,
  );
  assertIncludes(classification, [
    'GROUP 6 · RACE 3',
    '20th Annual Mike Stephens Classic',
    'Hallett Motor Racing Circuit · 1.8 mi',
    'Checkered flag',
    '2:30 PM CT',
    'Sam LeComte',
    '1969 Lotus 61',
    'PEN +5s',
    'DNF',
    'DNS',
    'DQ',
    'POSTED AT',
    "STEWARD'S INITIALS",
    'CLASS WINNERS',
  ]);
  assertIncludes(decisions, [
    'PENALTIES',
    'Avoidable contact with #14 at turn 1 on',
    'P6 → P4',
    'P4 → P14',
    'LAP BREAKDOWN',
  ]);
  assertIncludes(laps, ['LAP CHART', '1st #65 Sam LeComte']);
  assert.doesNotMatch(sheet.text, /unofficial|official event timing/i);
  assert.ok(!sheet.text.includes(UNMAPPED), 'every glyph maps back to text');
});

test('race classification keeps the steward order and CVAR points', async () => {
  const { items } = (await buildSheet('race-penalties')).pages[0];
  const onRow = (item, from, to) =>
    items.find(
      (other) =>
        Math.abs(other.y - item.y) < 1.5 && other.x > from && other.x < to,
    )?.text;
  const rows = items
    .filter((item) => item.x < 60 && /^\d+$/.test(item.text))
    .map((item) => [item.text, onRow(item, 62, 92), onRow(item, 548, 576)])
    .filter(([, number]) => /^\d+$/.test(number || ''))
    .map((row) => row.join(' '));
  // Position override, DNF/DNS/DQ ordering and feature-race points.
  assert.deepEqual(rows, [
    '1 65 4',
    '2 14 4',
    '3 42 4',
    '4 23 4',
    '5 7 4',
    '6 88 4',
    '7 191 4',
    '8 31 4',
    '9 96 4',
    '10 165 4',
    '11 44 4',
    '12 5 1',
    '13 114 0',
    '14 711 0',
  ]);
});

test('practice sheet is ordered by best lap and has no points column', async () => {
  const sheet = await buildSheet('practice-qualifying');
  assert.equal(sheet.pages.length, 3);
  const classification = sheet.pages[0].text;
  assertIncludes(classification, [
    'GROUP 6 · PRACTICE / QUALIFYING',
    'classified by best lap time',
    'FASTEST IN CLASS',
    'PEN +2s',
  ]);
  assert.ok(!classification.includes('PTS'));
  // The +2s penalty drops #14's 2:00.638 behind P1's 2:00.871.
  assert.match(classification, /FASTEST LAP\n2:00\.871\n#65 Sam LeComte/);
});

test('a 44-car field runs the classification over two pages', async () => {
  const sheet = await buildSheet('large-field');
  assert.equal(sheet.pages.length, 8);
  assertIncludes(sheet.pages[0].text, [
    'Classification continues on the next page',
  ]);
  assert.ok(!sheet.pages[0].text.includes('POSTED AT'));
  assertIncludes(sheet.pages[1].text, [
    'CLASSIFICATION, CONTINUED',
    'Reese Abernathy',
    'STARTERS',
    'POSTED AT',
  ]);
  assertIncludes(sheet.text, ['LAP CHART', 'CONTINUED']);
});

test('long names wrap or shorten and keep their accents', async () => {
  const sheet = await buildSheet('long-names');
  assert.equal(sheet.pages.length, 3);
  assertIncludes(sheet.pages[0].text, [
    'GROUPS 1, 2 & 7 · 1.7L AND ABOVE',
    'CLOSED WHEEL',
    'José Ñúñez-Iturbe',
    'Zoë Ångström-Fairweather',
    '#1932 Bartholomew Montgomery-Fitzwilliam III',
  ]);
  assertIncludes(sheet.pages[1].text, [
    'Montgomery-Fitzwilliam III',
    'failing to follow a black-flag instruction',
  ]);
});

test('letter run-group codes read as a group name', async () => {
  const sheet = await buildSheet('letter-group');
  assert.equal(sheet.pages.length, 2);
  assertIncludes(sheet.pages[0].text, [
    'GROUP SE · RACE 1',
    'steward decisions have been recorded.',
  ]);
});

test('every font is an embedded subset of the Archivo cuts', async () => {
  const { document } = await buildSheet('letter-group');
  const fonts = new Map();
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.lookup(PDFName.of('Type'))?.asString() !== '/FontDescriptor')
      continue;
    const name = object.lookup(PDFName.of('FontName')).asString();
    const program = object.lookup(PDFName.of('FontFile2'));
    assert.ok(program, `${name} is embedded`);
    fonts.set(name, decodePDFRawStream(program).decode().length);
  }
  assert.equal(fonts.size, 6);
  for (const [name, size] of fonts) {
    const file = name.replace(/^\//, '').replace(/-\d+$/, '');
    const { size: full } = await stat(
      new URL(`../assets/fonts/archivo/${file}.ttf`, import.meta.url),
    );
    assert.ok(size < full / 3, `${file} is subset (${size} of ${full} bytes)`);
  }
});

test('an empty session still builds a sheet', async () => {
  const { snapshot } = samples['letter-group']();
  const bytes = await createResultSheet(
    { ...snapshot, cars: [] },
    [],
    null,
    {},
  );
  const sheet = await readSheet(bytes);
  assert.equal(sheet.pages.length, 2);
  assertIncludes(sheet.text, [
    'No timed cars were recorded for this session.',
    'No lap passings were recorded for this session.',
    'POSTED AT',
  ]);
});
