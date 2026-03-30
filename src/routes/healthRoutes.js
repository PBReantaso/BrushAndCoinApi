const express = require('express');
const { isPostgresEnabled } = require('../config/database');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'brush-and-coin-api',
    storage: isPostgresEnabled() ? 'postgres' : 'memory',
  });
});

module.exports = { healthRoutes: router };
