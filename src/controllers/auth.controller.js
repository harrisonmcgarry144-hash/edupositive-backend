const authService = require("../services/auth.service");

exports.register = async (req, res, next) => {
  try {
    const data = await authService.register(req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const data = await authService.refresh(req.body.token);
    res.json(data);
  } catch (err) {
    next(err);
  }
};