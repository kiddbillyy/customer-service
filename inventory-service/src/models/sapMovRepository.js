const pool = require('../config/dbSap');   // tu pool a SAP

const SapMovRepository = {
  /** Devuelve los movimientos pendientes, limitamos el lote para no sobrecargar */
  getPending: async (max = 500) => {
    const [rows] = await pool.query(
      `SELECT TOP (${max}) *
         FROM COMERCIAL_ENERO.dbo.Z_MovStockOMS WITH (ROWLOCK, READPAST)
        WHERE Estado = 'pendiente'
        ORDER BY ID`
    );
    return rows;
  },

  /** Marca un movimiento como integrado o con error  */
  markAsProcessed: async (id, ok, errorMsg = null) => {
    const estado = ok ? 'integrado' : 'error';
    await pool.query(
      `UPDATE COMERCIAL_ENERO.dbo.Z_MovStockOMS
          SET Estado = ?, Intentos = Intentos + 1, Error = ?
        WHERE ID = ?`,
      [estado, errorMsg, id]
    );
  }
};

module.exports = SapMovRepository;
