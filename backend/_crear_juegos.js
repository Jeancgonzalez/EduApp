require('dotenv').config();
const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Game = require('./src/models/game.model');
const Content = require('./src/models/content.model');
require('./src/models/associations');

/* ============================
   GENERADOR DE CRUCIGRAMA
   (copia del usado en el frontend: DynamicGameForm.jsx)
   ============================ */
const generarCrucigrama = (palabrasInput, tamano = 15) => {
  const size = tamano;
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const colocadas = [];
  const noColocadas = [];
  const palabras = palabrasInput
    .filter(p => p.palabra?.trim())
    .map((p, i) => ({
      ...p,
      palabra: p.palabra.toUpperCase().trim(),
      orientacion: p.orientacion === 'V' ? 'V' : 'H',
      numero: i + 1
    }))
    .filter(p => {
      if (p.palabra.length > size) {
        noColocadas.push(`${p.palabra} (demasiado larga)`);
        return false;
      }
      return true;
    });

  if (palabras.length === 0) return { grid, colocadas, size, noColocadas };

  const intentarInterseccion = (pw, ya) => {
    if (ya.orientacion === pw.orientacion) return null;
    for (let pi = 0; pi < pw.palabra.length; pi++) {
      for (let yi = 0; yi < ya.palabra.length; yi++) {
        if (pw.palabra[pi] !== ya.palabra[yi]) continue;

        let fila, col;
        if (pw.orientacion === 'V') {
          fila = ya.fila - pi;
          col = ya.col + yi;
        } else {
          fila = ya.fila + yi;
          col = ya.col - pi;
        }
        const endFila = pw.orientacion === 'V' ? fila + pw.palabra.length - 1 : fila;
        const endCol = pw.orientacion === 'H' ? col + pw.palabra.length - 1 : col;
        if (fila < 0 || endFila >= size || col < 0 || endCol >= size) continue;

        let ok = true;
        for (let k = 0; k < pw.palabra.length && ok; k++) {
          const r = pw.orientacion === 'V' ? fila + k : fila;
          const c = pw.orientacion === 'H' ? col + k : col;
          const cell = grid[r][c];
          if (cell && cell.letra !== pw.palabra[k]) ok = false;
        }
        if (ok) {
          for (let k = 0; k < pw.palabra.length; k++) {
            const r = pw.orientacion === 'V' ? fila + k : fila;
            const c = pw.orientacion === 'H' ? col + k : col;
            if (!grid[r][c]) grid[r][c] = { letra: pw.palabra[k], numero: k === 0 ? pw.numero : null };
          }
          return { fila, col, orientacion: pw.orientacion };
        }
      }
    }
    return null;
  };

  const intentarFranjaLibre = (pw) => {
    if (pw.orientacion === 'H') {
      for (let fila = 0; fila < size; fila++) {
        for (let col = 0; col <= size - pw.palabra.length; col++) {
          let libre = true;
          for (let k = 0; k < pw.palabra.length && libre; k++) {
            if (grid[fila][col + k]) libre = false;
          }
          if (!libre) continue;
          for (let k = 0; k < pw.palabra.length; k++) {
            grid[fila][col + k] = { letra: pw.palabra[k], numero: k === 0 ? pw.numero : null };
          }
          return { fila, col, orientacion: 'H' };
        }
      }
    } else {
      for (let col = 0; col < size; col++) {
        for (let fila = 0; fila <= size - pw.palabra.length; fila++) {
          let libre = true;
          for (let k = 0; k < pw.palabra.length && libre; k++) {
            if (grid[fila + k][col]) libre = false;
          }
          if (!libre) continue;
          for (let k = 0; k < pw.palabra.length; k++) {
            grid[fila + k][col] = { letra: pw.palabra[k], numero: k === 0 ? pw.numero : null };
          }
          return { fila, col, orientacion: 'V' };
        }
      }
    }
    return null;
  };

  const primera = palabras[0];
  if (primera.orientacion === 'V') {
    const startRow = Math.floor((size - primera.palabra.length) / 2);
    const startCol = Math.floor(size / 2);
    for (let i = 0; i < primera.palabra.length; i++)
      grid[startRow + i][startCol] = { letra: primera.palabra[i], numero: i === 0 ? primera.numero : null };
    colocadas.push({ ...primera, fila: startRow, col: startCol, orientacion: 'V' });
  } else {
    const startCol = Math.floor((size - primera.palabra.length) / 2);
    const startRow = Math.floor(size / 2);
    for (let i = 0; i < primera.palabra.length; i++)
      grid[startRow][startCol + i] = { letra: primera.palabra[i], numero: i === 0 ? primera.numero : null };
    colocadas.push({ ...primera, fila: startRow, col: startCol, orientacion: 'H' });
  }

  for (let idx = 1; idx < palabras.length; idx++) {
    const pw = palabras[idx];
    let pos = null;
    for (const ya of colocadas) {
      pos = intentarInterseccion(pw, ya);
      if (pos) break;
    }
    if (!pos) pos = intentarFranjaLibre(pw);
    if (pos) {
      colocadas.push({ ...pw, fila: pos.fila, col: pos.col, orientacion: pos.orientacion });
    } else {
      noColocadas.push(`${pw.palabra} (sin espacio)`);
    }
  }

  return { grid, colocadas, size, noColocadas };
};

