const express = require('express');
const cors = require('cors');

const { authRoutes } = require('./routes/authRoutes');
const { contentRoutes } = require('./routes/contentRoutes');
const { healthRoutes } = require('./routes/healthRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);
app.use(contentRoutes);
app.use('/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };
