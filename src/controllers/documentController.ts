import { Request, Response } from "express";
import Document from "../models/Document";
import DocumentVersion from "../models/DocumentVersion";
import User, { IUser } from "../models/User";
import redis from "../config/redis"; // Import Redis client

interface AuthRequest extends Request {
  user?: { _id: string };
}

export const createDocument = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { title, content } = req.body;

    // Check if the user is authenticated
    if (!req.user) {
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    // Validate title (Ensure non-empty)
    if (!title || typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid title",
        error: { code: 400, details: "Title cannot be empty" },
      });
    }

    // Ensure content is a non-empty string (default to a placeholder if empty)
    const documentContent = content && content.trim() !== "" ? content : " ";

    // Create the document
    const document = await Document.create({
      title: title.trim(),
      content: documentContent,
      owner: req.user._id,
    });

    // Create the first document version
    await DocumentVersion.create({
      document: document._id,
      versionNumber: 1,
      content: documentContent,
      createdBy: req.user._id,
    });

    const userId = req.user._id.toString();

    // Invalidate user's documents cache
    // We need to invalidate the main documents list cache, not a specific document
    const cacheKey = `user:${userId}:documents`;
    await redis.del(cacheKey);

    // Additionally, invalidate any paginated document caches for this user
    const keyPattern = `user:${userId}:documents:page*`;
    const paginatedCacheKeys = await redis.keys(keyPattern);
    if (paginatedCacheKeys.length > 0) {
      await redis.del(paginatedCacheKeys);
    }

    console.log(`🗑️ Document list cache invalidated for user ${userId}`);

    return res.status(201).json({
      status: "SUCCESS",
      data: document,
      message: "Document created successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error creating document:", error);
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

// Get all documents with Redis caching, pagination, and sorting
export const getDocuments = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  if (!req.user) {
    return res.status(401).json({
      status: "ERROR",
      data: null,
      message: "Unauthorized",
      error: { code: 401, details: "User authentication required" },
    });
  }

  const userId = req.user._id as string;

  // Pagination parameters
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Create a unique cache key that includes pagination parameters
  const cacheKey = `user:${userId}:documents:page${page}:limit${limit}`;

  try {
    // Try to get documents from Redis cache first
    const cachedDocuments = await redis.get(cacheKey);

    if (cachedDocuments) {
      console.log(`✅ Using cached documents from Redis for page ${page}`);
      return res.status(200).json({
        status: "SUCCESS",
        data: JSON.parse(cachedDocuments),
        message: "Documents retrieved successfully from cache",
        error: null,
        pagination: {
          page,
          limit,
          hasMore: JSON.parse(cachedDocuments).length === limit,
        },
      });
    }

    // If not in cache, fetch from database with pagination and sorting by createdAt in descending order
    const documents = await Document.find({
      $or: [{ owner: userId }, { "collaborators.user": userId }],
    })
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order (newest first)
      .skip(skip)
      .limit(limit)
      .populate("owner", "username email")
      .populate("collaborators.user", "username email");

    // Count total documents for pagination info
    const totalDocuments = await Document.countDocuments({
      $or: [{ owner: userId }, { "collaborators.user": userId }],
    });

    const documentsWithOwnership = documents.map((doc) => ({
      ...doc.toObject(),
      isOwner: doc.owner._id.toString() === userId.toString(),
    }));

    // Store in Redis with expiration (e.g., 5 minutes)
    await redis.setex(
      cacheKey,
      300, // 5 minutes expiration
      JSON.stringify(documentsWithOwnership)
    );

    // Calculate if there are more pages
    const hasMore = skip + documents.length < totalDocuments;

    return res.status(200).json({
      status: "SUCCESS",
      data: documentsWithOwnership,
      message: "Documents retrieved successfully",
      error: null,
      pagination: {
        page,
        limit,
        total: totalDocuments,
        totalPages: Math.ceil(totalDocuments / limit),
        hasMore,
      },
    });
  } catch (error) {
    console.error("❌ Error in getDocuments:", error);
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

// Get a document by ID with Redis caching
export const getDocumentById = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    // Ensure the user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    const userId = req.user._id.toString();
    const documentId = req.params.id;
    const cacheKey = `document:${documentId}:user:${userId}`;

    // Try to get document from Redis cache
    const cachedDocument = await redis.get(cacheKey);

    if (cachedDocument) {
      console.log("✅ Using cached document from Redis");
      return res.status(200).json({
        status: "SUCCESS",
        data: JSON.parse(cachedDocument),
        message: "Document retrieved successfully from cache",
        error: null,
      });
    }

    // Fetch document and populate owner & collaborators
    const document = await Document.findById(documentId)
      .populate("owner", "username email")
      .populate("collaborators.user", "username email");
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: { code: 404, details: "No document exists with the given ID" },
      });
    }

    const documentWithOwnership = {
      ...document.toObject(),
      isOwner: document.owner._id.toString() === userId.toString(),
    };

    // If document does not exist

    // Check if user has access (owner or collaborator)
    const isOwner = document.owner._id.toString() === userId;
    const isCollaborator = document.collaborators.some(
      (c) => c.user._id.toString() === userId
    );

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Access denied",
        error: {
          code: 403,
          details: "User does not have permission to access this document",
        },
      });
    }

    // Cache the document in Redis with expiration (e.g., 5 minutes)
    await redis.setex(
      cacheKey,
      300, // 5 minutes expiration
      JSON.stringify(documentWithOwnership)
    );

    return res.status(200).json({
      status: "SUCCESS",
      data: documentWithOwnership,
      message: "Document retrieved successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error in getDocumentById:", error);
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

// Use this function to invalidate cache when documents are updated
export const invalidateDocumentCache = async (
  documentId: string,
  userId: string
): Promise<void> => {
  try {
    // Delete specific document cache
    await redis.del(`document:${documentId}:user:${userId}`);

    // Delete user's document list cache
    await redis.del(`user:${userId}:documents`);

    console.log(
      `✅ Cache invalidated for document ${documentId} and user ${userId}`
    );
  } catch (error) {
    console.error("❌ Error invalidating cache:", error);
  }
};

// Update a document
export const updateDocument = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    // Ensure user is authenticated

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    const { title, content } = req.body;
    const userId = req.user._id.toString(); // Store user ID safely

    await invalidateDocumentCache(req.params.id, userId);

    // Find document by ID
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: { code: 404, details: "No document exists with the given ID" },
      });
    }

    // Check if user is the owner or has edit permissions
    const isOwner = document.owner.toString() === userId;
    const collaborator = document.collaborators.find(
      (c) => c.user.toString() === userId
    );

    if (!isOwner && (!collaborator || collaborator.permission !== "edit")) {
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Permission denied",
        error: {
          code: 403,
          details: "User does not have edit rights for this document",
        },
      });
    }

    const collaborators = document.get("collaborators") || [];
    // Invalidate Redis cache for all collaborators
    if (collaborators && collaborators.length > 0) {
      for (const collaborator of collaborators) {
        const collaboratorId = collaborator.user.toString();
        await invalidateDocumentCache(req.params.id, collaboratorId);
      }
    }
    // Update document properties
    if (title) document.title = title;
    if (content !== undefined) {
      document.content = content;
      document.currentVersion += 1;

      // Create a new document version
      await DocumentVersion.create({
        document: document._id,
        versionNumber: document.currentVersion,
        content,
        createdBy: userId,
      });
    }

    document.updatedAt = new Date();
    await document.save();

    return res.status(200).json({
      status: "SUCCESS",
      data: document,
      message: "Document updated successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error in updateDocument:", error);
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

// Delete a document
export const deleteDocument = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    // Ensure the user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    const userId = req.user._id.toString(); // Store user ID safely
    const documentId = req.params.id;

    // Find the document
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: { code: 404, details: "No document exists with the given ID" },
      });
    }

    // Check if the user is the owner
    if (document.owner.toString() !== userId) {
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Permission denied",
        error: { code: 403, details: "Only the document owner can delete it" },
      });
    }

    // Delete all related versions of the document
    await DocumentVersion.deleteMany({ document: document._id });

    // Delete the document
    await Document.deleteOne({ _id: document._id });
    await invalidateDocumentCache(req.params.id, userId);

    const collaborators = document.get("collaborators") || [];
    // Invalidate Redis cache for all collaborators
    if (collaborators && collaborators.length > 0) {
      for (const collaborator of collaborators) {
        const collaboratorId = collaborator.user.toString();
        await invalidateDocumentCache(req.params.id, collaboratorId);
      }
    }

    return res.status(200).json({
      status: "SUCCESS",
      data: null,
      message: "Document deleted successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error deleting document:", error);
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

// Get document versions
export const getDocumentVersions = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    console.log("🔹 User making request:", req.user);

    // Ensure user is authenticated
    if (!req.user || !req.user._id) {
      console.log("🔴 No user attached to request");
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    const userId = req.user._id.toString();
    const documentId = req.params.id;

    // Find the document
    const document = await Document.findById(documentId);
    if (!document) {
      console.log("🔴 Document not found");
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: { code: 404, details: "No document exists with the given ID" },
      });
    }

    console.log("🔹 Document Owner:", document.owner.toString());
    console.log(
      "🔹 Collaborators:",
      document.collaborators.map((c) => c.user.toString())
    );

    // Check access permissions
    const isOwner = document.owner.toString() === userId;
    const isCollaborator = document.collaborators.some(
      (c) => c.user.toString() === userId
    );

    if (!isOwner && !isCollaborator) {
      console.log("🔴 User does not have access");
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Access denied",
        error: {
          code: 403,
          details: "You are not authorized to view this document's versions",
        },
      });
    }

    // Fetch document versions
    const versions = await DocumentVersion.find({ document: document._id })
      .sort({ versionNumber: -1 })
      .populate("createdBy", "username email");

    console.log("✅ Access granted, sending versions...");
    return res.status(200).json({
      status: "SUCCESS",
      data: versions,
      message: "Document versions retrieved successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error fetching document versions:", error);
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

// Roll back to a specific version
export const rollbackToVersion = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { versionNumber } = req.params;

    // Validate versionNumber
    const parsedVersion = parseInt(versionNumber, 10);
    if (isNaN(parsedVersion) || parsedVersion < 1) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid version number",
        error: {
          code: 400,
          details: "Version number must be a positive integer",
        },
      });
    }

    // Find document
    const document = await Document.findById(req.params.id);
    if (!document) {
      console.log("🔴 Document not found");
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: {
          code: 404,
          details: "No document exists with the provided ID",
        },
      });
    }

    if (!req.user) {
      console.log("🔴 No user authenticated");
      return res.status(401).json({
        status: "ERROR",
        data: null,
        message: "Unauthorized",
        error: { code: 401, details: "User authentication required" },
      });
    }

    console.log("🔹 Document Owner:", document.owner.toString());
    console.log(
      "🔹 Collaborators:",
      document.collaborators.map((c) => ({
        id: c.user.toString(),
        permission: c.permission,
      }))
    );
    console.log("🔹 Requesting User ID:", req.user._id);

    // Check permissions
    const userId = String(req.user._id);
    const isOwner = String(document.owner) === userId;
    const collaborator = document.collaborators.find(
      (c) => String(c.user) === userId
    );

    console.log("🔹 Is Owner?", isOwner);
    console.log(
      "🔹 Collaborator Found?",
      collaborator ? collaborator.user.toString() : "No"
    );
    console.log("🔹 Collaborator Permission:", collaborator?.permission);

    if (!isOwner && (!collaborator || collaborator.permission !== "edit")) {
      console.log("🔴 Access denied: User does not have edit permission");
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Permission denied",
        error: {
          code: 403,
          details: "You do not have edit access to this document",
        },
      });
    }

    // Find requested version
    const version = await DocumentVersion.findOne({
      document: document._id,
      versionNumber: parsedVersion,
    });

    if (!version) {
      console.log("🔴 Version not found");
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Version not found",
        error: {
          code: 404,
          details: "No version exists with the specified number",
        },
      });
    }

    // Apply rollback
    document.content = version.content;
    document.currentVersion += 1;
    document.updatedAt = new Date();

    // Save rollback as a new version
    await DocumentVersion.create({
      document: document._id,
      versionNumber: document.currentVersion,
      content: version.content,
      createdBy: req.user._id,
    });

    await document.save();

    const userId2 = req.user._id.toString(); // Store user ID safely
    await invalidateDocumentCache(req.params.id, userId2);

    console.log("✅ Rollback successful");
    return res.status(200).json({
      status: "SUCCESS",
      data: {
        _id: document._id,
        title: document.title,
        content: document.content,
        currentVersion: document.currentVersion,
        updatedAt: document.updatedAt,
      },
      message: "Rollback successful",
      error: null,
    });
  } catch (error) {
    console.error("❌ Server error during rollback:", error);
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

//add  colaborator
export const addCollaborator = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { userId, permission } = req.body;

    // Validate input
    if (!userId || !["view", "edit"].includes(permission)) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid user ID or permission",
        error: {
          code: 400,
          details: "User ID and permission (view/edit) are required",
        },
      });
    }

    // Find document
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: {
          code: 404,
          details: "No document exists with the provided ID",
        },
      });
    }

    // Ensure request user exists and is the document owner
    if (!req.user || document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Permission denied",
        error: {
          code: 403,
          details: "Only the document owner can add collaborators",
        },
      });
    }

    // Find user to be added
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "User not found",
        error: { code: 404, details: "No user exists with the provided ID" },
      });
    }

    // Check if user is already a collaborator
    const existingCollaborator = document.collaborators.find(
      (c) => c.user.toString() === userId
    );
    if (existingCollaborator) {
      existingCollaborator.permission = permission;
    } else {
      document.collaborators.push({ user: userId, permission });
    }

    // Save updated document
    await document.save();
    // Invalidate the user's document cache in Redis
    const userId2 = req.user._id.toString(); // Store user ID safely
    await invalidateDocumentCache(req.params.id, userId2);

    await invalidateDocumentCache(req.params.id, userId);

    return res.status(200).json({
      status: "SUCCESS",
      data: {
        _id: document._id,
        title: document.title,
        content: document.content,
        owner: document.owner,
        collaborators: document.collaborators,
        updatedAt: document.updatedAt,
      },
      message: "Collaborator added successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error adding collaborator:", error);
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

// Remove collaborator from document
export const removeCollaborator = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { userId } = req.params;

    // Validate user ID
    if (!userId) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "Invalid user ID",
        error: {
          code: 400,
          details: "User ID is required to remove a collaborator",
        },
      });
    }

    // Find document
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: {
          code: 404,
          details: "No document exists with the provided ID",
        },
      });
    }

    // Ensure request user exists and is the document owner
    if (!req.user || document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: "ERROR",
        data: null,
        message: "Permission denied",
        error: {
          code: 403,
          details: "Only the document owner can remove collaborators",
        },
      });
    }

    // Check if user is a collaborator
    const collaboratorIndex = document.collaborators.findIndex(
      (c) => c.user.toString() === userId
    );
    if (collaboratorIndex === -1) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Collaborator not found",
        error: {
          code: 404,
          details: "The specified user is not a collaborator on this document",
        },
      });
    }

    // Remove collaborator
    document.collaborators.splice(collaboratorIndex, 1);
    await document.save();

    const userId2 = req.user._id.toString(); // Store user ID safely
    await invalidateDocumentCache(req.params.id, userId2);
    await invalidateDocumentCache(req.params.id, userId);

    return res.status(200).json({
      status: "SUCCESS",
      data: {
        _id: document._id,
        title: document.title,
        content: document.content,
        owner: document.owner,
        collaborators: document.collaborators,
        updatedAt: document.updatedAt,
      },
      message: "Collaborator removed successfully",
      error: null,
    });
  } catch (error) {
    console.error("❌ Error removing collaborator:", error);
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

import { sendEmail } from "../utils/email"; // Import email helper

export const requestAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    // const { userId } = req.body; // User requesting access
    let userId = null;
    if (req.user && req.user._id) {
      userId = req.user._id.toString();
    }
    console.log(req.body);
    console.log(userId);

    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "User not found",
        error: { code: 404, details: "Unknown error" },
      });
    }

    // Fetch the document and owner details
    const document = await Document.findById(documentId).populate("owner");
    if (!document) {
      return res.status(404).json({
        status: "ERROR",
        data: null,
        message: "Document not found",
        error: { code: 404, details: "Unknown error" },
      });
    }

    // Ensure owner is a valid user
    if (!document.owner || !(document.owner instanceof User)) {
      return res.status(500).json({
        status: "ERROR",
        data: null,
        message: "Invalid documnet owner",
        error: { code: 404, details: "Unknown error" },
      });
    }

    const owner = document.owner as IUser; // Type assertion

    // Prevent duplicate requests
    if (document.collaborators.some((c) => c.user.toString() === userId)) {
      return res.status(400).json({
        status: "ERROR",
        data: null,
        message: "User is already a collaborator",
        error: { code: 404, details: "Unknown error" },
      });
    }

    // Send email to document owner
    await sendEmail({
      email: owner.email,
      subject: "Access Request for Your Document",
      html: `
                <p>Hello ${owner.username},</p>
                <p>User <b>${user.username}</b> has requested access to your document.</p>
                <p>Click <a href="${process.env.FRONTEND_URL}/approve/${documentId}/${userId}">here</a> to approve access.</p>
            `,
    });

    res.status(200).json({
      status: "ERROR",
      data: null,
      message: "Access request sent to the owner",
      error: { code: 404, details: "Unknown error" },
    });
  } catch (error) {
    console.error("Error requesting access:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Approve access request
import mongoose from "mongoose";

export const approveAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { documentId, userId } = req.params;

    // Ensure document exists
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure `req.user` is not undefined
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    // Ensure only owner can approve
    if (document.owner.toString() !== req.user._id.toString()) {
      console.log(document.owner.toString + " " + req.user._id.toString);
      return res
        .status(403)
        .json({ message: "Only the owner can approve access" });
    }

    // Convert userId to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Check if user is already a collaborator
    if (document.collaborators.some((c) => c.user.equals(userObjectId))) {
      return res
        .status(400)
        .json({ message: "User is already a collaborator" });
    }

    // Add user as a collaborator
    document.collaborators.push({ user: userObjectId, permission: "view" });
    await document.save();

    // Notify user of approval
    await sendEmail({
      email: user.email,
      subject: "Access Granted to Document",
      html: `
                <p>Hello ${user.username},</p>
                <p>Your request to access the document <b>${document.title}</b> has been approved.</p>
                <p>You can now view it <a href="${process.env.FRONTEND_URL}/document/${documentId}">here</a>.</p>
            `,
    });

    res
      .status(200)
      .json({ message: "User added as a collaborator successfully." });
  } catch (error) {
    console.error("Error approving access:", error);
    res.status(500).json({ message: "Server error" });
  }
};
