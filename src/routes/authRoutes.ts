import express from 'express';
import * as authController from '../controllers/authController';
import { authenticate, validateForgotPassword, validateResetPassword } from '../middleware/auth';
import {validate} from '../middleware/validate'
import { Request, Response, NextFunction } from "express";


const router = express.Router();

// Public routes
router.post('/register',validate, authController.register);
router.post('/login', (req: Request, res: Response, next: NextFunction)=>{
 console.log('REQUEST =>', req);
 res;
 next();
},authController.login);

// Route to request a password reset
router.post('/send-reset-link', validateForgotPassword, authController.forgotPassword);

// Route to reset password with token
router.post('/reset-password', validateResetPassword, authController.resetPassword);


// Protected routes
router.get('/profile', authenticate, authController.getCurrentUser);
router.put('/profile',authenticate, authController.updateUserProfile);
router.delete('/logout', authenticate, authController.logout);

export default router;
