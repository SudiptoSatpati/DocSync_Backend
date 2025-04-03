import { Request, Response } from "express";
import User from "../models/User";
// import bcrypt from 'bcryptjs';
import mongoose from "mongoose";

// Search users by username or email

export const searchUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { query, limit } = req.query;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        status: "Error",
        data: null,
        message: "Search query is required",
        error: { code: 400, details: "Invalid query parameter" },
      });
    }

    const searchQuery = query.trim();
    const resultLimit = limit ? Math.min(Number(limit), 50) : 10; // Default: 10, Max: 50

    const users = await User.find({
      $or: [
        { username: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } },
      ],
    })
      .select("_id username email")
      .limit(resultLimit);

    return res.status(200).json({
      status: "SUCCESS",
      data: users,
      message: "Users retrieved successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error:", error);
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

//get user profile

export const getUserProfile = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.params.id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid user ID",
        error: { code: 400, details: "Provided ID is not valid" },
      });
    }

    // Fetch user excluding sensitive fields
    const user = await User.findById(userId).select(
      "-password -resetPasswordToken -resetPasswordExpires"
    );

    if (!user) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "User not found",
        error: { code: 404, details: "No user exists with the given ID" },
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      data: user,
      message: "User profile retrieved successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error in getUserProfile:", error);
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
