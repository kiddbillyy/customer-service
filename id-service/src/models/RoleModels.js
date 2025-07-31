 // models/RolesModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

async function getPlatformStructure(plataformaCod) {
  await IdServicePoolConnect;

  const req   = IdServicePool.request();
  console.log("Request pool: ",req)

  const { recordset } = await IdServicePool.request()
    .input('plat', sql.NVarChar(50), plataformaCod)
    .query(`
      SELECT
        mp.ID           AS ModuloID,
        mp.NOMBRE       AS ModuloNombre,
        mp.CODIGO       AS ModuloCodigo,
        sm.ID           AS SubModuloID,
        sm.NOMBRE       AS SubModuloNombre,
        sm.CODIGO       AS SubModuloCodigo,
        ta.ID           AS AccionID,
        ta.NOMBRE       AS AccionNombre,
        ta.CODIGO       AS AccionCodigo
      FROM      PLATAFORMAS p
      JOIN      MODULOS_PLATAFORMA mp ON mp.PLATAFORMA_ID = p.ID
      LEFT JOIN SUBMODULOS sm          ON sm.MODULO_ID     = mp.ID -- <-- CAMBIO AQUÍ
      CROSS     JOIN TIPOS_ACCION ta
      WHERE     p.CODIGO = @plat
      ORDER     BY mp.ID, sm.ID, ta.ID
    `);
  const out = [];
  for (const row of recordset) {
    let modulo = out.find(m => m.id === row.ModuloID);
    if (!modulo) {
      modulo = { id: row.ModuloID, codigo: row.ModuloCodigo, nombre: row.ModuloNombre, submodulos: [] };
      out.push(modulo);
    }
    if (row.SubModuloID) {
      let sub = modulo.submodulos.find(s => s.id === row.SubModuloID);
      if (!sub) {
        sub = { id: row.SubModuloID, codigo: row.SubModuloCodigo, nombre: row.SubModuloNombre, acciones: [] };
        modulo.submodulos.push(sub);
      }
      sub.acciones.push({ id: row.AccionID, codigo: row.AccionCodigo, nombre: row.AccionNombre });
    }
  }
  return out;
}

async function createRole({ nombre, descripcion, plataformaCod, permisos }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const platId = (await tx.request()
      .input('p', sql.NVarChar(50), plataformaCod)
      .query(`SELECT ID FROM PLATAFORMAS WHERE CODIGO=@p`)
    ).recordset[0]?.ID;
    if (!platId) throw new Error('PLATFORM_NOT_FOUND');

    const roleResult = await tx.request()
      .input('n', sql.NVarChar(50),  nombre)
      .input('d', sql.NVarChar(255), descripcion)
      .query(`
        INSERT INTO ROLES (NOMBRE, DESCRIPCION)
        OUTPUT INSERTED.ID
        VALUES (@n, @d);
      `);

    const newRoleId = roleResult.recordset[0].ID;

    const req = tx.request();
    const rows = permisos.flatMap((p, i) =>
      p.acciones.map((ac, j) => ({
        subModuloCod: p.subModuloCod,
        accionCod: ac,
        idx: i * 10 + j
      }))
    );
    rows.forEach(r => {
      req.input(`sub${r.idx}`, sql.NVarChar(50), r.subModuloCod);
      req.input(`ac${r.idx}`,  sql.NVarChar(20), r.accionCod);
    });

    const values = rows.map(r => `
      (
        ${newRoleId},
        (SELECT sm.ID FROM SUBMODULOS sm WHERE sm.CODIGO=@sub${r.idx}),
        (SELECT ta.ID FROM TIPOS_ACCION ta WHERE ta.CODIGO=@ac${r.idx}),
        1 
      )
    `).join(',');

    await req.query(`
      INSERT INTO ROL_SUBMODULO_ACCION (ROL_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
      VALUES ${values};
    `);

    await tx.commit();
    return { roleId: newRoleId };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { getPlatformStructure, createRole };
