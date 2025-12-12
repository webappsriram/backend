import express from 'express';
import { signIn, signOut, getTodayStatus } from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get today's attendance status
router.get('/today', getTodayStatus);

// Sign in
router.post('/sign-in', signIn);

// Sign out
router.post('/sign-out', signOut);

export default router;

