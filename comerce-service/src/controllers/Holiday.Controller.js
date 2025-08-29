// controllers/Holidays.Controller.js
const model = require('../models/HolidayModels');
const { publishholidayEvent } = require('../utils/Kafka/HolidaysEvents')

async function createHoliday(req, res) {
  try {
    const { name, day, status = 'active', target = {}, scope = null, description = null, user = 'API' } = req.body;
    const out = await model.createHoliday({ name, day, status, target, scope, description, user });
    
    (async () => {
      try {
        await publishholidayEvent({
          action: 'holiday.created',
          holiday: out,
          userId: user
        });
      } catch (e) {
        console.error('Kafka publish holiday.created failed:', e);
      }
    })();
    
    return res.status(201).json({ id: String(out.id), message: 'Holiday creada.' });
  } catch (err) {
    const map = { NAME_REQUIRED: 400, DAY_INVALID: 400 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al crear holiday.' });
  }
}

async function updateHoliday(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    const { name, day, status, target, scope, description, user = 'API' } = req.body;
    const out = await model.updateHoliday({ id, name, day, status, target, scope, description, user });
    
    (async () => {
      try {
        await publishholidayEvent({
          action: 'holiday.updated',
          holiday: out,
          userId: user
        });
      } catch (e) {
        console.error('Kafka publish holiday.updated failed:', e);
      }
    })();

    return res.status(200).json({ id: String(out.id), message: 'Holiday actualizada.' });
  } catch (err) {
    const map = { HOLIDAY_NOT_FOUND: 404, DAY_INVALID: 400 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al actualizar holiday.' });
  }
}

async function getHolidayById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    const row = await model.getHolidayById({ id });
    if (!row) return res.status(404).json({ message: 'Holiday no encontrada.' });
    return res.status(200).json(row);
  } catch {
    return res.status(500).json({ message: 'Error al obtener holiday.' });
  }
}

async function listHolidays(req, res) {
  try {
    const { active = null, dateFrom = null, dateTo = null, q = null } = req.query;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 100;

    const items = await model.listHolidays({ active, dateFrom, dateTo, q, page, pageSize });
    return res.status(200).json({ total: items.length, items });
  } catch {
    return res.status(500).json({ message: 'Error al listar holidays.' });
  }
}

async function deleteHoliday(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    await model.deleteHoliday({ id });

    (async () => {
      try {
        await publishholidayEvent({
          action: 'holiday.deleted',
          holiday: { Id: id }, // mínimo para el evento
          userId: req.body?.user || 'API'
        });
      } catch (e) {
        console.error('Kafka publish holiday.deleted failed:', e);
      }
    })();

    return res.status(200).json({ id: String(id), message: 'Holiday eliminada.' });
  } catch (err) {
    const map = { HOLIDAY_NOT_FOUND: 404 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al eliminar holiday.' });
  }
}

module.exports = {
  createHoliday,
  updateHoliday,
  getHolidayById,
  listHolidays,
  deleteHoliday,
};
