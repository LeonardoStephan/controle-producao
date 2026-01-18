const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/op', require('./routes/op.routes'));
app.use('/pecas', require('./routes/peca.routes'));
app.use('/subproduto', require('./routes/subproduto.routes'));
app.use('/produto-final', require('./routes/produtoFinal.routes'));
app.use('/health', require('./routes/health.routes'));

module.exports = app;
