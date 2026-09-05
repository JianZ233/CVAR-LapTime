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
  const competitors = new Map();
  const configuredMode = ['race', 'practice'].includes(options.sessionMode) ? options.sessionMode : 'auto';
  let inferredMode = 'practice';
  let runName = 'Waiting for session';
  let trackName = options.trackName || 'Eagles Canyon Raceway';
  let trackLength = options.trackLength || '2.7 mi · 15 turns';
  let flag = 'NOT ACTIVE';
  let lapsToGo = null;
  let timeToGo = '';

  function ensureCompetitor(registrationNumber) {
    if (!competitors.has(registrationNumber)) {
      competitors.set(registrationNumber, {
        registrationNumber,
        number: registrationNumber,
        driver: '',
        car: '',
        classNumber: null,
        laps: 0,
        racePosition: 0,
        practicePosition: 0,
        totalTimeMs: null,
        lastLapMs: null,
        bestLapMs: null,
      });
    }
    return competitors.get(registrationNumber);
  }

  function apply(line) {
    const fields = parseCsvLine(line);
    if (fields.length < 2) return false;
    const [command] = fields;

    if (command === '$I') {
      classes.clear();
      competitors.clear();
      flag = 'NOT ACTIVE';
      lapsToGo = null;
      timeToGo = '';
      return true;
    }

    if (command === '$B') {
      runName = fields[2] || fields[1] || runName;
      const normalized = runName.toLowerCase();
      if (/race|heat|feature|final/.test(normalized)) inferredMode = 'race';
      if (/practice|qual|warm.?up|test/.test(normalized)) inferredMode = 'practice';
      return true;
    }

    if (command === '$C') {
      classes.set(Number(fields[1]), fields[2] || `Class ${fields[1]}`);
      return true;
    }

    if (command === '$E') {
      const setting = fields[1]?.toUpperCase();
      if (setting === 'TRACKNAME' && fields[2]) trackName = fields[2];
      if (setting === 'TRACKLENGTH' && fields[2]) trackLength = fields[2];
      return true;
    }

    if (command === '$A') {
      const car = ensureCompetitor(fields[1]);
      car.number = fields[2] || car.number;
      car.driver = [fields[4], fields[5]].filter(Boolean).join(' ').trim();
      car.car = fields[6] || '';
      car.classNumber = numberOrNull(fields[7]);
      return true;
    }

    if (command === '$COMP') {
      const car = ensureCompetitor(fields[1]);
      car.number = fields[2] || car.number;
      car.classNumber = numberOrNull(fields[3]);
      car.driver = [fields[4], fields[5]].filter(Boolean).join(' ').trim();
      car.car = fields[7] || fields[6] || '';
      return true;
    }

    if (command === '$F') {
      lapsToGo = numberOrNull(fields[1]);
      timeToGo = fields[2] || '';
      flag = (fields[5] || 'NOT ACTIVE').trim().toUpperCase();
      return true;
    }

    if (command === '$G') {
      const car = ensureCompetitor(fields[2]);
      car.racePosition = numberOrZero(fields[1]);
      car.laps = numberOrZero(fields[3]);
      car.totalTimeMs = timeToMilliseconds(fields[4]);
      return true;
    }

    if (command === '$H') {
      const car = ensureCompetitor(fields[2]);
      car.practicePosition = numberOrZero(fields[1]);
      car.bestLapMs = timeToMilliseconds(fields[4]);
      return true;
    }

    if (command === '$J') {
      const car = ensureCompetitor(fields[1]);
      const lap = timeToMilliseconds(fields[2]);
      car.lastLapMs = lap;
      car.totalTimeMs = timeToMilliseconds(fields[3]);
      if (lap !== null && (car.bestLapMs === null || lap < car.bestLapMs)) car.bestLapMs = lap;
      return true;
    }

    if (command === '$COR') {
      const car = ensureCompetitor(fields[1]);
      car.number = fields[2] || car.number;
      car.laps = numberOrZero(fields[3]);
      car.totalTimeMs = timeToMilliseconds(fields[4]);
      return true;
    }

    return false;
  }

  function snapshot() {
    const sessionMode = configuredMode === 'auto' ? inferredMode : configuredMode;
    const positionKey = sessionMode === 'race' ? 'racePosition' : 'practicePosition';
    const ordered = [...competitors.values()]
      .filter((car) => car.racePosition || car.practicePosition || car.lastLapMs !== null)
      .sort((a, b) => {
        const aPosition = a[positionKey] || Number.MAX_SAFE_INTEGER;
        const bPosition = b[positionKey] || Number.MAX_SAFE_INTEGER;
        if (aPosition !== bPosition) return aPosition - bPosition;
        return (a.bestLapMs ?? Number.MAX_SAFE_INTEGER) - (b.bestLapMs ?? Number.MAX_SAFE_INTEGER);
      });
    const leader = ordered[0];

    return {
      eventName: options.eventName || 'Canyon Classic at ECR',
      trackName,
      trackLength,
      runName,
      sessionMode,
      flag,
      lapsToGo,
      timeToGo,
      updatedAt: new Date().toISOString(),
      cars: ordered.map((car, index) => ({
        registrationNumber: car.registrationNumber,
        number: car.number,
        driver: car.driver,
        car: car.car,
        className: classes.get(car.classNumber) || (car.classNumber !== null ? `Class ${car.classNumber}` : ''),
        position: car[positionKey] || index + 1,
        laps: car.laps,
        lastLap: formatLapTime(car.lastLapMs),
        bestLap: formatLapTime(car.bestLapMs),
        gap: formatGap(sessionMode, leader, car),
      })),
    };
  }

  return { apply, snapshot };
}

export function timeToMilliseconds(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.replace(/^\+/, '');
  const match = normalized.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
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

function formatGap(mode, leader, car) {
  if (!leader || leader === car) return '—';
  if (mode === 'practice' && leader.bestLapMs !== null && car.bestLapMs !== null) return `+${((car.bestLapMs - leader.bestLapMs) / 1000).toFixed(3)}`;
  if (mode === 'race') {
    const lapDifference = leader.laps - car.laps;
    if (lapDifference > 0) return `${lapDifference} lap${lapDifference === 1 ? '' : 's'}`;
    if (leader.totalTimeMs !== null && car.totalTimeMs !== null) return `+${Math.max(0, (car.totalTimeMs - leader.totalTimeMs) / 1000).toFixed(3)}`;
  }
  return '';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}
