const CuentasService = require('../services/cuentas.service');

class CuentasController {
  static async list(req, res) {
    try {
      const students = await CuentasService.getStudentsByTeacher(req.user.id);
      res.json({ success: true, data: students });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async detail(req, res) {
    try {
      const student = await CuentasService.getStudentDetail(req.params.id, req.user.id);
      res.json({ success: true, data: student });
    } catch (error) {
      const status = error.message.includes('no tienes permisos') || error.message.includes('no encontrado') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { name, email, password, iadObligatorio } = req.body;
      const student = await CuentasService.updateStudent(req.params.id, req.user.id, { name, email, password, iadObligatorio });
      res.json({ success: true, message: 'Cuenta actualizada correctamente.', data: student });
    } catch (error) {
      const status = error.message.includes('No tienes permisos') ? 403
        : error.message.includes('ya registrado') ? 400
        : error.message.includes('al menos 8') ? 400
        : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async remove(req, res) {
    try {
      await CuentasService.deleteStudent(req.params.id, req.user.id);
      res.json({ success: true, message: 'Estudiante eliminado correctamente.' });
    } catch (error) {
      const status = error.message.includes('No tienes permisos') ? 403 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async revealPassword(req, res) {
    try {
      const password = await CuentasService.revealPassword(req.params.id, req.user.id);
      res.json({ success: true, data: { password } });
    } catch (error) {
      const status = error.message.includes('no tienes permisos') || error.message.includes('no encontrado') ? 404
        : error.message.includes('No hay contraseña') ? 400
        : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async register(req, res) {
    try {
      const { name, email, password, iadObligatorio } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Faltan campos obligatorios.' });
      }
      const student = await CuentasService.registerStudent(req.user.id, { name, email, password, iadObligatorio });
      res.status(201).json({ success: true, message: 'Estudiante registrado correctamente.', data: student });
    } catch (error) {
      const status = error.message.includes('ya registrado') || error.message.includes('al menos 8') ? 400 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}

module.exports = CuentasController;