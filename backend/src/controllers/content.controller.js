const path = require('path');

const ContentService = require('../services/content.service');
const GrupoService = require('../services/grupo.service');
const Content = require('../models/content.model');
const Group = require('../models/grupo.model');
const { sequelize } = require('../config/database');
const { QueryTypes, Op } = require('sequelize');

function getFileUrl(file) {
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, file.path);
  return '/uploads/' + relativePath.replace(/\\/g, '/');
}

function convertYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.trim() !== url) return url;
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)(?:[?&].*)?$/,
    /^(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]+)(?:[?&].*)?$/,
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)(?:[?&].*)?$/
  ];
  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }
  return url;
}

class ContentController {
  /**
   * Maneja la solicitud para crear un nuevo contenido.
   */
  static async crearContenido(req, res) {
    try {
      const data = req.body;
      data.docente_id = req.user.id;
      if (req.file) {
        data.contenido = getFileUrl(req.file);
      }
      if (data.contenido) {
        data.contenido = convertYouTubeUrl(data.contenido);
      }
      const nuevoContenido = await ContentService.crearContenido(data);
      
      res.status(201).json({
        success: true,
        message: 'Contenido creado exitosamente',
        data: nuevoContenido
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Maneja la solicitud para obtener la lista de contenidos.
   * Permite filtrar mediante query params (ej. /contenidos?modulo=matematicas)
   */
  static async obtenerContenidos(req, res) {
    try {
      const filtros = req.query;
      const esEstudiante = req.user.role === 'student' || req.user.role === 'estudiante';
      filtros.docente_id = esEstudiante ? req.user.docente_id : req.user.id;
      if (esEstudiante) {
        filtros.publicado = true;
        const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id, 'contenido');
        filtros[Op.or] = condiciones;
      }
      const contenidos = await ContentService.obtenerContenidos(filtros);
      
      res.status(200).json({
        success: true,
        data: contenidos
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Maneja la solicitud para obtener un contenido por su ID.
   */
  static async obtenerContenidoPorId(req, res) {
    try {
      const { id } = req.params;
      const where = { id };
      const esEstudiante = req.user.role === 'student' || req.user.role === 'estudiante';
      where.docente_id = esEstudiante ? req.user.docente_id : req.user.id;
      if (esEstudiante) {
        where.publicado = true;
        const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id, 'contenido');
        where[Op.or] = condiciones;
      }
      // Se incluye la lista de grupos para que el formulario de edición pueda
      // mostrar los grupos ya asignados.
      const contenido = await Content.findOne({
        where,
        include: [{
          model: Group,
          as: 'grupos',
          attributes: ['id', 'materia', 'nombre'],
          through: { attributes: [] },
        }],
      });
      if (!contenido) throw new Error('Contenido no encontrado');

      res.status(200).json({
        success: true,
        data: contenido
      });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Maneja la solicitud para actualizar un contenido existente.
   */
  static async actualizarContenido(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;
      if (req.file) {
        data.contenido = getFileUrl(req.file);
      }
      if (data.contenido) {
        data.contenido = convertYouTubeUrl(data.contenido);
      }
      
      const contenidoActualizado = await ContentService.actualizarContenido(id, data, req.user.id);
      
      res.status(200).json({
        success: true,
        message: 'Contenido actualizado exitosamente',
        data: contenidoActualizado
      });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Maneja la solicitud para eliminar un contenido.
   */
  static async eliminarContenido(req, res) {
    try {
      const { id } = req.params;
      await ContentService.eliminarContenido(id, req.user.id);
      
      res.status(200).json({
        success: true,
        message: 'Contenido eliminado exitosamente'
      });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('publicado')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Retorna los módulos únicos de los contenidos creados por el docente.
   */
  static async obtenerModulos(req, res) {
    try {
      const modulos = await sequelize.query(
        'SELECT id, titulo, modulo, publicado FROM contenidos WHERE docente_id = ? ORDER BY modulo ASC',
        { replacements: [req.user.id], type: QueryTypes.SELECT }
      );
      res.status(200).json({ success: true, data: modulos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async obtenerContenidosPorModulo(req, res) {
    try {
      const { modulo } = req.params;
      const contenidos = await Content.findAll({
        where: { modulo, docente_id: req.user.id },
        attributes: ['id', 'titulo', 'modulo', 'publicado', 'tipo']
      });
      res.status(200).json({ success: true, data: contenidos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = ContentController;
