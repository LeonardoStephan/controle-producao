const express = require('express');
const {
  adicionarSubproduto,
  listarSubprodutos,
  atualizarSubproduto,
  removerSubproduto
} = require('../controllers/subproduto.controller');

const router = express.Router();

router.post('/', adicionarSubproduto);
router.get('/op/:opId', listarSubprodutos);
router.put('/:id', atualizarSubproduto);
router.delete('/:id', removerSubproduto);

module.exports = router;
