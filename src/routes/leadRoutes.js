import express from 'express';
import {
  createLead,
  getLeads
} from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all leads
router.get('/', getLeads);

// Create lead
router.post('/', createLead);

export default router;

