const express = require('express');
const router = express.Router();
const {
  criarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp
} = require('../controllers/op.controller');

router.post('/', criarOp);
router.post('/:id/eventos', adicionarEvento);
router.post('/:id/finalizar/:etapa', finalizarEtapa);
router.get('/:id/resumo', resumoOp);

module.exports = router;
