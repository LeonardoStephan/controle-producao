const express = require('express');
const controller = require('../controllers/op.controller');
const router = express.Router();

router.post('/iniciar', controller.iniciarOp);
router.post('/:id/eventos', controller.adicionarEvento);
router.post('/:id/finalizar/:etapa', controller.finalizarEtapa);

// LOG CRONOLÓGICO DAS ETAPAS DA OP
router.get('/:id/resumo', controller.resumoOp);

// RASTREABILIDADE DE MATERIAIS UTILIZADOS NO PROCESSO
router.get('/:id/rastreabilidade-materiais', controller.rastreabilidadeMateriais);

module.exports = router;
