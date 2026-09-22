const GameService = require('../services/game.service');
const StudentService = require('../services/student.service');
const GrupoService = require('../services/grupo.service');
const { Op } = require('sequelize');

class GameController {
  static async crearJuego(req, res) {
    try {
      const data = req.body;
      data.docente_id = req.user.id;
      const nuevoJuego = await GameService.crearJuego(data);
      res.status(201).json({ success: true, message: 'Juego creado exitosamente', data: nuevoJuego });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async obtenerJuegos(req, res) {
    try {
      const filtros = req.query;
      const esEstudiante = req.user.role === 'student' || req.user.role === 'estudiante';
      filtros.docente_id = esEstudiante ? req.user.docente_id : req.user.id;
      if (esEstudiante) {
        filtros.publicado = true;
        const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id);
        filtros[Op.or] = condiciones;
      }
      const juegos = await GameService.obtenerJuegos(filtros);
      res.status(200).json({ success: true, data: juegos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async obtenerJuegoPorId(req, res) {
    try {
      const { id } = req.params;
      const juego = await GameService.obtenerJuegoPorId(id, req.user);
      if (req.user && (req.user.role === 'student' || req.user.role === 'estudiante')) {
        const acceso = await GrupoService.estudianteAccedeRecurso(req.user.id, juego);
        if (!acceso) {
          return res.status(404).json({
            success: false,
            message: 'Juego no encontrado o no disponible para ti.'
          });
        }
        const contenidoCompletado = await StudentService.esContenidoModuloCompletado(req.user.id, juego.modulo, req.user.docente_id);
        if (!contenidoCompletado) {
          return res.status(403).json({
            success: false,
            message: '🔒 Completa el contenido para desbloquear esta actividad.'
          });
        }
      }
      res.status(200).json({ success: true, data: juego });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async actualizarJuego(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;
      const juegoActualizado = await GameService.actualizarJuego(id, data, req.user.id);
      res.status(200).json({ success: true, message: 'Juego actualizado exitosamente', data: juegoActualizado });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('publicado')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async eliminarJuego(req, res) {
    try {
      const { id } = req.params;
      const result = await GameService.eliminarJuego(id, req.user.id);
      let message = 'Juego eliminado correctamente.';
      if (result.affectedCount > 0) {
        message += ' El progreso relacionado fue actualizado automáticamente.';
      }
      res.status(200).json({ success: true, message });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('publicado')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async responderJuego(req, res) {
    try {
      const { id } = req.params;
      const datosIntento = req.body;
      if (!datosIntento || Object.keys(datosIntento).length === 0) {
        return res.status(400).json({ success: false, message: 'Debe enviar los datos del intento en el cuerpo de la petición (body).' });
      }
      const resultado = await GameService.responderJuego(id, datosIntento);
      res.status(200).json({ success: true, message: 'Intento procesado y calificado exitosamente', data: resultado });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = GameController;
