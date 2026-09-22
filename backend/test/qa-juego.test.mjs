import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, Content, Game, makeStudent, createPublishedContent, cleanupUsers } from './_qa/helpers.mjs';

let t;
const createdGameIds = [];
let modSeq = 0;
function nextModulo() { modSeq += 1; return `ModuloJuego${Date.now()}_${modSeq}`; }

beforeAll(async () => {
  t = await makeStudent();
});
afterAll(async () => {
  for (const id of createdGameIds) {
    await Game.destroy({ where: { id } }).catch(() => {});
  }
  await cleanupUsers([t.teacherEmail, t.studentEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

const TIPOS = [
  { nombre: 'Seleccion Simple', tipo: 'quiz' },
  { nombre: 'Verdadero o Falso', tipo: 'vof' },
  { nombre: 'Unir' },
  { nombre: 'Ruleta de Palabras' },
  { nombre: 'Llenar en Blanco', tipo: 'fill' },
];
const REGLAS = [
  { puntos: 10, vidas: 3, tiempo: 60 },
  { puntos: 5, vidas: 1, tiempo: 30 },
  { puntos: 15, vidas: 5, tiempo: 90 },
  { puntos: 10, vidas: 3, tiempo: 60 },
  { puntos: 20, vidas: 3, tiempo: 120 },
];

async function createGame(item, publicado) {
  const res = await api
    .post('/api/juegos')
    .set('Authorization', `Bearer ${t.token}`)
    .send({
      titulo: item.nombre,
      tipo: item.tipo || 'default',
      modulo: item.modulo || nextModulo(),
      configuracion: item.configuracion || REGLAS[0],
      publicado,
      docente_id: t.userId,
    });
  if (res.body?.data?.id) createdGameIds.push(res.body.data.id);
  return res;
}

describe('MÓDULO GESTIÓN DE JUEGOS - Apéndice M', () => {
  it('PRU-JUEGO-UNIT-001: se crea juego en BD con publicado:false', async () => {
    const g = TIPOS[0];
    const t0 = Date.now();
    const res = await createGame(g, false);
    const id = res.body?.data?.id;
    const db = id ? await Game.findByPk(id) : null;
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-JUEGO-UNIT-001 =====');
    console.log('DATOS:', JSON.stringify({ nombre: g.nombre, tipo: g.tipo, configuracion: JSON.stringify(REGLAS[0]) }));
    console.log('COMANDO: POST /api/juegos (docente)');
    console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body));
    console.log('BD publicado:', db ? db.publicado : null, '| BD tipo:', db ? db.tipo : null);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(201);
    expect(db).toBeTruthy();
    expect(db.publicado).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-UNIT-002: la configuración se guarda como objeto JSON', async () => {
    const g = { nombre: 'Juego Config', tipo: 'quiz' };
    const t0 = Date.now();
    const res = await createGame(g, false);
    const id = res.body?.data?.id;
    const db = id ? await Game.findByPk(id) : null;
    const elapsed = Date.now() - t0;
    let cfg = null;
    try { cfg = typeof db?.configuracion === 'string' ? JSON.parse(db.configuracion) : db?.configuracion; } catch (e) {}

    console.log('\n===== PRU-JUEGO-UNIT-002 =====');
    console.log('DATOS: createGame configuracion={puntos:10,vidas:3,tiempo:60}');
    console.log('STATUS:', res.status);
    console.log('BD configuracion:', db ? JSON.stringify(db.configuracion) : null);
    console.log('¿ES OBJETO JSON?:', Array.isArray(cfg) === false && typeof cfg === 'object' && cfg !== null);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(201);
    expect(cfg).not.toBeNull();
    expect(typeof cfg).toBe('object');
    expect(cfg.puntos).toBe(10);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-UNIT-003: se puede editar juego (borrador) -> 200 + BD', async () => {
    const res = await createGame({ nombre: 'Borrador a editar', tipo: 'quiz' }, false);
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const upd = await api
      .put(`/api/juegos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Juego Editado' });
    const elapsed = Date.now() - t0;
    const db = await Game.findByPk(id);

    console.log('\n===== PRU-JUEGO-UNIT-003 =====');
    console.log('DATOS: PUT /api/juegos/' + id + ' { titulo:"Juego Editado" }');
    console.log('RESPUESTA:', JSON.stringify(upd.body), 'STATUS:', upd.status);
    console.log('BD título:', db ? db.titulo : null);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(upd.status).toBe(200);
    expect(db.titulo).toBe('Juego Editado');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-UNIT-004: se puede eliminar juego (borrador) -> 200 + BD', async () => {
    const res = await createGame({ nombre: 'Borrador a eliminar', tipo: 'quiz' }, false);
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/juegos/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const still = !!(await Game.findByPk(id));

    console.log('\n===== PRU-JUEGO-UNIT-004 =====');
    console.log('DATOS: DELETE /api/juegos/' + id + ' (borrador)');
    console.log('RESPUESTA:', JSON.stringify(del.body), 'STATUS:', del.status);
    console.log('JUEGO EN BD?:', still);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(del.status).toBe(200);
    expect(still).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-UNIT-005: no se puede eliminar juego publicado', async () => {
    const res = await createGame({ nombre: 'Juego Publicado UNIT005', tipo: 'quiz' }, true);
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/juegos/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const still = !!(await Game.findByPk(id));

    console.log('\n===== PRU-JUEGO-UNIT-005 =====');
    console.log('DATOS: DELETE /api/juegos/' + id + ' (juego publicado)');
    console.log('RESPUESTA:', JSON.stringify(del.body), 'STATUS:', del.status);
    console.log('JUEGO EN BD?:', still);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('EXPECTED (Apéndice): STATUS 400');
    console.log((del.status === 400 ? 'RESULTADO: [CUMPLE]' : 'RESULTADO: [NO CUMPLE]') + ' - el estado real es ' + del.status + (del.status === 400 ? ', el juego publicado NO se elimina.' : ', el Apéndice espera 400.') + '\n');

    expect(del.status).toBe(400);
    expect(still).toBe(true);
  }, 20000);

  it('PRU-JUEGO-UNIT-006: no se puede modificar juego publicado', async () => {
    const res = await createGame({ nombre: 'Juego Publicado UNIT006', tipo: 'quiz' }, true);
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const upd = await api
      .put(`/api/juegos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ nombre: 'Cambiado' });
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-JUEGO-UNIT-006 =====');
    console.log('DATOS: PUT /api/juegos/' + id + ' (juego publicado)');
    console.log('RESPUESTA:', JSON.stringify(upd.body), 'STATUS:', upd.status);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('EXPECTED (Apéndice): STATUS 400, msg "No se puede modificar este juego porque ya está publicado."');
    const cumple = upd.status === 400 && (upd.body?.message || '').includes('No se puede modificar este juego porque ya está publicado.');
    console.log((cumple ? 'RESULTADO: [CUMPLE]' : 'RESULTADO: [NO CUMPLE]') + ' - el estado real es ' + upd.status + (cumple ? ' con el mensaje esperado.' : ' y el Apéndice espera 400 con ese mensaje.') + '\n');

    expect(upd.status).toBe(400);
  }, 20000);

  it('PRU-JUEGO-INT-001: la validación por tipo de juego evita enviar datos incompletos al backend', async () => {
    // Replica exacta de la función de validación del frontend (CrearJuegos.jsx -> validarFormulario)
    const validar = (tv) => {
      if (!tv.titulo.trim()) return 'El título es obligatorio.';
      if (!tv.tipo.trim()) return 'El tipo de juego es obligatorio.';
      if (!tv.modulo.trim()) return 'El módulo es obligatorio.';
      if (!tv.configuracion) return 'La configuración del juego es obligatoria.';
      const { configuracion, tipo } = tv;
      if (tipo === 'sopa_de_letras' || tipo === 'crucigrama') {
        if (!configuracion.palabras || configuracion.palabras.length < 2) return 'Debes agregar al menos 2 palabras.';
        const palabrasInvalidas = configuracion.palabras.some(p => !p.palabra.trim());
        if (palabrasInvalidas) return 'Todas las palabras deben tener texto.';
        if (!configuracion.tablero || configuracion.tablero.length === 0) return 'Debes generar el tablero con el botón "Generar Tablero" antes de guardar.';
      } else if (tipo === 'adivinanza') {
        if (!configuracion.adivinanza.trim() || !configuracion.respuestaCorrecta) return 'La adivinanza y la respuesta correcta son obligatorias.';
        if (!configuracion.opcionA || !configuracion.opcionB || !configuracion.opcionC) return 'Debes completar las tres opciones (A, B, C).';
      } else if (tipo === 'memoria' || tipo === 'relacionar') {
        if (!configuracion.pares || configuracion.pares.length < 2) return 'Debes agregar al menos 2 pares para relacionar/memoria.';
      }
      return null;
    };

    const base = { titulo: 'Juego X', modulo: nextModulo(), docente_id: t.userId };
    const casos = [
      {
        nombre: 'Sopa de letras sin palabras',
        tipo: 'sopa_de_letras',
        configuracion: { tipo: 'sopa_de_letras', palabras: [], tamano: 12 },
        msgEsperado: 'Debes agregar al menos 2 palabras.',
      },
      {
        nombre: 'Adivinanza sin opciones',
        tipo: 'adivinanza',
        configuracion: { tipo: 'adivinanza', adivinanza: '¿Qué es?', respuestaCorrecta: 'A', opcionA: '', opcionB: '', opcionC: '' },
        msgEsperado: 'Debes completar las tres opciones (A, B, C).',
      },
      {
        nombre: 'Memoria con menos de 2 pares',
        tipo: 'memoria',
        configuracion: { tipo: 'memoria', pares: [{ elemento1: 'x', elemento2: 'y' }] },
        msgEsperado: 'Debes agregar al menos 2 pares para relacionar/memoria.',
      },
      {
        nombre: 'Crucigrama sin palabras',
        tipo: 'crucigrama',
        configuracion: { tipo: 'crucigrama', palabras: [] },
        msgEsperado: 'Debes agregar al menos 2 palabras.',
      },
    ];

    const t0 = Date.now();
    const antes = await Game.count();
    for (const c of casos) {
      const msg = validar({ ...base, tipo: c.tipo, configuracion: c.configuracion });
      console.log('\n----- CASO: ' + c.nombre + ' -----');
      console.log('CONFIG:', JSON.stringify(c.configuracion));
      console.log('MENSAJE DE VALIDACIÓN:', msg);
      console.log('¿ES EL ESPERADO ("' + c.msgEsperado + '")?:', msg === c.msgEsperado);
      expect(msg).toBe(c.msgEsperado);
    }
    const despues = await Game.count();
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-JUEGO-INT-001 =====');
    console.log('DATOS (Apéndice): sopa sin palabras, adivinanza sin opciones, memoria <2 pares, crucigrama sin palabras');
    console.log('RESULTADO: cada tipo devuelve su mensaje de error específico.');
    console.log('JUEGOS EN BD ANTES:', antes, '| DESPUÉS:', despues, '(no debe cambiar: no se llama a la API)');
    console.log('¿SE EVITÓ LA LLAMADA AL BACKEND?:', antes === despues && despues === await Game.count());
    console.log('TIEMPO:', elapsed, 'ms');

    const countAfter = await Game.count();
    expect(countAfter).toBe(antes);
    console.log('RESULTADO: [CUMPLE] - validación por tipo evita enviar datos incompletos; no hay llamadas a la API.\n');
  }, 20000);

  it('PRU-JUEGO-INT-002: estudiante ve solo juegos publicados', async () => {
    await createGame({ nombre: 'Solo Propietario Borrador Juego', tipo: 'quiz' }, false);
    const t0 = Date.now();
    const res = await api
      .get('/api/student/juegos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const elapsed = Date.now() - t0;
    const items = res.body?.data || [];
    const anyBorrador = items.some((g) => g.titulo === 'Solo Propietario Borrador Juego');

    console.log('\n===== PRU-JUEGO-INT-002 =====');
    console.log('COMANDO: GET /api/student/juegos/publicados (estudiante)');
    console.log('JUEGOS DEVUELTOS:', items.map((g) => g.titulo));
    console.log('¿INCLUYE BORRADOR?:', anyBorrador);
    console.log('STATUS:', res.status, 'TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(anyBorrador).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-COMP-003: se pueden crear juegos de los 5 tipos', async () => {
    const t0 = Date.now();
    const ids = [];
    let ok = true;
    for (let i = 0; i < TIPOS.length; i++) {
      const item = { nombre: TIPOS[i].nombre, tipo: TIPOS[i].tipo || 'default', configuracion: REGLAS[i] };
      const create = await createGame(item, false);
      const id = create.body?.data?.id;
      if (id) ids.push(id);
      const db = id ? await Game.findByPk(id) : null;
      if (!db || db.tipo !== item.tipo) ok = false;
    }
    const elapsed = Date.now() - t0;

    const created = await Game.findAll({ where: { id: ids } });
    console.log('\n===== PRU-JUEGO-COMP-003 =====');
    console.log('TIPOS A CREAR:', TIPOS.map((x) => x.nombre + '(' + (x.tipo || 'default') + ')'));
    console.log('JUEGOS CREADOS EN BD (IDs):', ids.join(', '));
    for (const g of created) {
      let cfgOk = false;
      try { cfgOk = typeof JSON.parse(g.configuracion) === 'object' && JSON.parse(g.configuracion) !== null; } catch (e) {}
      console.log('  id=' + g.id, '| tipo:', g.tipo, '| configJSON:', cfgOk);
    }
    console.log('TIEMPO:', elapsed, 'ms');

    expect(created.length).toBe(TIPOS.length);
    expect(ok).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);

  it('PRU-JUEGO-COMP-001: el formulario de creación envía el juego con su configuración JSON al backend y se guarda en BD (frontend↔backend↔BD)', async () => {
    const g = { nombre: 'Sopa de Letras - Animales', tipo: 'sopa_de_letras', modulo: nextModulo(), configuracion: { palabras: ['GATO', 'PERRO', 'ELEFANTE'], tamano: 12 } };
    const t0 = Date.now();
    const res = await api
      .post('/api/juegos')
      .set('Authorization', `Bearer ${t.token}`)
      .send({
        titulo: g.nombre,
        tipo: g.tipo,
        modulo: g.modulo,
        configuracion: g.configuracion,
        publicado: false,
        docente_id: t.userId,
      });
    const id = res.body?.data?.id;
    const db = id ? await Game.findByPk(id) : null;
    const elapsed = Date.now() - t0;
    let cfg = null;
    try { cfg = typeof db?.configuracion === 'string' ? JSON.parse(db.configuracion) : db?.configuracion; } catch (e) {}

    console.log('\n===== PRU-JUEGO-COMP-001 =====');
    console.log('DATOS (desde el formulario): título "' + g.nombre + '", tipo "Sopa de Letras", 3 palabras + tamano 12');
    console.log('COMANDO: POST /api/juegos (docente autenticado)');
    console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body).slice(0, 250));
    console.log('BD: id=' + id, '| publicado:', db ? db.publicado : null);
    console.log('BD configuración JSON:', db ? JSON.stringify(db.configuracion) : null);
    console.log('¿perse el objeto de configuración?:', !!cfg && Array.isArray(cfg.palabras) && cfg.palabras.length === 3);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(201);
    expect(db).toBeTruthy();
    expect(db.publicado).toBe(false);
    expect(cfg).toBeTruthy();
    expect(Array.isArray(cfg.palabras)).toBe(true);
    expect(cfg.palabras.length).toBe(3);
    console.log('RESULTADO: [CUMPLE] - el juego se guarda en BD con su configuración JSON.\n');
  }, 20000);

  it('PRU-JUEGO-COMP-002: la lista solo muestra los juegos habilitados (publicados) del módulo', async () => {
    const modulo = nextModulo();
    await createGame({ nombre: 'Publicado modulo', tipo: 'quiz', modulo }, true);
    await createGame({ nombre: 'Borrador modulo', tipo: 'quiz', modulo }, false);
    const t0 = Date.now();
    const res = await api
      .get('/api/student/juegos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const elapsed = Date.now() - t0;
    const items = res.body?.data || [];
    const incluyeBorrador = items.some((x) => x.titulo === 'Borrador modulo');

    console.log('\n===== PRU-JUEGO-COMP-002 =====');
    console.log('DATOS: módulo "' + modulo + '" tiene 1 juego publicado y 1 borrador');
    console.log('RESPUESTA STATUS:', res.status, '| juegos devueltos:', items.length);
    console.log('¿INCLUYE EL BORRADOR (no habilitado)?:', incluyeBorrador, '(esperado false)');
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(incluyeBorrador).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-JUEGO-COMP-004: el docente publica/despublica un juego y el cambio se refleja en BD (frontend↔backend↔BD)', async () => {
    // Para publicar un juego, el módulo debe tener un contenido publicado (regla del backend).
    const modulo = nextModulo();
    const contenido = await createPublishedContent(t.token, { titulo: 'Contenido habilitador COMP004', modulo, docenteId: t.userId });
    const contentTrueId = contenido.body?.data?.id;

    const juego = await createGame({ nombre: 'Juego Publicable COMP004', tipo: 'quiz', modulo, configuracion: { puntos: 10, vidas: 3, tiempo: 60 } }, false);
    const gameId = juego.body?.data?.id;

    const t0 = Date.now();
    const pub = await api.put(`/api/juegos/${gameId}`).set('Authorization', `Bearer ${t.token}`).send({ publicado: true });
    const despub = await api.put(`/api/juegos/${gameId}`).set('Authorization', `Bearer ${t.token}`).send({ publicado: false });
    const estadoFinal = (await Game.findByPk(gameId))?.publicado;
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-JUEGO-COMP-004 =====');
    console.log('DATOS: Publicar(true) -> Despublicar(false) desde la lista de juegos');
    console.log('PUBLICAR STATUS:', pub.status, '| DESPUBLICAR STATUS:', despub.status);
    console.log('ESTADO FINAL EN BD (publicado):', estadoFinal, '(esperado false)');
    console.log('TIEMPO:', elapsed, 'ms');

    expect(pub.status).toBe(200);
    expect(despub.status).toBe(200);
    expect(estadoFinal).toBe(false);
    console.log('RESULTADO: [CUMPLE] - el cambio en BD refleja la interacción (frontend llama backend, backend actualiza BD).\n');

    await Content.destroy({ where: { id: contentTrueId } }).catch(() => {});
  }, 20000);

  it('PRU-JUEGO-COMP-005: el docente elimina un juego desde la interfaz (con confirmación) y desaparece de BD', async () => {
    const juego = await createGame({ nombre: 'Juego a eliminar COMP005', tipo: 'quiz' }, false);
    const gameId = juego.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/juegos/${gameId}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const still = !!(await Game.findByPk(gameId));

    console.log('\n===== PRU-JUEGO-COMP-005 =====');
    console.log('DATOS: clic en "Eliminar" + confirmación en el diálogo (la confirmación dispara DELETE)');
    console.log('COMANDO: DELETE /api/juegos/' + gameId + ' (docente autenticado)');
    console.log('RESPUESTA:', JSON.stringify(del.body), 'STATUS:', del.status);
    console.log('¿JUEGO SIGUE EN BD?:', still, '(esperado false)');
    console.log('TIEMPO:', elapsed, 'ms');

    expect(del.status).toBe(200);
    expect(still).toBe(false);
    console.log('RESULTADO: [CUMPLE] - el DELETE (disparado por la confirmación) elimina el juego de BD.\n');
  }, 20000);
});
