const GroupService = require('../services/grupo.service');
const User = require('../models/User');

class GrupoController {
  static async obtenerGrupos(req, res) {
    try {
      const grupos = await GroupService.listarGrupos(req.user.id);
      const estudiantes = await User.findAll({
        where: { role: 'student', docente_id: req.user.id },
        attributes: ['id', 'name', 'email'],
        order: [['name', 'ASC']],
        raw: true,
      });
      res.status(200).json({ success: true, data: { grupos, estudiantes } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async crearGrupo(req, res) {
    try {
      const { materia, nombre } = req.body || {};
      if (!materia || !materia.trim() || !nombre || !nombre.trim()) {
        return res.status(400).json({ success: false, message: 'Debe indicar la materia y el nombre del grupo.' });
      }
      const grupo = await GroupService.crearGrupo(req.user.id, materia.trim(), nombre.trim());
      res.status(201).json({ success: true, message: 'Grupo creado exitosamente', data: grupo });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ success: false, message: 'Ya existe un grupo con ese nombre en esa materia.' });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async actualizarGrupo(req, res) {
    try {
      const { id } = req.params;
      const { materia, nombre } = req.body || {};
      if (!materia || !materia.trim() || !nombre || !nombre.trim()) {
        return res.status(400).json({ success: false, message: 'Debe indicar la materia y el nombre del grupo.' });
      }
      const grupo = await GroupService.actualizarGrupo(req.user.id, id, materia.trim(), nombre.trim());
      if (!grupo) {
        return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
      }
      res.status(200).json({ success: true, message: 'Grupo actualizado exitosamente', data: grupo });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ success: false, message: 'Ya existe un grupo con ese nombre en esa materia.' });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async eliminarGrupo(req, res) {
    try {
      const { id } = req.params;
      const result = await GroupService.eliminarGrupo(req.user.id, id);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
      }
      res.status(200).json({
        success: true,
        message: 'Grupo eliminado. Los recursos que apuntaban a él ahora son visibles para todos los estudiantes.'
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listarEstudiantesGrupo(req, res) {
    try {
      const { id } = req.params;
      const grupo = await GroupService.obtenerGrupo(req.user.id, id);
      if (!grupo) {
        return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
      }
      res.status(200).json({ success: true, data: grupo });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async asignarEstudiantes(req, res) {
    try {
      const { id } = req.params;
      const estudianteIds = (req.body && req.body.estudiante_ids) || [];

      if (!Array.isArray(estudianteIds)) {
        return res.status(400).json({ success: false, message: 'Recibió un formato inválido de estudiantes.' });
      }
      const idsLimpios = estudianteIds.map(Number).filter(n => Number.isInteger(n) && n > 0);

      const result = await GroupService.asignarEstudiantes(req.user.id, id, idsLimpios);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
      }
      res.status(200).json({ success: true, message: 'Estudiantes asignados al grupo correctamente', data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = GrupoController;