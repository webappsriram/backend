import express from 'express';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getAllServiceRecords,
  deleteServiceRecord,
  getServiceRecordById,
  updateServiceRecord,
  getServiceRecordCommands,
  addServiceRecordCommands
} from '../controllers/serviceController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all service records (from dynamic tables with customer data)
router.get('/records', getAllServiceRecords);

// Get a single service record by ID
router.get('/records/:serviceId/:recordId', getServiceRecordById);

// Update a service record
router.put('/records/:serviceId/:recordId', updateServiceRecord);

// Get commands for a service record
router.get('/records/:serviceId/:recordId/commands', getServiceRecordCommands);

// Add commands to a service record
router.post('/records/:serviceId/:recordId/commands', addServiceRecordCommands);

// Delete a service record (admin and master_user only)
router.delete('/records/:serviceId/:recordId', authorize('admin', 'master_user'), deleteServiceRecord);

// Get all services
router.get('/', getServices);

// Get single service
router.get('/:id', getServiceById);

// Create service (admin and master_user only)
router.post('/', authorize('admin', 'master_user'), createService);

// Update service (admin and master_user only)
router.put('/:id', authorize('admin', 'master_user'), updateService);

// Delete service (admin and master_user only)
router.delete('/:id', authorize('admin', 'master_user'), deleteService);

export default router;

