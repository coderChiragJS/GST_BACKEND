const express = require('express');
const authMiddleware = require('../middleware/auth');
const gstController = require('../controllers/gstController');

const router = express.Router();

router.use(authMiddleware);

router.post('/gst/place-of-supply', gstController.placeOfSupply);
router.get('/gst/state-from-gstin', gstController.stateFromGstin);
router.get('/gst/hsn-rate', gstController.hsnRate);
router.get('/gst/validate-gstin', gstController.validateGstin);
router.get('/master/states', gstController.listStates);

module.exports = router;
