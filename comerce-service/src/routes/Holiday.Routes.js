// routes/Holidays.Routes.js
const router = require('express').Router();
const ctrl = require('../controllers/Holiday.Controller');

router.post('/',    ctrl.createHoliday);
router.put('/:id',  ctrl.updateHoliday);
router.get('/:id',  ctrl.getHolidayById);
router.get('/',     ctrl.listHolidays);
router.delete('/:id', ctrl.deleteHoliday);

module.exports = router;
