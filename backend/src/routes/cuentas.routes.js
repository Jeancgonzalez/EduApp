const express = require('express');
const router = express.Router();
const CuentasController = require('../controllers/cuentas.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');

router.use(verifyToken);
router.use(isTeacher);

router.get('/', CuentasController.list);
router.get('/:id', CuentasController.detail);
router.put('/:id', CuentasController.update);
router.delete('/:id', CuentasController.remove);
router.post('/:id/reveal-password', CuentasController.revealPassword);
router.post('/register', CuentasController.register);

module.exports = router;