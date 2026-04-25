const service = require("../services/flashcards.service");

exports.getAll = async (req, res, next) => {
  try {
    const data = await service.getAll(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = await service.create(req.user.id, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
};