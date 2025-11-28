import express from 'express';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  searchCustomers
} from '../controllers/salesController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Search customers (for sale creation)
router.get('/customers/search', searchCustomers);

// Get all sales
router.get('/', getInvoices);

// Get single sale
router.get('/:id', getInvoiceById);

// Create sale
router.post('/', createInvoice);

// Update sale
router.put('/:id', updateInvoice);

// Delete sale (admin and master_user only)
router.delete('/:id', authorize('admin', 'master_user'), deleteInvoice);

export default router;

