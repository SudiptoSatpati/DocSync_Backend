import express from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// ✅ Apply authentication middleware to all routes
router.use(authenticate);

// ✅ User routes
router.get('/search', userController.searchUsers);
router.get('/:id', userController.getUserProfile);


export default router;
