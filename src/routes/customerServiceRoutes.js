import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  addServiceToCustomer,
  getCustomerServices,
  updateCustomerService,
  deleteCustomerService
} from '../controllers/customerServiceController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Add service to customer
router.post('/:customerId/services', addServiceToCustomer);

// Get all services for a customer
router.get('/:customerId/services', getCustomerServices);

// Update a customer service record
router.put('/:customerId/services/:serviceId/records/:recordId', updateCustomerService);

// Delete a customer service record (only admin and master_user)
router.delete('/:customerId/services/:serviceId/records/:recordId', authorize('admin', 'master_user'), deleteCustomerService);

export default router;

