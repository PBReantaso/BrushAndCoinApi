function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

function errorHandler(error, req, res, next) {
  const pgMsg = String(error?.message || '');
  if (
    error?.code === '23514' &&
    pgMsg.includes('commissions') &&
    pgMsg.includes('commissions_status_check')
  ) {
    return res.status(500).json({
      message:
        'This API database is missing commission migrations: status "pending" is not allowed. On the server that hosts this API, run `npm run migrate` (migrations 014 or 017 update commissions_status_check). The Postgres you checked with \\d may be a different instance than DATABASE_URL for this deploy.',
    });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || 'Internal server error.',
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
