const {
  sequelize,
  QueryTypes,
  MODULES,
  UNPUBLISH,
  DESCRIPTIONS,
  assertLocalTarget,
  ensureDocente,
  marcar,
} = require('./lib/seed-common');

const listar = (ids) => ids.map(() => '?').join(',');

const verificar = async (tabla, ids, docenteId) => {
  if (!ids.length) return new Map();
  const filas = await sequelize.query(
    `SELECT id, titulo FROM \`${tabla}\` WHERE docente_id = ? AND id IN (${listar(ids)})`,
    { replacements: [docenteId, ...ids], type: QueryTypes.SELECT }
  );
  const mapa = new Map(filas.map((f) => [Number(f.id), f]));
  const faltantes = ids.filter((id) => !mapa.has(Number(id)));
  if (faltantes.length) {
    throw new Error(`Faltan recursos en ${tabla} para el docente ${docenteId}: ${faltantes.join(', ')}`);
  }
  return mapa;
};

async function main() {
  assertLocalTarget();
  const docente = await ensureDocente();

  const contenidos = MODULES.flatMap((m) => m.contenidos);
  const juegos = MODULES.flatMap((m) => m.juegos);
  const evaluaciones = MODULES.flatMap((m) => m.evaluaciones);
  const todos = { contenidos, juegos, evaluaciones };

  const mapas = {
    contenidos: await verificar('contenidos', [...contenidos, ...UNPUBLISH.contenidos], docente.id),
    juegos: await verificar('juegos', [...juegos, ...UNPUBLISH.juegos], docente.id),
    evaluaciones: await verificar('evaluaciones', [...evaluaciones, ...UNPUBLISH.evaluaciones], docente.id),
  };

  marcar(`Catálogo de ${docente.email} (id ${docente.id})`);

  await sequelize.transaction(async (t) => {
    for (const modulo of MODULES) {
      const contentId = modulo.contenidos[0];

      for (const id of modulo.contenidos) {
        await sequelize.query(
          `UPDATE contenidos
              SET modulo = ?, descripcion = ?, publicado = 1, updated_at = NOW()
            WHERE id = ? AND docente_id = ?`,
          {
            replacements: [modulo.nombre, DESCRIPTIONS[`contenido:${id}`] || null, id, docente.id],
            transaction: t,
          }
        );
      }

      for (const id of modulo.juegos) {
        await sequelize.query(
          `UPDATE juegos
              SET modulo = ?, modulo_content_id = ?, descripcion = ?, publicado = 1, updated_at = NOW()
            WHERE id = ? AND docente_id = ?`,
          {
            replacements: [
              modulo.nombre,
              contentId,
              DESCRIPTIONS[`juego:${id}`] || null,
              id,
              docente.id,
            ],
            transaction: t,
          }
        );
      }

      for (const id of modulo.evaluaciones) {
        await sequelize.query(
          `UPDATE evaluaciones
              SET modulo = ?, modulo_content_id = ?, descripcion = ?, publicado = 1, updatedAt = NOW()
            WHERE id = ? AND docente_id = ?`,
          {
            replacements: [
              modulo.nombre,
              contentId,
              DESCRIPTIONS[`evaluacion:${id}`] || null,
              id,
              docente.id,
            ],
            transaction: t,
          }
        );
      }
    }

    for (const id of UNPUBLISH.contenidos) {
      await sequelize.query(
        'UPDATE contenidos SET publicado = 0, updated_at = NOW() WHERE id = ? AND docente_id = ?',
        { replacements: [id, docente.id], transaction: t }
      );
    }
    for (const id of UNPUBLISH.juegos) {
      await sequelize.query(
        'UPDATE juegos SET publicado = 0, updated_at = NOW() WHERE id = ? AND docente_id = ?',
        { replacements: [id, docente.id], transaction: t }
      );
    }
    for (const id of UNPUBLISH.evaluaciones) {
      await sequelize.query(
        'UPDATE evaluaciones SET publicado = 0, updatedAt = NOW() WHERE id = ? AND docente_id = ?',
        { replacements: [id, docente.id], transaction: t }
      );
    }
  });

  const resumen = await sequelize.query(
    `SELECT 'contenido' AS tipo, id, titulo, modulo, publicado FROM contenidos WHERE docente_id = ? AND id IN (${listar(todos.contenidos.concat(UNPUBLISH.contenidos))})
     UNION ALL
     SELECT 'juego' AS tipo, id, titulo, modulo, publicado FROM juegos WHERE docente_id = ? AND id IN (${listar(todos.juegos.concat(UNPUBLISH.juegos))})
     UNION ALL
     SELECT 'evaluacion' AS tipo, id, titulo, modulo, publicado FROM evaluaciones WHERE docente_id = ? AND id IN (${listar(todos.evaluaciones.concat(UNPUBLISH.evaluaciones))})
     ORDER BY modulo, tipo, id`,
    {
      replacements: [
        docente.id,
        ...todos.contenidos.concat(UNPUBLISH.contenidos),
        docente.id,
        ...todos.juegos.concat(UNPUBLISH.juegos),
        docente.id,
        ...todos.evaluaciones.concat(UNPUBLISH.evaluaciones),
      ],
      type: QueryTypes.SELECT,
    }
  );

  console.table(resumen.map((r) => ({
    tipo: r.tipo,
    id: r.id,
    modulo: r.modulo,
    publicado: r.publicado ? 'sí' : 'no',
    titulo: r.titulo,
  })));

  const keyPorTipo = { contenido: 'contenidos', juego: 'juegos', evaluacion: 'evaluaciones' };
  const faltan = resumen.filter(
    (r) => Number(r.publicado) !== 1 && !UNPUBLISH[keyPorTipo[r.tipo]]?.includes(Number(r.id))
  );
  if (faltan.length) {
    throw new Error(`Quedaron recursos sin publicar: ${faltan.map((r) => `${r.tipo}:${r.id}`).join(', ')}`);
  }

  console.log(`\nCatálogo listo: ${MODULES.length} módulos, ${contenidos.length} contenidos, ${juegos.length} juegos, ${evaluaciones.length} evaluaciones.`);
  console.log(`Despublicados: contenidos ${UNPUBLISH.contenidos.join(', ') || '-'} | juegos ${UNPUBLISH.juegos.join(', ') || '-'}.`);
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nERROR:', error.message);
    if (error.parent?.message) console.error('mysql:', error.parent.message);
    await sequelize.close();
    process.exit(1);
  });
