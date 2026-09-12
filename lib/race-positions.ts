export function parseRacePositionHash(value: unknown) {
  const entries: Array<[string, unknown]> = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 2)
      entries.push([String(value[index]), value[index + 1]]);
  } else if (value && typeof value === 'object') {
    entries.push(...Object.entries(value as Record<string, unknown>));
  }

  const positions: Record<string, number> = {};
  for (const [registrationNumber, rawPosition] of entries) {
    const position = Number(rawPosition);
    if (Number.isInteger(position) && position > 0)
      positions[registrationNumber] = position;
  }
  return positions;
}

export function racePositionForCar(
  car: Record<string, unknown>,
  positions: Record<string, number>,
) {
  const embedded = Number(car.racePosition);
  if (Number.isInteger(embedded) && embedded > 0) return embedded;
  const registrationKey = stringValue(car.registrationKey);
  const registrationNumber = stringValue(car.registrationNumber);
  return positions[registrationKey] || positions[registrationNumber] || 0;
}

export function hydrateRacePositions(
  snapshot: unknown,
  positions: Record<string, number>,
) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const value = snapshot as Record<string, unknown>;
  if (!Array.isArray(value.cars)) return snapshot;
  return {
    ...value,
    cars: value.cars.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const car = item as Record<string, unknown>;
      return { ...car, racePosition: racePositionForCar(car, positions) };
    }),
  };
}

export function parseRacePositionsFromRawRecords(value: unknown) {
  const positions: Record<string, number> = {};
  if (!Array.isArray(value)) return positions;
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    try {
      const record = JSON.parse(raw) as Record<string, unknown>;
      if (record.command !== '$G' || !Array.isArray(record.fields)) continue;
      const position = Number(record.fields[1]);
      const registrationNumber = record.fields[2];
      if (
        Number.isInteger(position) &&
        position > 0 &&
        typeof registrationNumber === 'string' &&
        registrationNumber
      )
        positions[registrationNumber] = position;
    } catch {
      // Ignore malformed archive records and continue recovering valid positions.
    }
  }
  return positions;
}

export function snapshotUsesRacePositions(snapshot: unknown) {
  let value = snapshot;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== 'object') return false;
  const timing = value as Record<string, unknown>;
  return (
    timing.sessionMode === 'race' ||
    (typeof timing.runName === 'string' &&
      /\brace(?:\s*\d+)?\b/i.test(timing.runName))
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
