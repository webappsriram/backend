import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../controllers/customerController.js';

const router = express.Router();

// All customer routes require authentication
router.use(authenticate);

// Get all customers
router.get('/', getCustomers);

// Get single customer
router.get('/:id', getCustomerById);

// Create customer
router.post('/', createCustomer);

// Update customer
router.put('/:id', updateCustomer);

// Delete customer (only admin and master_user)
router.delete('/:id', authorize('admin', 'master_user'), deleteCustomer);

export default router;

