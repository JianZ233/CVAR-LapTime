import net from 'node:net';

const port = Number(process.env.ORBITS_PORT || 50000);
const cars = [
  { reg: 'CVAR65', number: '65', first: 'Sam', last: 'LeComte', model: '1965 Lotus 23B', classNumber: 7, base: 120_871 },
  { reg: 'CVAR14', number: '14', first: 'Morgan', last: 'Ellis', model: '1972 Porsche 914', classNumber: 7, base: 121_442 },
  { reg: 'CVAR42', number: '42', first: 'Alex', last: 'Rivera', model: '1967 Alfa Romeo GTV', classNumber: 2, base: 122_205 },
];

const server = net.createServer((socket) => {
  console.log('Relay connected to the simulated Orbits feed.');
  socket.write('$I,"09:00:00.000","05 sep 26"\r\n');
  socket.write('$B,1,"Groups 2 & 7 Test & Tune"\r\n');
  socket.write('$C,2,"Group 2"\r\n$C,7,"Group 7"\r\n');
  socket.write('$E,"TRACKNAME","Eagles Canyon Raceway"\r\n');
  socket.write('$E,"TRACKLENGTH","2.7 mi · 15 turns"\r\n');
  cars.forEach((car) => socket.write(`$A,"${car.reg}","${car.number}",${10000 + Number(car.number)},"${car.first}","${car.last}","${car.model}",${car.classNumber}\r\n`));

  let lap = 0;
  const best = new Map();
  const timer = setInterval(() => {
    const car = cars[lap % cars.length];
    const carLap = Math.floor(lap / cars.length) + 1;
    const lapMs = car.base + Math.round((Math.random() - 0.35) * 2_500);
    best.set(car.reg, Math.min(best.get(car.reg) ?? Infinity, lapMs));
    const ranked = [...cars].sort((a, b) => (best.get(a.reg) ?? Infinity) - (best.get(b.reg) ?? Infinity));
    socket.write(`$F,0,"00:18:${String(Math.max(0, 59 - carLap)).padStart(2, '0')}.000","09:10:00.000","00:01:00.000","GREEN"\r\n`);
    socket.write(`$J,"${car.reg}","${protocolTime(lapMs)}","${protocolTime(lapMs * carLap)}"\r\n`);
    ranked.forEach((entry, index) => socket.write(`$H,${index + 1},"${entry.reg}",${carLap},"${protocolTime(best.get(entry.reg) ?? entry.base)}"\r\n`));
    lap += 1;
  }, 1_500);
  socket.on('close', () => clearInterval(timer));
});

server.listen(port, '127.0.0.1', () => console.log(`Simulated RMonitor feed listening on 127.0.0.1:${port}`));

function protocolTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
