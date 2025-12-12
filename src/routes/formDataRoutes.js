import express from 'express';
import {
  createFormData,
  getFormData,
  getFormDataById,
  updateFormData,
  deleteFormData
} from '../controllers/formDataController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all form data
router.get('/', getFormData);

// Get form data by ID
router.get('/:id', getFormDataById);

// Create form data
router.post('/', createFormData);

// Update form data
router.put('/:id', updateFormData);

// Delete form data
router.delete('/:id', deleteFormData);

export default router;

