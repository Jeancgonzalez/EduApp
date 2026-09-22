require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const StudentProgress = require('./src/models/studentProgress.model');
const Progress = require('./src/models/progress.model');
const ProgressService = require('./src/services/progress.service');
const NotaService = require('./src/services/nota.service');
require('./src/models/associations');

// Distintivo para poder identificar y borrar estos datos después.
const TAG = 'demo-jean';

// [nombre, puntajeJuego, puntajeEvaluacion] -> total = suma (máx módulo = 200).
// Categorías objetivo: 3 Bajo, 4 Regular, 5 Bueno, 3 Excelente.
const PLAN = [
  { name: 'Carlos Bajo Demográfico',  juego: 0,   eval: 0   },
  { name: 'Luna Rendimiento Bajo',    juego: 30,  eval: 30  },
  { name: 'Mateo Puntaje Mínimo',     juego: 50,  eval: 50  },
  { name: 'Sofía Aprobado Mínimo',    juego: 100, eval: 20  },
  { name: 'Emma Nota Tres Cero',      juego: 70,  eval: 60  },
  { name: 'Dylan Nota Tres Cuatro',   juego: 65,  eval: 70  },
  { name: 'Valentina Nota Tres Cinco',juego: 100, eval: 40  },
  { name: 'David Nota Tres Ocho',     juego: 100, eval: 50  },
  { name: 'Mariana Nota Tres Nueve',  juego: 75,  eval: 80  },
  { name: 'Santiago Nota Cuatro',     juego: 90,  eval: 70  },
  { name: 'Camila Nota Cuatro Uno',   juego: 85,  eval: 80  },
  { name: 'Nicolás Nota Cuatro Cuatro',   juego: 75,  eval: 100 },
  { name: 'Isabella Nota Cuatro Cinco',   juego: 100, eval: 80  },
  { name: 'Sebastián Nota Cuatro Ocho',   juego: 100, eval: 90  },
  { name: 'Antonella Nota Cinco',         juego: 100, eval: 100 },
];

const PASSWORD = '123456';

(async () => {
  let teacher;
  try {
    await sequelize.authenticate();
    teacher = await User.findOne({ where: { email: 'jeancar1616@hotmail.com' }, raw: true });
    if (!teacher) throw new Error('Docente jeancar1616@hotmail.com no encontrado.');

    const modulo = 'Introducción a la informática';
    const juegoId = 361;
    const evalId = 202;
    const contenidoId = 225;

    // Puntos máximos del módulo = 100 (juego) + 100 (evaluación) = 200.
    const maxModulo = NotaService.maximaPuntuacion([{ puntaje_max: 100 }], [{}]);
    console.log(`Máximo del módulo "${modulo}": ${maxModulo} pts\n`);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(PASSWORD, salt);

    const filas = [];
    for (let i = 0; i < PLAN.length; i++) {
      const p = PLAN[i];
      const email = `jean.${TAG}.${String(i + 1).padStart(2, '0')}@test.com`;

      // Evitar duplicados si el script se corre dos veces.
      const yaExiste = await User.findOne({ where: { email } });
      if (yaExiste) { console.log(`SKIP (ya existe) ${email}`); continue; }

      const user = await User.create({
        name: p.name,
        email,
        password: hash,
        role: 'student',
        docente_id: teacher.id,
        emailVerified: true,
        iad_obligatorio: false, // sin Misión Digital obligatoria para poder entrar al área de estudiante
      });

      // Contenido: solo completado (0 pts). Juego y evaluación: puntaje directo (0-100).
      const hoy = new Date();
      await StudentProgress.create({ estudiante_id: user.id, contenido_id: contenidoId, completado: true, puntaje: 0, fecha: new Date(hoy - (i + 1) * 86400000) });
      await StudentProgress.create({ estudiante_id: user.id, juego_id: juegoId, completado: true, puntaje: p.juego, fecha: new Date(hoy - i * 86400000) });
      await StudentProgress.create({ estudiante_id: user.id, evaluacion_id: evalId, completado: true, puntaje: p.eval, fecha: hoy });

      await ProgressService.recalcularProgreso(user.id, modulo, null, teacher.id);

      const row = await Progress.findOne({ where: { usuario_id: user.id, modulo } });
      const total = row ? row.puntaje_total : p.juego + p.eval;
      const nota = NotaService.calcularNota(total, maxModulo);
      const cat = NotaService.clasificarNota(nota);
      filas.push({ email, name: p.name, juego: p.juego, eval: p.eval, total, max: maxModulo, nota, cat });
    }

    console.log('\n=== ESTUDIANTES CREADOS / SKIPPED ===');
    console.table(filas);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close().catch(() => {});
    process.exit(0);
  }
})();