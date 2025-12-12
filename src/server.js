import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';
import initDatabase from './database/init.js';
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import customerServiceRoutes from './routes/customerServiceRoutes.js';
import serviceCommandRoutes from './routes/serviceCommandRoutes.js';
import userRoutes from './routes/userRoutes.js';
import passwordRoutes from './routes/passwordRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import formDataRoutes from './routes/formDataRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database tables
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

// Routes
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.getConnection();
    res.json({ 
      status: 'ok', 
      message: 'Server is running',
      database: 'connected'
    });
  } catch (error) {
    res.json({ 
      status: 'ok', 
      message: 'Server is running',
      database: 'disconnected'
    });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// Customer routes
app.use('/api/customers', customerRoutes);

// Customer Service routes (for adding services to customers)
app.use('/api/customers', customerServiceRoutes);

// Service Command routes (for managing commands/notes)
app.use('/api/customers', serviceCommandRoutes);

// Service routes
app.use('/api/services', serviceRoutes);

// User routes (admin and master_user only)
app.use('/api/users', userRoutes);

// Password routes (public)
app.use('/api/password', passwordRoutes);

// Sales routes
app.use('/api/sales', salesRoutes);

// Lead routes
app.use('/api/leads', leadRoutes);

// Dashboard routes
app.use('/api/dashboard', dashboardRoutes);

// Form Data routes
app.use('/api/form-data', formDataRoutes);

// Attendance routes
app.use('/api/attendance', attendanceRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

