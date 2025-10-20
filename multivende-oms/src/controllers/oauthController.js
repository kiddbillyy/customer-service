import { z } from 'zod';

export const handleRefresh = (req, res) => {
  const candidate = req.body.refresh_token || req.headers['x-refresh-token'] || req.headers['x-admin-key'];
  const schema = z.object({ refresh_token: z.string().min(10).regex(/^rt-/) });
  const parsed = schema.safeParse({ refresh_token: String(candidate || '') });

  if (!parsed.success) {
    return res.status(422).json({
      message: 'Validation failed',
      issues: parsed.error.issues
    });
  }

  const refreshToken = parsed.data.refresh_token;
  // TODO: validar token en DB y generar nuevo
  return res.json({
    access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJfaWQiOiJmZmNhMGZhMi00ZDM3LTRhNGUtYjE3MC0yY2I5Njk2ODYyOTkiLCJPYXV0aENsaWVudElkIjoiMmExZTZlODQtOGNiYS00MmY3LTgwYWYtODJkMDkzZTBhMzg2IiwiTWVyY2hhbnRJZCI6Ijk4Mjk0NzkxLTAzNzQtNDMyNi04NTUzLWMzOTRmZWY3ZGUxZSIsIk1lcmNoYW50QXBwSWQiOiI2ZGRkNGY2Yi0zNTRkLTQ5ZTAtYmUzOS0xNzRkMWViMmFiMTMiLCJDcmVhdGVkQnlJZCI6ImYxODBmYmQ1LTk5ZmYtNDY4OC1iNDQ1LWQ3YzdkYzY1MzYzYyIsIlVwZGF0ZWRCeUlkIjoiZjE4MGZiZDUtOTlmZi00Njg4LWI0NDUtZDdjN2RjNjUzNjNjIiwiT3duZXJJZCI6ImYxODBmYmQ1LTk5ZmYtNDY4OC1iNDQ1LWQ3YzdkYzY1MzYzYyIsImV4cGlyZXNBdCI6IjIwMjUtMTAtMTNUMTk6MzI6NTUuMjY2WiIsInJlZnJlc2hUb2tlbiI6InJ0LWY2ZWE4ODUyLTJjNjEtNGM4Ny1iZWI5LTI2NDEzNDE4MWExMCIsInJlZnJlc2hUb2tlbkV4cGlyZXNBdCI6IjIwMjUtMTAtMTVUMTM6MzI6NTUuMjY2WiIsImlhdCI6MTc2MDM2MjM3NSwiZXhwIjoxNzYwMzgzOTc1fQ.sEwfGwb1pAVDcdujNlgYFRGYQIRU4CTcq9epbOJyvVIqxmA3DNqu6dHPs1vpVpjEf4oXotmjscD9TAKwXJOXAxoOBzMtDaE_tJdtv1k9fis78gCxmaiQnB0YzCR3LhMUKSv7tVXqdvdOlSfbsv0tJqqasceToDkH5pNpD1Irttd0Hy-uZHLhc3hCupW1djAdVgvuGNUeH8tSCuuGfgPp1IfOAqjEe3rKv13ssvnNKXGDYkf5hJPxPxOw8k-dm6ixGWtEbeoRsKRgx1Uq-iLcitJUm0LmASyhHTpv9D6eb-AFdXEYyMpualNoBMxOM4htXv4H9cHKVCUO86ifyfTsibj5gwahaRbd8WWWAYulxs-m1OzcHu1JOZYoIFmoaPiDoiKySCbhT9NZRfZc5rM6HGqhJz4gXg02jDeCYycv_vgIKl2-w4FgCifYXkMzDoFyBEn1Ld4zc93PQkHZidRVlyD6tQBtQeCUe5ehEqE8I0yWj51Yc1xdXadM-F3-IoZkBVV0gnYA_PN6Mpv6gV9fjZRiePe2bFx5H6KOu85ho8xC8_NkNVx89-Eg-njpmOmUVm86CnPErg6XHVyknlvWmJaJuYntrymXov4pMLlXuEgzyB0AHnWClWKytSUMIl87TQPa4wD-9SYIK8P2wTZYZvEBLu2CHrfPFe8HpHlbjfA',
    refresh_token: 'rt-f6ea8852-2c61-4c87-beb9-264134181a10',
    token_type: 'Bearer',
    expires_in: 3600
  });
};
