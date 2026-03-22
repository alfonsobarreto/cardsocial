require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const vaultRoutes = require('./routes/vault');
const contactRoutes = require('./routes/contacts');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

const app = express();

// Security & logging
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'test' ? 'silent' : 'dev'));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404 handler
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => {
      console.error('DB connection failed:', err.message);
      process.exit(1);
    });
}

module.exports = app;
