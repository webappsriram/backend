import express from 'express';
import {
  createLead,
  getLeads,
  checkCustomerLead
} from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all leads
router.get('/', getLeads);

// Check if customer is already a lead
router.get('/check/:customerId', checkCustomerLead);

// Create lead
router.post('/', createLead);

export default router;

