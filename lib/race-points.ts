type RacePointCar = {
  className?: string;
  laps?: number;
  points?: number | null;
  resultAdjustment?: { status?: string };
};

const FEATURE_RACE_NUMBER = 3;

export function applyCvarRacePoints<T extends RacePointCar>(
  runName: string,
  cars: T[],
): Array<T & { points: number }> {
  const featureRace = raceNumberFromRunName(runName) === FEATURE_RACE_NUMBER;
  const classFinishers = new Map<string, number>();

  return cars.map((car) => {
    const status = car.resultAdjustment?.status?.toUpperCase() || '';
    const started = finiteLaps(car.laps) > 0 && status !== 'DNS';
    const classified = started && !['DNF', 'DQ'].includes(status);
    const classKey = car.className?.trim().toUpperCase() || '';
    let classPosition = 0;

    if (classified && classKey) {
      classPosition = (classFinishers.get(classKey) || 0) + 1;
      classFinishers.set(classKey, classPosition);
    }

    const suppliedPoints = finitePoints(car.points);
    const calculatedPoints =
      status === 'DQ'
        ? 0
        : (started ? 1 : 0) +
          (classified ? 1 : 0) +
          (featureRace ? featurePositionPoints(classPosition) : 0);

    return {
      ...car,
      points: suppliedPoints ?? calculatedPoints,
    };
  });
}

export function raceNumberFromRunName(runName: string) {
  const raceName = runName.match(/\brace\s*(\d+)\b/i)?.[1];
  const raceCode = runName.match(/(?:^|[-_=])r(\d+)(?=$|[-_=])/i)?.[1];
  const value = Number(raceName || raceCode);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function featurePositionPoints(classPosition: number) {
  if (classPosition >= 1 && classPosition <= 4) return 2;
  if (classPosition >= 5 && classPosition <= 6) return 1;
  return 0;
}

function finiteLaps(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function finitePoints(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}
