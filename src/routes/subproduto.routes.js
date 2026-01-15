const express = require('express');
const { consumirSubproduto } = require('../controllers/subproduto.controller');

const router = express.Router();

router.post('/consumir', consumirSubproduto);

module.exports = router;
