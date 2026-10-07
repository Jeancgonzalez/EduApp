require('dotenv').config();
const { Sequelize } = require('sequelize');

const EMAIL_FUENTE = process.env.DOCENTE_EMAIL || 'DocenGra@hotmail.com';
const EMAIL_DESTINO = process.env.DOCENTE_TARGET_EMAIL || null;

const fuente = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS || '', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  dialect: 'mysql',
  logging: false,
});

const destino = new Sequelize(process.env.PROD_DB_NAME, process.env.PROD_DB_USER, process.env.PROD_DB_PASS || '', {
  host: process.env.PROD_DB_HOST,
  port: process.env.PROD_DB_PORT || 3306,
  dialect: 'mysql',
  dialectOptions: process.env.PROD_DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {},
  logging: false,
});

const REMAP = {
  grupos: { docente_id: 'personas' },
  grupo_estudiantes: { grupo_id: 'grupos', estudiante_id: 'personas' },
  contenidos: { docente_id: 'personas' },
  contenido_grupos: { contenido_id: 'contenidos', grupo_id: 'grupos' },
  juegos: { docente_id: 'personas' },
  juego_grupos: { juego_id: 'juegos', grupo_id: 'grupos' },
  evaluaciones: { docente_id: 'personas' },
  evaluacion_grupos: { evaluacion_id: 'evaluaciones', grupo_id: 'grupos' },
  preguntas: { evaluacion_id: 'evaluaciones' },
  actividad_intentos: { estudiante_id: 'personas', docente_id: 'personas', grupo_id: 'grupos', actividad_id: 'porTipo' },
  estudiante_sesion: { estudiante_id: 'personas', docente_id: 'personas', grupo_id: 'grupos' },
  progreso_estudiante: { estudiante_id: 'personas', contenido_id: 'contenidos', juego_id: 'juegos', evaluacion_id: 'evaluaciones' },
  progreso: { usuario_id: 'personas' },
  medallas_obtenidas: { estudiante_id: 'personas', docente_id: 'personas' },
  diagnostico_aplicaciones: { estudiante_id: 'personas' },
};

const ORDEN = [
  'grupos',
  'contenidos',
  'juegos',
  'evaluaciones',
  'preguntas',
  'grupo_estudiantes',
  'contenido_grupos',
  'juego_grupos',
  'evaluacion_grupos',
  'progreso_estudiante',
  'progreso',
  'medallas_obtenidas',
  'diagnostico_aplicaciones',
  'estudiante_sesion',
  'actividad_intentos',
];

async function columnas(db, tabla) {
  const rows = await db.query(
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :t ORDER BY ORDINAL_POSITION',
    { type: Sequelize.QueryTypes.SELECT, replacements: { t: tabla } }
  );
  return rows.map((r) => r.COLUMN_NAME);
}

