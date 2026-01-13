const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Importar rotas
const opRoutes = require('./routes/op.routes');
const subprodutoRoutes = require('./routes/subproduto.routes');
const webhookRoutes = require('./routes/webhook.routes');
const healthRoutes = require('./routes/health.routes');

// Registrar rotas
app.use('/op', opRoutes);
app.use('/subprodutos', subprodutoRoutes);
app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);

module.exports = app;