export default (err, _req, res, _next) => {
  console.error(err);
  const code = err.statusCode || 500;
  res.status(code).json({ message: err.message || 'Gateway error' });
};