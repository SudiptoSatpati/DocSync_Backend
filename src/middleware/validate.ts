import { Request, Response, NextFunction } from "express";
import { isValidEmail, isValidPassword } from "../utils/validators";

export const validate = (req: Request, res: Response, next: NextFunction): void => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({
            status: "error",
            data: null,
            message: "Email and password are required",
            error: { code: 400, details: "Missing email or password" }
        });
        return;
    }

    if (!isValidEmail(email)) {
        res.status(400).json({
            status: "error",
            data: null,
            message: "Invalid email format",
            error: { code: 400, details: "Provide a valid email address" }
        });
        return;
    }

    if (!isValidPassword(password)) {
        res.status(400).json({
            status: "error",
            data: null,
            message: "Weak password",
            error: {
                code: 400,
                details: "Password must be at least 8 characters long and include uppercase, lowercase, a number, and a special character"
            }
        });
        return;
    }

    next(); // Proceed to controller if validation passes
};
