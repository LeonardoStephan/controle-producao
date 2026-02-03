const app = require('./app');
require('dotenv').config();

app.listen(3333, () => {
  console.log('Servidor rodando na porta 3333: http://localhost:3333/health');
});
