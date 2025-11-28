import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  addCommandsToService,
  getServiceCommands,
  updateCommand,
  deleteCommand
} from '../controllers/serviceCommandController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Add commands to a service record
router.post('/:customerId/services/:serviceId/records/:recordId/commands', addCommandsToService);

// Get commands for a service record
router.get('/:customerId/services/:serviceId/records/:recordId/commands', getServiceCommands);

// Update a command
router.put('/:customerId/services/:serviceId/records/:recordId/commands/:commandId', updateCommand);

// Delete a command
router.delete('/:customerId/services/:serviceId/records/:recordId/commands/:commandId', deleteCommand);

export default router;

