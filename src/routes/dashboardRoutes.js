import express from 'express';
import { getDashboardStats, getWeeklyRevenue } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get weekly revenue
router.get('/weekly-revenue', getWeeklyRevenue);

export default router;

