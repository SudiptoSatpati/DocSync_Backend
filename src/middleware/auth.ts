// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User';

// Define JwtPayload type if not already defined in your types file
export interface JwtPayload {
    id: string;
    iat?: number;
    exp?: number;
}

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (
    req: Request, 
    res: Response, 
    next: NextFunction
): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ 
            success: false, 
            errors: errors.array().map((err) => ({ 
                field: err.type === 'field' ? err.path : 'unknown',
                message: err.msg 
            }))
        });
        return;
    }
    next();
};

/**
 * Authentication middleware to verify JWT token and attach user to request
 */
export const authenticate = async (
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<void> => {
    try {
        let token = req.header("Authorization")?.replace("Bearer ", "") || "";

        if (!token) {
            console.log("🔴 No token provided");
            res.status(401).json({ 
                status : "ERROR",
                data : null, 
                message: "Unauthorized user",
             });
            return;
        }

        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || "avdjyfjjaxdfhdfuedf"
        ) as JwtPayload;

        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            console.log("🔴 User not found in DB");
            res.status(401).json({ 
                status : "ERROR",
                data : null, 
                message: "User not foud",
            });
            return;
        }

        // Type assertion for request with user
        (req as any).user = user;
        next();
    } catch (error) {
        console.error("❌ Authentication failed:", error);
        res.status(401).json({status : "ERROR",
            data : null, 
            message: "User not foud",});
    }
};

/**
 * Validator for forgot password route
 */
export const validateForgotPassword = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
        .trim(),
    handleValidationErrors
];
  
/**
 * Validator for reset password route
 */
export const validateResetPassword = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required')
        .trim(),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/\d/)
        .withMessage('Password must contain at least one number')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter'),
    handleValidationErrors
];



