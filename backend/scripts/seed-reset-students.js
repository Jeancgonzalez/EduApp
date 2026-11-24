const {
  sequelize,
  QueryTypes,
  SIM_PREFIX,
  assertLocalTarget,
  ensureDocente,
  getStudents,
  backupDatabase,
  marcar,
} = require('./lib/seed-common');

const marcadores = (ids) => ids.map(() => '?').join(',');

const contar = async (sql, replacements) => {
  const filas = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return Number(filas[0]?.n || 0);
};

const recolectar = async (docenteId, ids) => {
  const apps = await sequelize.query(
    `SELECT id FROM diagnostico_aplicaciones WHERE estudiante_id IN (${marcadores(ids)})`,
    { replacements: ids, type: QueryTypes.SELECT }
  );
  const appIds = apps.map((a) => Number(a.id));

  const schedules = await sequelize.query(
    'SELECT id FROM report_schedules WHERE docente_id = ? AND nombre LIKE ?',
    { replacements: [docenteId, `${SIM_PREFIX}%`], type: QueryTypes.SELECT }
  );
  const scheduleIds = schedules.map((s) => Number(s.id));

  return { appIds, scheduleIds };
};

const resumen = async (docenteId, ids, appIds, scheduleIds) => ({
  estudiantes: ids.length,
  intentos: await contar(
    `SELECT COUNT(*) n FROM actividad_intentos WHERE docente_id = ? AND estudiante_id IN (${marcadores(ids)})`,
    [docenteId, ...ids]
  ),
  respuestas_evaluacion: await contar(
    `SELECT COUNT(*) n FROM evaluacion_intento_respuestas eir
       JOIN actividad_intentos ai ON ai.id = eir.intento_id
      WHERE ai.docente_id = ? AND ai.estudiante_id IN (${marcadores(ids)})`,
    [docenteId, ...ids]
  ),
  elementos_juego: await contar(
    `SELECT COUNT(*) n FROM juego_intento_elementos jie
       JOIN actividad_intentos ai ON ai.id = jie.intento_id
      WHERE ai.docente_id = ? AND ai.estudiante_id IN (${marcadores(ids)})`,
    [docenteId, ...ids]
  ),
  sesiones: await contar(
    `SELECT COUNT(*) n FROM estudiante_sesion WHERE docente_id = ? AND estudiante_id IN (${marcadores(ids)})`,
    [docenteId, ...ids]
  ),
  medallas: await contar(
    `SELECT COUNT(*) n FROM medallas_obtenidas WHERE estudiante_id IN (${marcadores(ids)})`,
    ids
  ),
  progreso_estudiante: await contar(
    `SELECT COUNT(*) n FROM progreso_estudiante WHERE estudiante_id IN (${marcadores(ids)})`,
    ids
  ),
  progreso: await contar(
    `SELECT COUNT(*) n FROM progreso WHERE usuario_id IN (${marcadores(ids)})`,
    ids
  ),
  diagnosticos: appIds.length,
  respuestas_diagnostico: appIds.length
    ? await contar(
        `SELECT COUNT(*) n FROM diagnostico_respuestas WHERE aplicacion_id IN (${marcadores(appIds)})`,
        appIds
      )
    : 0,
  feedback: await contar(
    `SELECT COUNT(*) n FROM feedback_docente WHERE estudiante_id IN (${marcadores(ids)})`,
    ids
  ),
  notificaciones_sim: await contar(
    'SELECT COUNT(*) n FROM notifications WHERE docente_id = ? AND titulo LIKE ?',
    [docenteId, `${SIM_PREFIX}%`]
  ),
  reportes_sim: scheduleIds.length
    ? await contar(
        `SELECT COUNT(*) n FROM report_runs WHERE schedule_id IN (${marcadores(scheduleIds)})`,
        scheduleIds
      )
    : 0,
  programaciones_sim: scheduleIds.length,
});

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirm = process.argv.includes('--confirm');

  assertLocalTarget();
  const docente = await ensureDocente();
  const estudiantes = await getStudents(docente.id);
  const ids = [...new Set(estudiantes.map((e) => Number(e.id)))];

  if (!ids.length) {
    throw new Error(`No se encontraron estudiantes ${SIM_PREFIX} del docente ${docente.email}.`);
  }

  const { appIds, scheduleIds } = await recolectar(docente.id, ids);
  const antes = await resumen(docente.id, ids, appIds, scheduleIds);

  marcar(`Reset de telemetría de ${docente.email} (id ${docente.id})`);
  console.table(antes);

  if (dryRun) {
    console.log('\nDry run: no se borró nada.');
    return;
  }

  if (!confirm) {
    console.log('\nNo se borró nada. Para ejecutar el reset agrega --confirm.');
    console.log('Sugerencia: corre primero con --dry-run.');
    return;
  }

  const respaldo = await backupDatabase();
  console.log(`\nRespaldo creado: ${respaldo}`);

  await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE eir FROM evaluacion_intento_respuestas eir
         JOIN actividad_intentos ai ON ai.id = eir.intento_id
        WHERE ai.docente_id = ? AND ai.estudiante_id IN (${marcadores(ids)})`,
      { replacements: [docente.id, ...ids], transaction: t }
    );

    await sequelize.query(
      `DELETE jie FROM juego_intento_elementos jie
         JOIN actividad_intentos ai ON ai.id = jie.intento_id
        WHERE ai.docente_id = ? AND ai.estudiante_id IN (${marcadores(ids)})`,
      { replacements: [docente.id, ...ids], transaction: t }
    );

    await sequelize.query(
      `DELETE FROM actividad_intentos WHERE docente_id = ? AND estudiante_id IN (${marcadores(ids)})`,
      { replacements: [docente.id, ...ids], transaction: t }
    );

    await sequelize.query(
      `DELETE FROM estudiante_sesion WHERE docente_id = ? AND estudiante_id IN (${marcadores(ids)})`,
      { replacements: [docente.id, ...ids], transaction: t }
    );

    await sequelize.query(
      `DELETE FROM medallas_obtenidas WHERE estudiante_id IN (${marcadores(ids)})`,
      { replacements: ids, transaction: t }
    );

    await sequelize.query(
      `DELETE FROM progreso_estudiante WHERE estudiante_id IN (${marcadores(ids)})`,
      { replacements: ids, transaction: t }
    );

    await sequelize.query(
      `DELETE FROM progreso WHERE usuario_id IN (${marcadores(ids)})`,
      { replacements: ids, transaction: t }
    );

    await sequelize.query(
      `DELETE FROM feedback_docente WHERE estudiante_id IN (${marcadores(ids)})`,
      { replacements: ids, transaction: t }
    );

    if (appIds.length) {
      await sequelize.query(
        `DELETE FROM diagnostico_respuestas WHERE aplicacion_id IN (${marcadores(appIds)})`,
        { replacements: appIds, transaction: t }
      );
      await sequelize.query(
        `DELETE FROM diagnostico_aplicaciones WHERE id IN (${marcadores(appIds)})`,
        { replacements: appIds, transaction: t }
      );
    }

    await sequelize.query(
      'DELETE FROM notifications WHERE docente_id = ? AND titulo LIKE ?',
      { replacements: [docente.id, `${SIM_PREFIX}%`], transaction: t }
    );

    if (scheduleIds.length) {
      await sequelize.query(
        `DELETE FROM report_runs WHERE schedule_id IN (${marcadores(scheduleIds)})`,
        { replacements: scheduleIds, transaction: t }
      );
      await sequelize.query(
        `DELETE FROM report_schedules WHERE id IN (${marcadores(scheduleIds)})`,
        { replacements: scheduleIds, transaction: t }
      );
    }

    await sequelize.query(
      `UPDATE users SET last_login_at = NULL WHERE id IN (${marcadores(ids)})`,
      { replacements: ids, transaction: t }
    );
  });

  const despues = await resumen(docente.id, ids, [], []);
  marcar('Después del reset');
  console.table(despues);

  const pendientes = Object.entries(despues).filter(([clave, valor]) => clave !== 'estudiantes' && Number(valor) > 0);
  if (pendientes.length) {
    throw new Error(`Quedaron filas sin borrar: ${pendientes.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  console.log('\nReset completado.');
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