const MODULO = 'Introducción a la informática';

const CANDIDATOS = [
  {
    titulo: 'Crucigrama del Computador',
    tipo: 'crucigrama',
    descripcion: 'Completa el crucigrama con palabras relacionadas a las partes y conceptos del computador.',
  },
  {
    titulo: 'Memotest Informático',
    tipo: 'memoria',
    descripcion: 'Encuentra los pares de conceptos relacionados con la informática.',
  },
  {
    titulo: 'Relaciona Conceptos de Informática',
    tipo: 'relacionar',
    descripcion: 'Relaciona cada término de la columna A con su significado en la columna B.',
  },
  {
    titulo: 'Adivinanza del Computador',
    tipo: 'adivinanza',
    descripcion: 'Resuelve la adivinanza eligiendo la respuesta correcta.',
  },
];

const construirConfig = (tipo) => {
  if (tipo === 'crucigrama') {
    const palabras = [
      { palabra: 'TECLADO', pista: 'Dispositivo para ingresar texto en el computador.', orientacion: 'H' },
      { palabra: 'USB', pista: 'Memoria portátil para guardar archivos.', orientacion: 'V' },
      { palabra: 'PANTALLA', pista: 'Muestra la información de forma visual.', orientacion: 'H' },
      { palabra: 'RATON', pista: 'Dispositivo que mueve el puntero en la pantalla.', orientacion: 'V' },
      { palabra: 'MODEM', pista: 'Equipo que conecta el computador a Internet.', orientacion: 'H' },
      { palabra: 'CORREO', pista: 'Servicio para enviar y recibir mensajes digitales.', orientacion: 'V' },
      { palabra: 'BOTON', pista: 'Elemento de la interfaz que se presiona.', orientacion: 'H' },
      { palabra: 'RED', pista: 'Conjunto de computadoras conectadas entre sí.', orientacion: 'V' },
    ];
    const resultado = generarCrucigrama(palabras, 15);
    console.log(`  [crucigrama] colocadas: ${resultado.colocadas.length}/${palabras.length} | no colocadas: ${resultado.noColocadas.join(', ') || 'ninguna'}`);
    return {
      tipo,
      palabras: palabras.map(p => ({ palabra: p.palabra, pista: p.pista, orientacion: p.orientacion })),
      tablero: resultado.grid,
      pistas: resultado.colocadas.map(p => ({ palabra: p.palabra, pista: p.pista || '', numero: p.numero, fila: p.fila, col: p.col, orientacion: p.orientacion })),
    };
  }
  if (tipo === 'memoria') {
    return {
      tipo,
      pares: [
        { elemento1: 'Monitor', elemento2: 'Pantalla' },
        { elemento1: 'Teclado', elemento2: 'Escribir' },
        { elemento1: 'Mouse', elemento2: 'Clic' },
        { elemento1: 'CPU', elemento2: 'Cerebro del PC' },
        { elemento1: 'Impresora', elemento2: 'Hoja impresa' },
        { elemento1: 'Internet', elemento2: 'Red de redes' },
        { elemento1: 'USB', elemento2: 'Guardar archivos' },
        { elemento1: 'Contraseña', elemento2: 'Clave de acceso' },
      ],
    };
  }
  if (tipo === 'relacionar') {
    return {
      tipo,
      pares: [
        { columnaA: 'RAM', columnaB: 'Memoria temporal' },
        { columnaA: 'ROM', columnaB: 'Memoria permanente' },
        { columnaA: 'HDD', columnaB: 'Disco duro' },
        { columnaA: 'Sistema Operativo', columnaB: 'Programa principal' },
        { columnaA: 'URL', columnaB: 'Dirección web' },
        { columnaA: 'Antivirus', columnaB: 'Protección contra virus' },
      ],
    };
  }
  if (tipo === 'adivinanza') {
    return {
      tipo,
      adivinanza: 'Tengo dientes y no como, tengo cabeza y no pienso. ¿Qué soy?',
      pista: 'Se utiliza todos los días para el aseo personal.',
      opcionA: 'Un computador',
      opcionB: 'Un peine',
      opcionC: 'Un teclado',
      respuestaCorrecta: 'B',
    };
  }
  return null;
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
    const contenidoId = contenido.id;
    console.log(`Módulo: ${MODULO} (contenido_id=${contenidoId})\n`);

    for (const c of CANDIDATOS) {
      const existente = await Game.findOne({ where: { docente_id: teacher.id, titulo: c.titulo }, raw: true });
      if (existente) {
        console.log(`[SKIP] Ya existe "${c.titulo}" (id=${existente.id})`);
        continue;
      }
      const configuracion = construirConfig(c.tipo);
      const juego = await Game.create({
        titulo: c.titulo,
        tipo: c.tipo,
        modulo: MODULO,
        modulo_content_id: contenidoId,
        descripcion: c.descripcion,
        configuracion,
        docente_id: teacher.id,
        puntaje_max: 100,
        publicado: true,
        grupo_id: null,
      });
      console.log(`[OK] Creado "${c.titulo}" (id=${juego.id}, tipo=${c.tipo}, publicado=true)`);
    }

    await sequelize.close();
    console.log('\nListo.');
  } catch (error) {
    console.error('Error:', error.message);
    try { await sequelize.close(); } catch (e) {}
    process.exit(1);
  }
})();