function limpiarTexto(v) {
  if (v instanceof Date || Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

async function main() {
  await fuente.authenticate();
  await destino.authenticate();

  const doc = (
    await fuente.query('SELECT * FROM users WHERE email = :e LIMIT 1', {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { e: EMAIL_FUENTE },
    })
  )[0];
  if (!doc) throw new Error(`Docente origen ${EMAIL_FUENTE} no existe en la BD local.`);
  console.log(`\n=== Subgrafo origen: "${doc.name}" (id ${doc.id}) ===`);

  const querys = {
    users: 'SELECT * FROM users WHERE id = :id OR docente_id = :id',
    grupos: 'SELECT * FROM grupos WHERE docente_id = :id',
    contenidos: 'SELECT * FROM contenidos WHERE docente_id = :id',
    juegos: 'SELECT * FROM juegos WHERE docente_id = :id',
    evaluaciones: 'SELECT * FROM evaluaciones WHERE docente_id = :id',
    preguntas: 'SELECT p.* FROM preguntas p JOIN evaluaciones e ON e.id = p.evaluacion_id WHERE e.docente_id = :id',
    grupo_estudiantes: 'SELECT ge.* FROM grupo_estudiantes ge JOIN grupos g ON g.id = ge.grupo_id WHERE g.docente_id = :id',
    contenido_grupos: 'SELECT cg.* FROM contenido_grupos cg JOIN contenidos c ON c.id = cg.contenido_id WHERE c.docente_id = :id',
    juego_grupos: 'SELECT jg.* FROM juego_grupos jg JOIN juegos j ON j.id = jg.juego_id WHERE j.docente_id = :id',
    evaluacion_grupos: 'SELECT eg.* FROM evaluacion_grupos eg JOIN evaluaciones e ON e.id = eg.evaluacion_id WHERE e.docente_id = :id',
    actividad_intentos: 'SELECT * FROM actividad_intentos WHERE docente_id = :id',
    estudiante_sesion: 'SELECT * FROM estudiante_sesion WHERE docente_id = :id',
    progreso_estudiante: 'SELECT pe.* FROM progreso_estudiante pe JOIN users u ON u.id = pe.estudiante_id WHERE u.docente_id = :id',
    progreso: 'SELECT p.* FROM progreso p JOIN users u ON u.id = p.usuario_id WHERE u.docente_id = :id',
    medallas_obtenidas: 'SELECT m.* FROM medallas_obtenidas m JOIN users u ON u.id = m.estudiante_id WHERE u.docente_id = :id',
    diagnostico_aplicaciones: 'SELECT d.* FROM diagnostico_aplicaciones d JOIN users u ON u.id = d.estudiante_id WHERE u.docente_id = :id',
  };

  const origen = {};
  for (const tabla of [...ORDEN, 'users']) {
    origen[tabla] = await fuente.query(querys[tabla], { type: Sequelize.QueryTypes.SELECT, replacements: { id: doc.id } });
  }
  const totales = Object.entries(origen).filter(([t]) => t !== 'users').map(([t, r]) => `${t}:${r.length}`).join('  ');
  console.log('Origen:', totales);

  const estudiantes = origen.users.filter((u) => u.id !== doc.id);
  const modoDestino =
    EMAIL_DESTINO
      ? (await destino.query('SELECT id FROM users WHERE LOWER(email) = :e LIMIT 1', {
          type: Sequelize.QueryTypes.SELECT,
          replacements: { e: String(EMAIL_DESTINO).toLowerCase() },
        }))[0] || null
      : null;

  if (EMAIL_DESTINO && !modoDestino) {
    throw new Error(`Docente destino ${EMAIL_DESTINO} no existe en la BD de destino.`);
  }

  const emailsReales = [doc.email, ...estudiantes.map((s) => s.email)].map((e) => e.toLowerCase());
  if (!EMAIL_DESTINO) {
    const choque = await destino.query('SELECT email FROM users WHERE LOWER(email) IN (:es)', {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { es: emailsReales },
    });
    if (choque.length) throw new Error('Colision en destino: ' + choque.map((c) => c.email).join(', '));
  }

  const mapa = { personas: {}, grupos: {}, contenidos: {}, juegos: {}, evaluaciones: {} };
  const txn = await destino.transaction();

  async function columnasDestino(tabla) {
    return columnas(destino, tabla);
  }

  async function insertarFila(tabla, cols, valores) {
    await destino.query(
      `INSERT INTO \`${tabla}\` (\`${cols.join('`,`')}\`) VALUES (${cols.map(() => '?').join(',')})`,
      { replacements: cols.map((c) => limpiarTexto(valores[c])), transaction: txn }
    );
    const [idFila] = await destino.query('SELECT LAST_INSERT_ID() AS id', {
      type: Sequelize.QueryTypes.SELECT,
      transaction: txn,
    });
    return idFila.id;
  }

  async function insertarLote(tabla, cols, filasValores) {
    const placeholders = filasValores.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    await destino.query(
      `INSERT INTO \`${tabla}\` (\`${cols.join('`,`')}\`) VALUES ${placeholders}`,
      { replacements: filasValores.flatMap((v) => cols.map((c) => limpiarTexto(v[c]))), transaction: txn }
    );
    const [r] = await destino.query('SELECT LAST_INSERT_ID() AS id', {
      type: Sequelize.QueryTypes.SELECT,
      transaction: txn,
    });
    return { firstId: r.id, count: filasValores.length };
  }

  try {
    // ---- usuarios: docente destino + estudiantes (inserta solo lo que falte) ----
    let nDocente = 0;
    if (EMAIL_DESTINO) {
      mapa.personas[doc.id] = modoDestino.id;
      nDocente = 1;
      console.log(`- Docente destino existente: id ${modoDestino.id}`);
    } else {
      const usuarioCols = (await columnasDestino('users')).filter((c) => c !== 'id');
      const teacherCols = usuarioCols.filter((c) => c !== 'docente_id');
      const nuevoDocenteId = await insertarFila('users', teacherCols, doc);
      mapa.personas[doc.id] = nuevoDocenteId;
      nDocente = 1;
      console.log(`- Docente creado en destino: id ${nuevoDocenteId}`);
    }

    let nEstudiantes = 0;
    let reutilizados = 0;
    const usuarioCols = (await columnasDestino('users')).filter((c) => c !== 'id');
    for (const est of estudiantes) {
      const existente = await destino.query('SELECT id FROM users WHERE LOWER(email) = :e LIMIT 1', {
        type: Sequelize.QueryTypes.SELECT,
        replacements: { e: String(est.email).toLowerCase() },
      });
      if (existente[0]) {
        await destino.query('UPDATE users SET docente_id = :d WHERE id = :i', {
          replacements: { d: mapa.personas[doc.id], i: existente[0].id },
          transaction: txn,
        });
        mapa.personas[est.id] = existente[0].id;
        reutilizados++;
      } else {
        const valores = {};
        for (const c of usuarioCols) valores[c] = c === 'docente_id' ? mapa.personas[doc.id] : est[c];
        const nuevoId = await insertarFila('users', usuarioCols, valores);
        mapa.personas[est.id] = nuevoId;
        nEstudiantes++;
      }
    }
    console.log(`- users: ${nDocente} docente y ${nEstudiantes} estudiantes insertados (+${reutilizados} existentes reutilizados)`);

    // ---- tablas restantes con remapeo de FKs ----
    for (const tabla of ORDEN) {
      const filas = origen[tabla];
      if (!filas.length) {
        console.log(`- ${tabla}: 0 (sin datos)`);
        continue;
      }
      const contexto =
        tabla === 'grupos' ? 'grupos' :
        tabla === 'contenidos' ? 'contenidos' :
        tabla === 'juegos' ? 'juegos' :
        tabla === 'evaluaciones' ? 'evaluaciones' : null;
      const targetCols = await columnasDestino(tabla);
      const sourceCols = Object.keys(filas[0] || {});
      const cols = sourceCols.filter((c) => targetCols.includes(c) && c !== 'id');
      const claves = cols.filter((c) => !REMAP[tabla] || !REMAP[tabla][c]);
      const remaps = cols.filter((c) => REMAP[tabla] && REMAP[tabla][c]);
      const seen = new Set();
      let n = 0;
      let huefanas = 0;
      const pendientes = [];
      let baseId = null;
      let idx = 0;
      const flush = async () => {
        if (!pendientes.length) return;
        const r = await insertarLote(tabla, cols, pendientes);
        if (baseId == null) baseId = r.firstId;
        if (contexto) {
          for (const p of pendientes) {
            if (p._srcId != null) mapa[contexto][p._srcId] = baseId + idx;
            idx++;
          }
        } else {
          idx += pendientes.length;
        }
        n += pendientes.length;
        pendientes.length = 0;
      };
      for (const f of filas) {
        const valores = {};
        let salto = false;
        for (const c of claves) valores[c] = f[c];
        for (const c of remaps) {
          if (f[c] == null) {
            valores[c] = null;
            continue;
          }
          const mapaSel = REMAP[tabla][c];
          let nuevo;
          if (mapaSel === 'porTipo') {
            const mapaDeTipo = f.tipo === 'contenido' ? mapa.contenidos
              : f.tipo === 'juego' ? mapa.juegos
              : f.tipo === 'evaluacion' ? mapa.evaluaciones
              : null;
            nuevo = mapaDeTipo ? mapaDeTipo[f[c]] : null;
          } else {
            nuevo = mapa[mapaSel][f[c]];
          }
          if (nuevo == null) { salto = true; break; }
          valores[c] = nuevo;
        }
        if (salto) { huefanas++; continue; }
        const llave = JSON.stringify(valores);
        if (seen.has(llave)) continue;
        seen.add(llave);
        valores._srcId = f.id;
        pendientes.push(valores);
        if (pendientes.length >= 200) await flush();
      }
      await flush();
      console.log(`- ${tabla}: ${n} filas${huefanas ? ` (+${huefanas} omitidas por FK huérfano)` : ''}`);
    }
    await txn.commit();

    console.log('\nCopiado OK. Verificando conteos en destino...');
    let ok = true;
    for (const tabla of ORDEN) {
      const cols = await columnasDestino(tabla).catch(() => []);
      if (!cols.length) {
        console.log(`  [advertencia] ${tabla} no existe en destino`);
        ok = false;
        continue;
      }
      const filas = await destino.query(`SELECT COUNT(*) AS n FROM \`${tabla}\``, {
        type: Sequelize.QueryTypes.SELECT,
      });
      console.log(`  ${tabla}: origen ${origen[tabla].length} | destino total ${filas[0].n}`);
    }
    const [docDest] = await destino.query('SELECT id, name FROM users WHERE id = :id', {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { id: mapa.personas[doc.id] },
    });
    console.log(`\nDocente al que quedaron asociados los datos: id ${docDest.id} (${docDest.name})`);
    if (!ok) process.exitCode = 1;
  } catch (e) {
    await txn.rollback();
    throw e;
  }
}

main().then(() => {
  console.log('\nListo.');
  process.exit(process.exitCode || 0);
}).catch((e) => {
  console.error('\nFALLO:', e.message);
  process.exit(1);
});