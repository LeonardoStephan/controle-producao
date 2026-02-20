const express = require('express');
const controller = require('../controllers/adminFuncionario.controller');

const router = express.Router();

router.get('/funcionarios', controller.listar);
router.post('/funcionarios', controller.criar);
router.put('/funcionarios/:id', controller.atualizar);
router.patch('/funcionarios/:id/ativo', controller.alterarAtivo);
router.delete('/funcionarios/:id', controller.remover);

module.exports = router;

