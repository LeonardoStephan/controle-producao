const express = require('express');
const router = express.Router();

const controller = require('../controllers/op.controller');

router.post('/', controller.criarOp);
router.post('/:id/eventos', controller.adicionarEvento);
router.post('/:id/montagem/finalizar', controller.finalizarMontagem);
router.get('/:id/resumo', controller.resumoOp);
router.post('/:id/teste/finalizar', controller.finalizarTeste);
router.post('/:id/embalagem-estoque/finalizar', controller.finalizarEmbalagemEstoque);

module.exports = router;
