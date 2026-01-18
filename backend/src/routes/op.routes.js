const express = require('express');
const controller = require('../controllers/op.controller');

const router = express.Router();

router.post('/iniciar', controller.iniciarOp);
router.post('/:id/eventos', controller.adicionarEvento);
router.post('/:id/finalizar/:etapa', controller.finalizarEtapa);

router.get('/:id/resumo', controller.resumoOp);
router.get('/:id/rastreabilidade', controller.rastreabilidadeOp);


module.exports = router;
