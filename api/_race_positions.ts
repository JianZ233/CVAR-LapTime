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

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
