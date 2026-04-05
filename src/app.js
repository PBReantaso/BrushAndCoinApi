const path = require('path');
const express = require('express');
const cors = require('cors');

const { authRoutes } = require('./routes/authRoutes');
const { commissionsRoutes } = require('./routes/commissionsRoutes');
const { contentRoutes } = require('./routes/contentRoutes');
const { notificationsRoutes } = require('./routes/notificationsRoutes');
const { usersRoutes } = require('./routes/usersRoutes');
const { healthRoutes } = require('./routes/healthRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(healthRoutes);
app.use(contentRoutes);
app.use(commissionsRoutes);
app.use(notificationsRoutes);
app.use('/users', usersRoutes);
app.use('/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };
