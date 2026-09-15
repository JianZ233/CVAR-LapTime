export function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(value.trim());
      value = '';
    } else if (character !== '\r' && character !== '\n') {
      value += character;
    }
  }
  fields.push(value.trim());
  return fields;
}

export function createTimingState(options = {}) {
  const classes = new Map();
  const settings = new Map();
  const competitors = new Map();
  const pendingPassings = [];
  const pendingRawRecords = [];
  const seenPassingIds = new Set();
  const commandCounts = new Map();
  const competitorKeysByRegistration = new Map();
  const configuredMode = ['race', 'practice'].includes(options.sessionMode)
    ? options.sessionMode
    : 'auto';
  const streamId =
    options.streamId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let inferredMode = 'practice';
  let rawRecordSequence = 0;
  let runId = '';
  let runName = 'Waiting for session';
  let trackName = options.trackName || 'Hallett Motor Racing Circuit';
  let trackLength = options.trackLength || '1.8 mi · 10 turns';
  let flag = 'NOT ACTIVE';
  let lapsToGo = null;
  let timeToGo = '';
  let timeOfDay = '';
  let raceTime = '';
  let initializedAt = '';
  let seriesCommand = '';
  let seriesPosition = 0;
  let seriesOccurrences = new Map();

  function ensureCompetitor(registrationNumber, occurrence = 0) {
    const keys = competitorKeysByRegistration.get(registrationNumber) || [];
    while (keys.length <= occurrence) {
      const registrationKey =
        keys.length === 0
          ? registrationNumber
          : `${registrationNumber}#${keys.length + 1}`;
      keys.push(registrationKey);
      competitors.set(registrationKey, {
        registrationKey,
        registrationNumber,
        number: registrationNumber,
        sourceNumber: registrationNumber,
        transponderId: '',
        firstName: '',
        lastName: '',
        driver: '',
        car: '',
        nationality: '',
        groupName: '',
        additionalInfo: '',
        classNumber: null,
        laps: 0,
        racePosition: 0,
        racePositionLap: 0,
        lastCompletedLapPosition: 0,
        positionChange: 0,
        practicePosition: 0,
        bestLapNumber: 0,
        latestLapNumber: 0,
        latestScoreType: '',
        totalTimeMs: null,
        lastLapMs: null,
        bestLapMs: null,
        passingCount: 0,
        ambiguousRegistrationNumber: false,
      });
      competitorKeysByRegistration.set(registrationNumber, keys);
    }
    return competitors.get(keys[occurrence]);
  }

  function competitorForSeries(command, registrationNumber, position = 0) {
    if (seriesCommand !== command || (position && position <= seriesPosition)) {
      seriesCommand = command;
      seriesPosition = 0;
      seriesOccurrences = new Map();
    }
    if (position) seriesPosition = position;
    const occurrence = seriesOccurrences.get(registrationNumber) || 0;
    seriesOccurrences.set(registrationNumber, occurrence + 1);
    return ensureCompetitor(registrationNumber, occurrence);
  }

  function competitorForDefinition(command, fields) {
    const registrationNumber = fields[1];
    const candidates = (
      competitorKeysByRegistration.get(registrationNumber) || []
    ).map((key) => competitors.get(key));
    const transponderId = command === '$A' ? fields[3] : '';
    const driver = [fields[4], fields[5]].filter(Boolean).join(' ').trim();
    const matched = candidates.find(
      (car) =>
        (transponderId && car.transponderId === transponderId) ||
        (driver && car.driver === driver),
    );
    return matched || competitorForSeries(command, registrationNumber);
  }

  function disambiguateDisplayNumbers(registrationNumber) {
    const used = new Set();
    for (const key of competitorKeysByRegistration.get(registrationNumber) ||
      []) {
      const car = competitors.get(key);
      const base = car.sourceNumber || registrationNumber;
      let displayNumber = base;
      let suffix = 0;
      while (used.has(displayNumber.toLowerCase())) {
        displayNumber = `${base}${alphabeticSuffix(suffix)}`;
        suffix += 1;
      }
      car.number = displayNumber;
      used.add(displayNumber.toLowerCase());
    }
  }

  function apply(line) {
    const fields = parseCsvLine(line);
    const observedAt = new Date().toISOString();
    const [command] = fields;
    rawRecordSequence += 1;
    pendingRawRecords.push({
      id: `${streamId}-${String(rawRecordSequence).padStart(10, '0')}`,
      sequence: rawRecordSequence,
      command: command || 'UNKNOWN',
      fields,
      line,
      observedAt,
    });
    commandCounts.set(
      command || 'UNKNOWN',
      (commandCounts.get(command || 'UNKNOWN') || 0) + 1,
    );
    if (fields.length < 2) return false;

    if (command === '$I') {
      classes.clear();
      settings.clear();
      competitors.clear();
      competitorKeysByRegistration.clear();
      seenPassingIds.clear();
      runId = '';
      flag = 'NOT ACTIVE';
      lapsToGo = null;
      timeToGo = '';
      timeOfDay = fields[1] || '';
      raceTime = '';
      initializedAt = observedAt;
      return true;
    }

    if (command === '$B') {
      runId = fields[1] || runId;
      runName = fields[2] || fields[1] || runName;
      const normalized = runName.toLowerCase();
      if (/race|heat|feature|final/.test(normalized)) inferredMode = 'race';
      if (/practice|qual|warm.?up|test/.test(normalized))
        inferredMode = 'practice';
      return true;
    }

    if (command === '$C') {
      classes.set(Number(fields[1]), fields[2] || `Class ${fields[1]}`);
      return true;
    }

    if (command === '$E') {
      if (fields[1]) settings.set(fields[1].toUpperCase(), fields[2] || '');
      const setting = fields[1]?.toUpperCase();
      if (setting === 'TRACKNAME' && fields[2]) trackName = fields[2];
      if (setting === 'TRACKLENGTH' && fields[2]) trackLength = fields[2];
      return true;
    }

    if (command === '$A') {
      const car = competitorForDefinition(command, fields);
      car.sourceNumber = fields[2] || car.sourceNumber;
      car.transponderId = fields[3] || car.transponderId;
      car.firstName = fields[4] || car.firstName;
      car.lastName = fields[5] || car.lastName;
      car.driver = [car.firstName, car.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      car.nationality = fields[6] || car.nationality;
      car.groupName = formatGroupName(car.nationality);
      car.classNumber = numberOrNull(fields[7]);
      disambiguateDisplayNumbers(car.registrationNumber);
      return true;
    }

    if (command === '$COMP') {
      const car = competitorForDefinition(command, fields);
      car.sourceNumber = fields[2] || car.sourceNumber;
      car.classNumber = numberOrNull(fields[3]);
      car.firstName = fields[4] || car.firstName;
      car.lastName = fields[5] || car.lastName;
      car.driver = [car.firstName, car.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      car.nationality = fields[6] || car.nationality;
      car.groupName = formatGroupName(car.nationality);
      car.additionalInfo = fields[7] || car.additionalInfo;
      disambiguateDisplayNumbers(car.registrationNumber);
      return true;
    }

    if (command === '$F') {
      lapsToGo = numberOrNull(fields[1]);
      timeToGo = fields[2] || '';
      timeOfDay = fields[3] || '';
      raceTime = fields[4] || '';
      flag = (fields[5] || 'NOT ACTIVE').trim().toUpperCase();
      return true;
    }

    if (command === '$G') {
      const position = numberOrZero(fields[1]);
      const car = competitorForSeries(command, fields[2], position);
      const laps = numberOrZero(fields[3]);
      if (position > 0 && laps > car.racePositionLap) {
        car.positionChange =
          car.racePositionLap > 0 && car.lastCompletedLapPosition > 0
            ? car.lastCompletedLapPosition - position
            : 0;
        car.lastCompletedLapPosition = position;
        car.racePositionLap = laps;
      }
      car.racePosition = position;
      car.laps = laps;
      car.totalTimeMs = scoreTimeToMilliseconds(fields[4]);
      return true;
    }

    if (command === '$H') {
      const position = numberOrZero(fields[1]);
      const car = competitorForSeries(command, fields[2], position);
      car.practicePosition = position;
      car.bestLapNumber = numberOrZero(fields[3]);
      car.bestLapMs = scoreTimeToMilliseconds(fields[4]);
      return true;
    }

    if (command === '$SP' || command === '$SR') {
      const position = numberOrZero(fields[1]);
      const car = competitorForSeries(command, fields[2], position);
      car.latestLapNumber = numberOrZero(fields[3]);
      car.latestScoreType = command.slice(1);
      car.lastLapMs = scoreTimeToMilliseconds(fields[4]);
      car.laps = Math.max(car.laps, car.latestLapNumber);
      return true;
    }

    if (command === '$J') {
      const car = ensureCompetitor(fields[1]);
      const lap = scoreTimeToMilliseconds(fields[2]);
      const total = scoreTimeToMilliseconds(fields[3]);
      car.lastLapMs = lap;
      car.totalTimeMs = total;
      if (lap !== null && (car.bestLapMs === null || lap < car.bestLapMs))
        car.bestLapMs = lap;
      car.passingCount = Math.max(car.passingCount + 1, car.laps);
      car.laps = Math.max(car.laps, car.passingCount);
      const duplicateCount =
        competitorKeysByRegistration.get(car.registrationNumber)?.length || 1;
      car.ambiguousRegistrationNumber = duplicateCount > 1;
      const passingId = `${car.registrationKey}|${fields[3] || fields[2]}|${car.passingCount}`;
      if (!seenPassingIds.has(passingId)) {
        seenPassingIds.add(passingId);
        pendingPassings.push({
          id: passingId,
          registrationKey: car.registrationKey,
          registrationNumber: car.registrationNumber,
          transponderId: car.transponderId,
          number: car.number,
          sourceNumber: car.sourceNumber,
          driver: car.driver,
          car: car.car,
          groupName: car.groupName,
          nationality: car.nationality,
          classNumber: car.classNumber,
          className: classNameFor(car.classNumber),
          additionalInfo: car.additionalInfo,
          ambiguousRegistrationNumber: duplicateCount > 1,
          lapNumber: car.passingCount,
          lapTime: formatLapTime(lap),
          lapTimeMs: lap,
          totalTime: fields[3] || '',
          totalTimeMs: total,
          recordedAt: new Date().toISOString(),
        });
      }
      return true;
    }

    if (command === '$COR') {
      const car = ensureCompetitor(fields[1]);
      car.number = fields[2] || car.number;
      car.laps = numberOrZero(fields[3]);
      car.totalTimeMs = scoreTimeToMilliseconds(fields[4]);
      return true;
    }

    return false;
  }

  function snapshot() {
    const sessionMode =
      configuredMode === 'auto' ? inferredMode : configuredMode;
    const positionKey =
      sessionMode === 'race' ? 'racePosition' : 'practicePosition';
    const ordered = deduplicateCompetitors([...competitors.values()])
      .filter(
        (car) =>
          car.racePosition || car.practicePosition || car.lastLapMs !== null,
      )
      .sort((a, b) => {
        const bestLapDifference =
          (a.bestLapMs ?? Number.MAX_SAFE_INTEGER) -
          (b.bestLapMs ?? Number.MAX_SAFE_INTEGER);
        if (bestLapDifference !== 0) return bestLapDifference;
        return (
          (a[positionKey] || Number.MAX_SAFE_INTEGER) -
          (b[positionKey] || Number.MAX_SAFE_INTEGER)
        );
      });
    const leader = ordered[0];

    return {
      eventName: options.eventName || '20th Annual Mike Stephens Classic',
      trackName,
      trackLength,
      runId,
      runName,
      sessionMode,
      flag,
      lapsToGo,
      timeToGo,
      timeOfDay,
      raceTime,
      initializedAt,
      classes: [...classes.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.id - b.id),
      groups: [
        ...new Set(
          [...competitors.values()].map((car) => car.groupName).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
      settings: Object.fromEntries(settings),
      source: {
        protocol: 'RMonitor',
        recordsCaptured: rawRecordSequence,
        commandCounts: Object.fromEntries(commandCounts),
      },
      updatedAt: new Date().toISOString(),
      cars: ordered.map((car, index) => ({
        registrationKey: car.registrationKey,
        registrationNumber: car.registrationNumber,
        number: car.number,
        driver: car.driver,
        car: car.car,
        groupName: car.groupName,
        classNumber: car.classNumber,
        className: classNameFor(car.classNumber),
        position: index + 1,
        racePosition: car.racePosition || 0,
        positionChange: car.positionChange || 0,
        laps: car.laps,
        bestLapNumber: car.bestLapNumber,
        latestLapNumber: car.latestLapNumber,
        latestScoreType: car.latestScoreType,
        ambiguousRegistrationNumber:
          (competitorKeysByRegistration.get(car.registrationNumber)?.length ||
            1) > 1,
        totalTime: formatLapTime(car.totalTimeMs),
        lastLap: formatLapTime(car.lastLapMs),
        bestLap: formatLapTime(car.bestLapMs),
        gap: formatGap(leader, car),
      })),
    };
  }

  function drainPassings() {
    return pendingPassings.splice(0);
  }

  function drainRawRecords() {
    return pendingRawRecords.splice(0);
  }

  function registrations() {
    return [...competitors.values()].map((car) => ({
      registrationKey: car.registrationKey,
      registrationNumber: car.registrationNumber,
      transponderId: car.transponderId,
      number: car.number,
      sourceNumber: car.sourceNumber,
      firstName: car.firstName,
      lastName: car.lastName,
      driver: car.driver,
      car: car.car,
      nationality: car.nationality,
      groupName: car.groupName,
      additionalInfo: car.additionalInfo,
      classNumber: car.classNumber,
      className: classNameFor(car.classNumber),
      ambiguousRegistrationNumber:
        (competitorKeysByRegistration.get(car.registrationNumber)?.length ||
          1) > 1,
    }));
  }

  function classNameFor(classNumber) {
    return (
      classes.get(classNumber) ||
      (classNumber !== null ? `Class ${classNumber}` : '')
    );
  }

  return { apply, snapshot, drainPassings, drainRawRecords, registrations };
}

export function timeToMilliseconds(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.replace(/^\+/, '');
  const match = normalized.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return (
    ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) *
      1000 +
    Number(match[4])
  );
}

export function formatLapTime(milliseconds) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '';
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = Math.floor(milliseconds % 1000);
  const body = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  return hours ? `${hours}:${body}` : body;
}

function formatGap(leader, car) {
  if (!leader || leader === car) return '—';
  if (leader.bestLapMs !== null && car.bestLapMs !== null)
    return `+${((car.bestLapMs - leader.bestLapMs) / 1000).toFixed(3)}`;
  return '';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function scoreTimeToMilliseconds(value) {
  const milliseconds = timeToMilliseconds(value);
  return milliseconds && milliseconds > 0 ? milliseconds : null;
}

function formatGroupName(value) {
  if (!value) return '';
  return /^\d+[a-z]?$/i.test(value) ? `Group ${value}` : value;
}

function deduplicateCompetitors(cars) {
  const selectedByDriver = new Map();

  for (const car of cars) {
    const driverKey = normalizeDriverName(car.driver);
    if (!driverKey) continue;
    const selected = selectedByDriver.get(driverKey);
    if (!selected || compareTimingCompleteness(car, selected) >= 0)
      selectedByDriver.set(driverKey, car);
  }

  return cars.filter((car) => {
    const driverKey = normalizeDriverName(car.driver);
    return !driverKey || selectedByDriver.get(driverKey) === car;
  });
}

function compareTimingCompleteness(left, right) {
  return (
    numberOrZero(left.laps) - numberOrZero(right.laps) ||
    numberOrZero(left.latestLapNumber) - numberOrZero(right.latestLapNumber) ||
    Number(left.totalTimeMs !== null) - Number(right.totalTimeMs !== null) ||
    Number(left.bestLapMs !== null) - Number(right.bestLapMs !== null)
  );
}

function normalizeDriverName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');
}

function alphabeticSuffix(index) {
  let value = index + 1;
  let suffix = '';
  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return suffix;
}
