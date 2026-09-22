require('dotenv').config();
const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Game = require('./src/models/game.model');
const Content = require('./src/models/content.model');
require('./src/models/associations');

/* ============================
   GENERADOR DE CRUCIGRAMA (auto-ubicación)
   Copia del nuevo usado en frontend: DynamicGameForm.jsx
   ============================ */
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
  const distanciaAlCuerpo = (fila, col, orientacion, longitud) => {
    let min = Infinity;
    for (let k = 0; k < longitud; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      for (let rf = 0; rf < size; rf++) {
        for (let cf = 0; cf < size; cf++) {
          if (!grid[rf][cf]) continue;
          const d = Math.max(Math.abs(rf - r), Math.abs(cf - c));
          if (d < min) min = d;
        }
      }
    }
    return min;
  };

  const primera = palabras[0];
  const filaIni = Math.floor(size / 2);
  const colIni = Math.floor((size - primera.palabra.length) / 2);
  escribir(primera, filaIni, colIni, 'H');
  colocadas.push({ ...primera, fila: filaIni, col: colIni, orientacion: 'H' });

  for (let idx = 1; idx < palabras.length; idx++) {
    const pw = palabras[idx];
    let mejor = null;
    let mejorScore = -Infinity;

    for (let fila = 0; fila < size; fila++) {
      for (let col = 0; col < size; col++) {
        for (const orientacion of ['H', 'V']) {
          const cruces = crucesDe(pw, fila, col, orientacion);
          if (cruces < 0) continue;
          const dist = distanciaAlCuerpo(fila, col, orientacion, pw.palabra.length);
          const score = cruces * 1000 - dist;
          if (score > mejorScore) {
            mejorScore = score;
            mejor = { fila, col, orientacion, cruces };
          }
        }
      }
    }

    if (mejor) {
      escribir(pw, mejor.fila, mejor.col, mejor.orientacion);
      colocadas.push({ ...pw, fila: mejor.fila, col: mejor.col, orientacion: mejor.orientacion });
    } else {
      noColocadas.push(`${pw.palabra} (sin espacio)`);
    }
  }
  return { grid, colocadas, size, noColocadas };
};

const MODULO = 'Introducción a la informática';

const construirConfigCrucigrama = () => {
  const palabras = [
    { palabra: 'PROCESADOR', pista: 'El "cerebro" del computador que ejecuta los programas.', orientacion: 'H' },
    { palabra: 'MONITOR', pista: 'Pantalla donde se muestra la información.', orientacion: 'H' },
    { palabra: 'HARDWARE', pista: 'Conjunto de dispositivos físicos del computador.', orientacion: 'H' },
    { palabra: 'SOFTWARE', pista: 'Programas e instrucciones que hacen funcionar la máquina.', orientacion: 'H' },
    { palabra: 'INTERNET', pista: 'Red mundial de computadoras conectadas.', orientacion: 'H' },
    { palabra: 'TECLADO', pista: 'Permite escribir texto y dar instrucciones.', orientacion: 'H' },
    { palabra: 'MEMORIA', pista: 'Guarda temporalmente los datos en uso.', orientacion: 'H' },
    { palabra: 'CORREO', pista: 'Servicio de mensajes electrónicos.', orientacion: 'H' },
    { palabra: 'DISCO', pista: 'Unidad que almacena archivos de forma permanente.', orientacion: 'H' },
    { palabra: 'VIRUS', pista: 'Programa dañino que afecta al computador.', orientacion: 'H' },
    { palabra: 'RATON', pista: 'Dispositivo que mueve el puntero en la pantalla.', orientacion: 'H' },
  ];
  const resultado = generarCrucigrama(palabras, 15);
  console.log(`  [crucigrama] colocadas: ${resultado.colocadas.length}/${palabras.length} | no colocadas: ${resultado.noColocadas.join(', ') || 'ninguna'}`);
  return {
    tipo: 'crucigrama',
    palabras: palabras.map(p => ({ palabra: p.palabra, pista: p.pista })),
    tablero: resultado.grid,
    pistas: resultado.colocadas.map(p => ({ palabra: p.palabra, pista: p.pista || '', numero: p.numero, fila: p.fila, col: p.col, orientacion: p.orientacion })),
  };
};

(async () => {
  try {
    await sequelize.authenticate();
    const teacher = await User.findOne({ where: { email: 'jeancar1616@hotmail.com' }, raw: true });
    if (!teacher) throw new Error('Docente jeancar1616@hotmail.com no encontrado.');
    console.log(`Docente: ${teacher.nombre || teacher.name || teacher.email} (id=${teacher.id})\n`);

    const contenido = await Content.findOne({
      where: { docente_id: teacher.id, modulo: MODULO, publicado: true },
      order: [['id', 'ASC']],
      raw: true
    });
    if (!contenido) throw new Error(`No hay contenido publicado para el módulo "${MODULO}".`);
    console.log(`Módulo: ${MODULO} (contenido_id=${contenido.id})\n`);

    const titulo = 'Crucigrama de Hardware y Software';
    const configuracion = construirConfigCrucigrama();
    const existente = await Game.findOne({ where: { docente_id: teacher.id, titulo }, raw: true });
    if (existente) {
      await Game.update({ configuracion }, { where: { id: existente.id } });
      console.log(`[UPDATE] "${titulo}" actualizado con el nuevo layout acoplado (id=${existente.id})`);
    } else {
      const juego = await Game.create({
        titulo,
        tipo: 'crucigrama',
        modulo: MODULO,
        modulo_content_id: contenido.id,
        descripcion: 'Completa el crucigrama con términos sobre el hardware y el software del computador.',
        configuracion,
        docente_id: teacher.id,
        puntaje_max: 100,
        publicado: true,
        grupo_id: null,
      });
      console.log(`[OK] Creado "${titulo}" (id=${juego.id}, tipo=crucigrama, publicado=true)`);
    }

    const resultado = configuracion;
    console.log('\n-- Palabras colocadas --');
    resultado.pistas.forEach(p =>
      console.log(`  #${p.numero} ${p.palabra} ${p.orientacion} @(${p.fila},${p.col})`));
    console.log(`\n-- Tablero ${resultado.tablero.length}x${resultado.tablero[0].length} --`);
    resultado.tablero.forEach(fila =>
      console.log(fila.map(cell => (cell && cell !== '#' ? cell.letra : '.')).join('')));

    const check = await Game.findOne({ where: { docente_id: teacher.id, titulo }, raw: true });
    const c = typeof check.configuracion === 'string' ? JSON.parse(check.configuracion) : check.configuracion;
    console.log(`\nVerificación: id=${check.id} | palabras=${c.palabras?.length} | pistas=${c.pistas?.length}`);
    let celdas = 0;
    c.tablero.forEach(fila => fila.forEach(cell => { if (cell) celdas++; }));
    console.log(`Celdas activas: ${celdas}`);

    await sequelize.close();
    console.log('\nListo.');
  } catch (error) {
    console.error('Error:', error.message);
    try { await sequelize.close(); } catch (e) {}
    process.exit(1);
  }
})();