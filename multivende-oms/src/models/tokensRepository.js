import sql from 'mssql';
import { getPool } from '../db/connection.js';

const PROVIDER = 'multivende';

export async function getTokenRow(merchantId = null) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('provider', sql.NVarChar(50), PROVIDER)
    .input('merchantId', sql.NVarChar(100), merchantId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.OauthTokens
      WHERE provider = @provider
        AND ISNULL(merchantId,'') = ISNULL(@merchantId,'')
    `);
  return recordset[0] || null;
}

export async function upsertToken({
  merchantId = null,
  clientId,
  clientSecret,
  accessToken,
  refreshToken,
  expiresAt,    // ISO string o Date
  scope = null,
  notes = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input('provider',     sql.NVarChar(50),  PROVIDER)
    .input('merchantId',   sql.NVarChar(100), merchantId)
    .input('clientId',     sql.NVarChar(100), clientId || null)
    .input('clientSecret', sql.NVarChar(200), clientSecret || null)
    .input('accessToken',  sql.NVarChar(sql.MAX), accessToken || null)
    .input('refreshToken', sql.NVarChar(200), refreshToken || null)
    .input('expiresAt',    expiresAt ? new Date(expiresAt) : null)
    .input('scope',        sql.NVarChar(400), scope || null)
    .input('notes',        sql.NVarChar(400), notes || null)
    .query(`
      MERGE dbo.OauthTokens AS tgt
      USING (SELECT @provider AS provider, @merchantId AS merchantId) AS src
      ON (tgt.provider = src.provider AND ISNULL(tgt.merchantId,'') = ISNULL(src.merchantId,''))
      WHEN MATCHED THEN UPDATE SET
        clientId     = COALESCE(@clientId, tgt.clientId),
        clientSecret = COALESCE(@clientSecret, tgt.clientSecret),
        accessToken  = @accessToken,
        refreshToken = COALESCE(@refreshToken, tgt.refreshToken),
        expiresAt    = @expiresAt,
        scope        = COALESCE(@scope, tgt.scope),
        notes        = COALESCE(@notes, tgt.notes),
        updatedAt    = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (provider, merchantId, clientId, clientSecret, accessToken, refreshToken, expiresAt, scope, notes)
        VALUES (@provider, @merchantId, @clientId, @clientSecret, @accessToken, @refreshToken, @expiresAt, @scope, @notes);
    `);
  return result.rowsAffected?.[0] ?? 0;
}
