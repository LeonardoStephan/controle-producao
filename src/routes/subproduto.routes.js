const express = require('express');
const router = express.Router();
const {
  adicionarSubproduto,
  adicionarSubprodutosBatch,
  listarSubprodutos,
  atualizarSubproduto,
  removerSubproduto
} = require('../controllers/subproduto.controller');

router.post('/', adicionarSubproduto);
router.post('/batch', adicionarSubprodutosBatch);
router.get('/:opId', listarSubprodutos);
router.put('/:id', atualizarSubproduto);
router.delete('/:id', removerSubproduto);

module.exports = router;
