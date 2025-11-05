export const env = {
  PORT: Number(process.env.PORT || 5010),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  MELI_ACCESS_TOKEN: process.env.MELI_ACCESS_TOKEN || ''
};
