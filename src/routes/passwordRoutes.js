import express from 'express';
import { setPasswordWithToken, verifyToken, requestPasswordReset, resetPasswordWithToken } from '../controllers/passwordController.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/set-password', setPasswordWithToken);
router.post('/reset-password', resetPasswordWithToken);
router.post('/forgot-password', requestPasswordReset);
router.get('/verify-token/:token', verifyToken);

export default router;

