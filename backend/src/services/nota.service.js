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

class NotaService {
  static get NOTA_MIN() { return NOTA_MIN; }
  static get NOTA_MAX() { return NOTA_MAX; }

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
    if (!Number.isFinite(n) || n < 3.0) return 'bajo';
    if (n < 3.6) return 'regular';
    if (n < 4.5) return 'bueno';
    return 'excelente';
  }
}

module.exports = NotaService;