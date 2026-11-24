/**
 * NotaService
 * -------------
 * Servicio central de conversión de puntos a nota en la escala de calificación
 * colombiana (1.0 a 5.0). Todas las vistas (docente, reportes, etc.) deben pasar
 * por aquí para evitar fórmulas duplicadas e inconsistencias.
 *
 * Convenciones aplicadas (validadas):
 *  - nota = clamp((puntos obtenidos / puntos máximos posibles) * 5.0, 1.0, 5.0)
 *    redondeada a 1 decimal.
 *  - El piso visible es 1.0: un estudiante con 0 puntos obtiene nota 1.0
 *    (mínimo de la escala colombiana estándar).
 *  - Los puntos máximos posibles por módulo = Σ puntaje_max de juegos visibles
 *    + Σ 100 por evaluación visible. Los contenidos otorgan 0 puntos y no
 *    participan del máximo.
 *  - Clasificación de rendimiento sobre la nota:
 *      Bajo      < 3.0
 *      Regular   3.0 - 3.5
 *      Bueno     3.6 - 4.4
 *      Excelente >= 4.5
 */

const NOTA_MIN = 1.0;
const NOTA_MAX = 5.0;

/**
 * Cortes de la categoría de rendimiento sobre la nota (1.0-5.0). Un valor
 * corresponde a la categoría en la que EMPIEZA: `regular` desde 3.0, etc.
 * Es la única definición de la escala; el resto de la app la consume para no
 * volver a duplicar cortes.
 */
const CORTES = {
  bajo: 0,
  regular: 3.0,
  bueno: 3.6,
  excelente: 4.5,
};

/** Etiqueta visible de cada categoría, en el mismo orden que `CORTES`. */
const ETIQUETAS = {
  bajo: 'Bajo',
  regular: 'Regular',
  bueno: 'Bueno',
  excelente: 'Excelente',
};

class NotaService {
  static get NOTA_MIN() { return NOTA_MIN; }
  static get NOTA_MAX() { return NOTA_MAX; }
  static get CORTES() { return { ...CORTES }; }
  static get ETIQUETAS() { return { ...ETIQUETAS }; }

  /**
   * Convierte puntos obtenidos a nota en escala 1.0-5.0 (1 decimal).
   * Devuelve null cuando no existen actividades puntuables (maximo <= 0),
   * es decir, cuando la nota no es significativa para ese conjunto.
   *
   * @param {number} obtenido - Puntos obtenidos (best-score por actividad).
   * @param {number} maximo   - Puntos máximos posibles (Σ máximos de recursos puntuables).
   * @returns {number|null}
   */
  static calcularNota(obtenido, maximo) {
    const max = Number(maximo);
    if (!Number.isFinite(max) || max <= 0) return null;

    const obt = Math.max(0, Number(obtenido) || 0);
    const proporcion = Math.min(1, obt / max);
    const nota = Math.min(NOTA_MAX, Math.max(NOTA_MIN, proporcion * NOTA_MAX));

    // Redondeo a 1 decimal (ej. 0.05 -> 0.1). La clasificación usa esta
    // misma nota redondeada para que coincida con la nota visible.
    return Math.round(nota * 10) / 10;
  }

  /**
   * Suma de puntos máximos posibles de un conjunto de juegos y evaluaciones.
   * Los juegos aportan su `puntaje_max` (default 100) y las evaluaciones 100
   * (su puntaje siempre se calcula como correctas/total * 100).
   *
   * @param {Array} juegos       - Juegos visibles (objetos con `puntaje_max`).
   * @param {Array} evaluaciones - Evaluaciones visibles (solo se usa la cantidad).
   * @returns {number}
   */
  static maximaPuntuacion(juegos = [], evaluaciones = []) {
    const juegosMax = (juegos || []).reduce((sum, g) => sum + (Number(g?.puntaje_max) || 100), 0);
    return juegosMax + (evaluaciones || []).length * 100;
  }

  /**
   * Clasifica una nota (1.0-5.0) en una categoría de rendimiento.
   * Los valores no numéricos o nulos se tratan como Bajo (sin evidencia de logro).
   *
   * @param {number|null} nota
   * @returns {'bajo'|'regular'|'bueno'|'excelente'}
   */
  static clasificarNota(nota) {
    const n = Number(nota);
    if (!Number.isFinite(n) || n < CORTES.regular) return 'bajo';
    if (n < CORTES.bueno) return 'regular';
    if (n < CORTES.excelente) return 'bueno';
    return 'excelente';
  }

  /**
   * Categoría de rendimiento como etiqueta visible (Bajo/Regular/Bueno/Excelente).
   * Devuelve `null` cuando no hay nota: la interfaz muestra "Sin datos" en vez de
   * inventar un "Bajo" que haría ver mal a un estudiante sin evaluar.
   *
   * @param {number|null} nota
   * @returns {'Bajo'|'Regular'|'Bueno'|'Excelente'|null}
   */
  static etiquetaDeNota(nota) {
    if (nota == null || nota === '') return null;
    const n = Number(nota);
    if (!Number.isFinite(n)) return null;
    return ETIQUETAS[NotaService.clasificarNota(n)];
  }
}

module.exports = NotaService;