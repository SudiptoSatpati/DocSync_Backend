import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendEmail } from "../utils/email";
import { isValidEmail } from "../utils/validators";
import mongoose from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || ("avdjyfjjaxdfhdfued" as string);

// Extend Express Request type to include 'user'
interface AuthRequest extends Request {
  user?: { _id: string };
}

/**
 * Interface for forgot password request body
 */
// interface ForgotPasswordRequest {
//     email: string;
//   }

interface ResetPasswordRequest {
  token: string;
  password: string;
}

// Register a new user
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Check if all fields are provided
    if (!username || !email || !password) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "All fields are required",
        error: { code: 400, details: "Missing username, email, or password" },
      });
      return;
    }

    // Check if user already exists
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "User already exists",
        error: { code: 400, details: "A user with this email already exists" },
      });
      return;
    }

    // Create new user
    const newUser = new User({
      username,
      email,
      password: password,
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, {
      expiresIn: "1111h",
    });

    res.status(201).json({
      status: "SUCCESS",
      data: {
        user: {
          id: newUser._id,
          username,
          email,
        },
        token,
      },
      message: "User registered successfully",
      error: null,
    });
  } catch (error) {
    console.error("Error registering user:", error);

    // Typecasting error to ensure TypeScript knows it’s an Error object
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";

    res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Server error",
      error: { code: 500, details: errorMessage },
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Email and password are required",
        error: { code: 400, details: "Missing email or password" },
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid email format",
        error: { code: 400, details: "Provide a valid email address" },
      });
      return;
    }

    if (typeof password !== "string") {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid password format",
        error: { code: 400, details: "Password must be a valid string" },
      });
      return;
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Invalid credentials",
        error: { code: 401, details: "No user found with this email" },
      });
      return;
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Invalid credentials",
        error: { code: 401, details: "Incorrect password" },
      });
      return;
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "5h" });

    res.status(200).json({
      status: "SUCCESS",
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
        token,
      },
      message: "User logged in successfully",
      error: null,
    });
  } catch (error) {
    console.error("Error logging in:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Server error",
      error: { code: 500, details: errorMessage },
    });
  }
};

// Get current user

// import { AuthRequest } from "../types/AuthRequest"; // Make sure this is correctly imported

export const getCurrentUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized access",
        error: { code: 401, details: "User not authenticated" },
      });
      return;
    }

    // Fetch user data
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      res.status(404).json({
        status: "ERROR",
        data: null,
        message: "User not found",
        error: { code: 404, details: "No user exists with this ID" },
      });
      return;
    }

    // Send response
    res.status(200).json({
      status: "SUCCESS",
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
      message: "User retrieved successfully",
      error: null,
    });
  } catch (error) {
    console.error("Error fetching user:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Server error",
      error: { code: 500, details: errorMessage },
    });
  }
};

// Log

export const logout = (_: Request, res: Response): void => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({
      status: "SUCCESS",
      data: null,
      message: "Logged out successfully",
      error: null,
    });
  } catch (error) {
    console.error("Error during logout:", error);

    res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Server error",
      error: {
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

//forget password

import { ForgotPasswordRequest } from "../types/AuthTypes";

export const forgotPassword = async (
  req: Request<{}, {}, ForgotPasswordRequest>,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    console.log("Forgot Password Request for:", email);

    // Check if user exists
    const user = await User.findOne({ email });

    // Prevent email enumeration attacks
    if (!user) {
      console.log("No user found with this email. Returning success response.");
      res.status(200).json({
        status: "SUCCESS",
        data: null,
        message:
          "If a user with that email exists, a password reset link has been sent.",
        error: null,
      });
      return;
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    console.log("Generated Reset Token:", resetToken);

    // Hash the token before storing in DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Store the hashed token & set expiration (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Create reset URL
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const resetUrl = `192.168.0.200:5173/reset-password/${resetToken}`;

    // Prepare email content
    const subject = "Password Reset Request";
    const text = `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`;

    // Send the reset email
    await sendEmail({
      email: user.email,
      subject,
      text,
    });

    console.log("Password reset email sent successfully.");

    res.status(200).json({
      status: "SUCCESS",
      data: null,
      message:
        "If a user with that email exists, a password reset link has been sent.",
      error: null,
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    // Rollback token if email sending fails
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
    }

    res.status(500).json({
      status: "ERROR",
      data: null,
      message:
        "Unable to process password reset request. Please try again later.",
      error: {
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

//reset password
import { isValidPassword } from "../utils/validators";

export const resetPassword = async (
  req: Request<{}, {}, ResetPasswordRequest>,
  res: Response
): Promise<void> => {
  try {
    const { token, password } = req.body;

    console.log("Received Token from Request:", token);

    // Validate password strength
    if (!isValidPassword(password)) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message:
          "Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.",
        error: { code: 400, details: "Weak password format" },
      });
      return;
    }

    // Hash the reset token to match DB storage
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    console.log("Hashed Token (For Comparison):", hashedToken);

    // Find user with the token and check expiration
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    // If no user found or token expired
    if (!user) {
      res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Password reset token is invalid or has expired.",
        error: { code: 400, details: "Invalid or expired token" },
      });
      return;
    }

    // Clear reset token before saving to prevent token reuse attacks
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Update password (assuming password hashing is handled in User model pre-save hook)
    user.password = password;
    await user.save();

    // Send confirmation email
    await sendEmail({
      email: user.email,
      subject: "Password Reset Successful",
      text: "Your password has been changed successfully. If you did not make this request, please contact our support team immediately.",
    });

    res.status(200).json({
      status: "SUCCESS",
      data: null,
      message: "Password has been reset successfully.",
      error: null,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Unable to reset password. Please try again later.",
      error: {
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

// Update user profile

export const updateUserProfile = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { username, email, password } = req.body;
    const userId = (req as any).user?._id; // Assuming user is attached to the request

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid user ID",
        error: { code: 400, details: "Provided ID is not valid" },
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "User not found",
        error: { code: 404, details: "No user exists with the given ID" },
      });
    }

    // Update username if provided
    if (username) user.username = username;

    // Validate and update email
    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({
          status: "ERROR",
          data: null,
          message: "Invalid email format",
          error: { code: 400, details: "Provide a valid email address" },
        });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser._id.toString() !== userId) {
        return res.status(400).json({
          status: "ERROR",
          data: null,
          message: "Email is already in use",
          error: { code: 400, details: "Another user is using this email" },
        });
      }
      user.email = email;
    }

    // Validate, hash, and update password
    if (password) {
      if (!isValidPassword(password)) {
        return res.status(400).json({
          status: "ERROR",
          data: null,
          message: "Weak password",
          error: {
            code: 400,
            details:
              "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.",
          },
        });
      }

      user.password = password;
    }

    await user.save();

    return res.status(200).json({
      status: "SUCCESS",
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
      message: "User profile updated successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error in updateUserProfile:", error);
    return res.status(500).json({
      status: "ERROR",
      data: null,
      message: "Server error",
      error: {
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
