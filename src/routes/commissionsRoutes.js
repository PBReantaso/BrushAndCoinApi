const express = require('express');
const commissionsController = require('../controllers/commissionsController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/commissions', requireAuth, commissionsController.listCommissions);
router.get('/commissions/:id', requireAuth, commissionsController.getCommission);
router.post('/commissions', requireAuth, commissionsController.createCommission);
router.put('/commissions/:id/status', requireAuth, commissionsController.updateCommissionStatus);

module.exports = { commissionsRoutes: router };
