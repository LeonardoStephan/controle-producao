const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando' });
});

// ⚠️ LINHA CRÍTICA
const opRoutes = require('./routes/op.routes');
app.use('/ops', opRoutes);

const webhookRoutes = require('./routes/webhook.routes');
app.use('/webhooks', webhookRoutes);

const subprodutoRoutes = require('./routes/subproduto.routes');
app.use('/subprodutos', subprodutoRoutes);

module.exports = app;
