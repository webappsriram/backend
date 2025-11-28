import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getAllUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';

const router = express.Router();

// All user routes require authentication and admin/master_user role
router.get('/', authenticate, authorize('admin', 'master_user'), getAllUsers);
router.post('/', authenticate, authorize('admin', 'master_user'), createUser);
router.put('/:id', authenticate, authorize('admin', 'master_user'), updateUser);
router.delete('/:id', authenticate, authorize('admin', 'master_user'), deleteUser);

export default router;

