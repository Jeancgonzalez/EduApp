const DiagnosticoService = require('../services/diagnostico.service');
const User = require('../models/User');

/**
 * Controlador del IAD-Primaria (Misión Digital).
 * Endpoints exclusivos del rol estudiante: consulta de estado, inicio/reanudación
 * de la misión y registro de cada respuesta. El cálculo vive en el service.
 */
class DiagnosticoController {
  /**
   * GET /student/diagnostico
   * Estado actual: pendiente / en_progreso (con siguiente situación) / completado.
   * `obligatorio` indica si el docente configuró la misión como requisito previo
   * para usar el aplicativo (lo lee el frontend para bloquear la navegación).
   */
  static async getStatus(req, res) {
    try {
      const [estado, user] = await Promise.all([
        DiagnosticoService.obtenerEstado(req.user.id),
        User.findByPk(req.user.id, { attributes: ['iad_obligatorio'], raw: true }),
      ]);
      res.json({
        success: true,
        data: {
          ...estado,
          obligatorio: user ? Boolean(user.iad_obligatorio) : false,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /student/diagnostico/iniciar
   * Crea la aplicación (si no existe) y devuelve la primera situación o la
   * siguiente pendiente si venía a medias.
   */
  static async iniciar(req, res) {
    try {
      const estado = await DiagnosticoService.iniciar(req.user.id);
      res.json({ success: true, data: estado });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /student/diagnostico/responder  { pregunta_id, letra }
   * Guarda la elección al instante y devuelve la siguiente situación o el
   * resultado final si completó las 10.
   */
  static async responder(req, res) {
    try {
      const { pregunta_id, letra } = req.body;
      if (!pregunta_id) {
        return res.status(400).json({ success: false, message: 'Falta la situación a responder.' });
      }
      if (!letra) {
        return res.status(400).json({ success: false, message: 'Falta la opción elegida.' });
      }
      const resultados = await DiagnosticoService.responder(req.user.id, pregunta_id, letra);
      res.json({ success: true, data: resultados });
    } catch (error) {
      // Errores de validación del negocio (misión no iniciada, opción inválida) → 400.
      const status = /(no hay una misión|no encontrada|no válida)/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}

module.exports = DiagnosticoController;