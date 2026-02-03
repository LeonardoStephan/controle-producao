const express = require('express');
const controller = require('../controllers/op.controller');

const router = express.Router();

router.post('/iniciar', controller.iniciarOp);
router.post('/:id/eventos', controller.adicionarEvento);
router.post('/:id/finalizar/:etapa', controller.finalizarEtapa);

// LOG CRONOLÓGICO DA OP
router.get('/:id/resumo', controller.resumoOp);

// RASTREABILIDADE DE MATERIAIS
router.get('/:id/rastreabilidade-materiais', controller.rastreabilidadeMateriais);

module.exports = router;
