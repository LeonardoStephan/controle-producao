process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${'http://localhost:3333/health'}`));
