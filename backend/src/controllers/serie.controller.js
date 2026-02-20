const timelineSerieUseCase = require('../usecases/serie/timelineSerie.usecase');

const timelineSerie = async (req, res) => {
  const result = await timelineSerieUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  timelineSerie
};

