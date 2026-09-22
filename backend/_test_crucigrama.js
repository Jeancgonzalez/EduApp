require('dotenv').config();
const { sequelize } = require('./src/config/database');
const Game = require('./src/models/game.model');
require('./src/models/associations');

const generarCrucigrama = (palabrasInput, tamano = 15) => {
  const size = tamano;
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const colocadas = [];
  const noColocadas = [];

  const palabras = palabrasInput
    .map(p => ({ palabra: (p.palabra || '').toUpperCase().replace(/\s/g, ''), pista: (p.pista || '').trim() }))
    .filter(p => p.palabra.length > 0)
    .filter(p => {
      if (p.palabra.length > size) { noColocadas.push(`${p.palabra} (demasiado larga)`); return false; }
      return true;
    })
    .sort((a, b) => b.palabra.length - a.palabra.length)
    .map((p, i) => ({ ...p, numero: i + 1 }));

  if (palabras.length === 0) return { grid, colocadas, size, noColocadas };

  const escribir = (pw, fila, col, orientacion) => {
    for (let k = 0; k < pw.palabra.length; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      if (!grid[r][c]) grid[r][c] = { letra: pw.palabra[k], numero: k === 0 ? pw.numero : null };
    }
  };
  const enLimites = (fila, col, longitud, orientacion) => {
    const fin = orientacion === 'V' ? fila + longitud : col + longitud;
    return fila >= 0 && col >= 0 && fila < size && col < size && fin <= size;
  };
  const crucesDe = (pw, fila, col, orientacion) => {
    if (!enLimites(fila, col, pw.palabra.length, orientacion)) return -1;
    const cruces = [];
    for (let k = 0; k < pw.palabra.length; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      if (grid[r][c]) {
        if (grid[r][c].letra !== pw.palabra[k]) return -1;
        cruces.push(k);
      }
    }
    for (let k = 0; k < pw.palabra.length; k++) {
      if (cruces.includes(k)) continue;
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      const vecinos = orientacion === 'V' ? [[r, c - 1], [r, c + 1]] : [[r - 1, c], [r + 1, c]];
      for (const [vr, vc] of vecinos) {
        if (vr >= 0 && vr < size && vc >= 0 && vc < size && grid[vr][vc]) return -1;
      }
    }
    return cruces.length;
  };
  const franjaLibre = (pw) => {
    for (let fila = 0; fila < size; fila++)
      for (let col = 0; col <= size - pw.palabra.length; col++)
        if (crucesDe(pw, fila, col, 'H') >= 0) return { fila, col, orientacion: 'H' };
    for (let col = 0; col < size; col++)
      for (let fila = 0; fila <= size - pw.palabra.length; fila++)
        if (crucesDe(pw, fila, col, 'V') >= 0) return { fila, col, orientacion: 'V' };
    return null;
  };

  const primera = palabras[0];
  const filaIni = Math.floor(size / 2);
  const colIni = Math.floor((size - primera.palabra.length) / 2);
  escribir(primera, filaIni, colIni, 'H');
  colocadas.push({ ...primera, fila: filaIni, col: colIni, orientacion: 'H' });

  for (let idx = 1; idx < palabras.length; idx++) {
    const pw = palabras[idx];
    let mejor = null;
    let mejorCruce = 0;
    for (const ya of colocadas) {
      for (let yi = 0; yi < ya.palabra.length; yi++) {
        for (let k = 0; k < pw.palabra.length; k++) {
          if (pw.palabra[k] !== ya.palabra[yi]) continue;
          const o = ya.orientacion === 'H' ? 'V' : 'H';
          const fila = ya.orientacion === 'H' ? ya.fila - k : ya.fila + yi;
          const col = ya.orientacion === 'H' ? ya.col + yi : ya.col - k;
          const cruces = crucesDe(pw, fila, col, o);
          if (cruces >= 1 && cruces > mejorCruce) { mejor = { fila, col, orientacion: o }; mejorCruce = cruces; }
        }
      }
    }
    if (!mejor) mejor = franjaLibre(pw);
    if (mejor) {
      escribir(pw, mejor.fila, mejor.col, mejor.orientacion);
      colocadas.push({ ...pw, fila: mejor.fila, col: mejor.col, orientacion: mejor.orientacion });
    } else {
      noColocadas.push(`${pw.palabra} (sin espacio)`);
    }
  }
  return { grid, colocadas, size, noColocadas };
};

(async () => {
  try {
    await sequelize.authenticate();
    const juego = await Game.findOne({ where: { id: 372 }, raw: true });
    const c = typeof juego.configuracion === 'string' ? JSON.parse(juego.configuracion) : juego.configuracion;
    const palabras = (c.palabras || []).filter(p => p.palabra);
    console.log(`Palabras (${palabras.length}):`, palabras.map(p => p.palabra).join(', '));

    const r = generarCrucigrama(palabras);
    console.log(`Colocadas: ${r.colocadas.length}/${palabras.length}`);
    if (r.noColocadas.length) console.log('No colocadas:', r.noColocadas);

    let conCruce = 0;
    r.colocadas.forEach(word => {
      let cruces = 0;
      for (let k = 0; k < word.palabra.length; k++) {
        const rw = word.orientacion === 'V' ? word.fila + k : word.fila;
        const cw = word.orientacion === 'H' ? word.col + k : word.col;
        let compartida = false;
        for (const otro of r.colocadas) {
          if (otro.palabra === word.palabra) continue;
          for (let j = 0; j < otro.palabra.length; j++) {
            const ro = otro.orientacion === 'V' ? otro.fila + j : otro.fila;
            const co = otro.orientacion === 'H' ? otro.col + j : otro.col;
            if (ro === rw && co === cw) { compartida = true; break; }
          }
          if (compartida) break;
        }
        if (compartida) cruces++;
      }
      if (cruces > 0) conCruce++;
      console.log(`  ${word.numero}. ${word.palabra} ${word.orientacion} @(${word.fila},${word.col}) cruces=${cruces}`);
    });
    console.log(`Palabras entrelazadas (≥1 cruce): ${conCruce}/${r.colocadas.length}`);

    for (let fila = 0; fila < r.size; fila++) {
      let linea = '';
      for (let col = 0; col < r.size; col++) linea += r.grid[fila][col] ? r.grid[fila][col].letra : '.';
      console.log(linea);
    }
    await sequelize.close();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();