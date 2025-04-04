import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User";
import DocumentModel from "../models/Document";
// import mongoose from 'mongoose';
import redis from "../config/redis"; // Import Redis client
import DocumentVersion from "../models/DocumentVersion";
import {
  addUserToDocument,
  removeUserFromDocument,
  getOnlineUsers,
  hasDocumentAccess,
} from "../utils/helper";
import { JwtPayload } from "../types";

// Default value for new documents
const defaultValue = {};

// Helper function to authenticate socket connection
const authenticateSocket = async (token?: string) => {
  try {
    if (!token) {
      console.error("Authentication failed: No token provided");
      return null;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_jwt_secret"
    ) as JwtPayload;
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.error("Authentication failed: User not found");
      return null;
    }

    return user;
  } catch (error) {
    console.error("Socket authentication error:", (error as Error).message);
    return null;
  }
};

// Helper function to save document version
async function saveDocumentVersion(documentId: string, userId: any) {
  try {
    const document = await DocumentModel.findById(documentId);
    if (!document) return;

    // Increment version number
    const currentVersion = document.currentVersion || 0;
    const newVersionNumber = currentVersion + 1;

    // Update document with new version number
    await DocumentModel.findByIdAndUpdate(documentId, {
      currentVersion: newVersionNumber,
      updatedAt: new Date(),
    });

    // Create new document version
    await DocumentVersion.create({
      document: documentId,
      versionNumber: newVersionNumber,
      content: document.data || document.content,
      createdBy: userId,
    });

    // Invalidate Redis cache for the document
    await redis.del(`document:${documentId}`);
    await redis.del(`user:${userId}:documents`);

    console.log(
      `📝 Document ${documentId} version ${newVersionNumber} auto-saved on user change`
    );
  } catch (error) {
    console.error("❌ Error auto-saving document version:", error);
  }
}

// Initialize socket.io service
export const initSocketService = (io: Server) => {
  io.use(async (socket: Socket, next) => {
    try {
      // Extract token from multiple places
      const token =
        socket.handshake.auth.token ||
        socket.handshake.query.token ||
        (socket.handshake.headers.authorization
          ? socket.handshake.headers.authorization.split(" ")[1]
          : null);

      console.log("Extracted Token:", token);

      if (!token) {
        return next(new Error("Authentication error: Missing token"));
      }

      const user = await authenticateSocket(token);
      if (!user) {
        return next(new Error("Authentication error: Invalid token"));
      }

      console.log("Authenticated User:", user.username);
      (socket as any).user = user;
      next();
    } catch (error) {
      console.error(
        "Socket authentication middleware error:",
        (error as Error).message
      );
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = (socket as any).user;
    console.log(`User connected: ${user.username} (${socket.id})`);

    // Get document event - Quill.js implementation
    socket.on("get-document", async (documentId: string) => {
      try {
        console.log(
          `🛠️ ${user.username} is attempting to access document: ${documentId}`
        );

        // Check if user has access to the document or if it's a new document
        let document = await DocumentModel.findById(documentId);
        let hasAccess = true;

        if (document) {
          hasAccess = await hasDocumentAccess(documentId, user._id);
          if (!hasAccess) {
            socket.emit("error", { message: "Access denied" });
            return;
          }
        } else {
          // Create document if it doesn't exist
          document = await DocumentModel.create({
            _id: documentId,
            title: "Untitled Document",
            content: "",
            owner: user._id,
            data: defaultValue,
            collaborators: [],
          });

          // Create first version
          await DocumentVersion.create({
            document: document._id,
            versionNumber: 1,
            content: "",
            createdBy: user._id,
          });

          // Invalidate Redis cache
          await redis.del(`user:${user._id}:documents`);
        }

        // Join the document room
        socket.join(documentId);

        // Add user to online users
        await addUserToDocument(documentId, user);

        // Get online users after adding the current user
        const onlineUsers = await getOnlineUsers(documentId);

        // If there are other users already in the document, create a new version
        if (onlineUsers.length > 1) {
          await saveDocumentVersion(documentId, user._id);
        }

        // Get document data or default value
        const documentData = document.get("data") || defaultValue;

        // Send document content to the client
        socket.emit("load-document", documentData);

        // Notify others that a user has joined
        io.to(documentId).emit("user-joined", {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
          },
          onlineUsers,
        });

        console.log(
          `✅ ${user.username} successfully loaded document: ${documentId}`
        );

        // Debug log users in the document
        setTimeout(() => {
          const room = io.sockets.adapter.rooms.get(documentId);
          if (room) {
            console.log(
              `👥 Users in document ${documentId}:`,
              Array.from(room)
            );
          } else {
            console.log(`⚠️ No users found in document ${documentId}`);
          }
        }, 1000);
      } catch (error) {
        console.error("❌ Error accessing document:", error);
        socket.emit("error", { message: "Failed to load document" });
      }
    });

    // Handle Quill.js delta changes
    socket.on("send-changes", async (delta: any) => {
      try {
        const rooms = Array.from(socket.rooms).filter(
          (room) => room !== socket.id
        );

        for (const documentId of rooms) {
          // Check if user has edit permission
          const document = await DocumentModel.findById(documentId);
          if (!document) continue;

          // Check if user is owner or has edit permission
          const isOwner =
            document.get("owner").toString() === user._id.toString();
          const collaborators = document.get("collaborators") || [];
          const collaborator = collaborators.find(
            (c: any) => c.user.toString() === user._id.toString()
          );

          if (
            !isOwner &&
            (!collaborator || collaborator.permission !== "edit")
          ) {
            socket.emit("error", {
              message: "You do not have permission to edit this document",
            });
            continue;
          }

          // Broadcast changes to all clients in the same document
          socket.broadcast.to(documentId).emit("receive-changes", delta);

          console.log(
            `📝 ${user.username} sent changes to document ${documentId}`
          );
        }
      } catch (error) {
        console.error("❌ Error sending changes:", error);
        socket.emit("error", { message: "Failed to send changes" });
      }
    });

    // Handle cursor position updates
    socket.on(
      "cursor-position",
      ({ documentId, position }: { documentId: string; position: any }) => {
        socket.to(documentId).emit("cursor-moved", {
          userId: user._id,
          username: user.username,
          position,
          timestamp: Date.now(),
        });
      }
    );

    // Save document
    socket.on("save-document", async (data: any) => {
      try {
        // console.log("data" , JSON.parse(JSON.stringify(data)));
        // console.log(data.content);
        const rooms = Array.from(socket.rooms).filter(
          (room) => room !== socket.id
        );

        for (const documentId of rooms) {
          // Check if user has edit permission
          const document = await DocumentModel.findById(documentId);
          if (!document) continue;

          // Check if user is owner or has edit permission
          const isOwner =
            document.get("owner").toString() === user._id.toString();
          const collaborators = document.get("collaborators") || [];
          const collaborator = collaborators.find(
            (c: any) => c.user.toString() === user._id.toString()
          );

          if (
            !isOwner &&
            (!collaborator || collaborator.permission !== "edit")
          ) {
            socket.emit("error", {
              message: "You do not have permission to save this document",
            });
            continue;
          }

          // Increment version number
          const currentVersion = document.currentVersion || 0;
          const newVersionNumber = currentVersion + 1;

          // Update document
          await DocumentModel.findByIdAndUpdate(documentId, {
            data: data,
            content: data,
            currentVersion: newVersionNumber,
            updatedAt: new Date(),
          });

          // Create new document version
          await DocumentVersion.create({
            document: documentId,
            versionNumber: newVersionNumber,
            content: data || document.content,
            createdBy: user._id,
          });

          // Invalidate Redis cache for the document
          await redis.del(`document:${documentId}`);
          await redis.del(`user:${user._id}:documents`);

          console.log(
            `💾 Document ${documentId} saved by ${user.username}, Version ${newVersionNumber}`
          );
        }
      } catch (error) {
        console.error("❌ Error saving document:", error);
        socket.emit("error", { message: "Failed to save document" });
      }
    });

    socket.on("disconnect", async () => {
      try {
        const rooms = Array.from(socket.rooms).filter(
          (room) => room !== socket.id
        );

        for (const documentId of rooms) {
          // Get current online users before removing this user
          const onlineUsersBefore = await getOnlineUsers(documentId);

          // Remove the disconnecting user
          await removeUserFromDocument(documentId, user._id);

          // Get updated online users after removal
          const onlineUsersAfter = await getOnlineUsers(documentId);

          // If there are still other users in the document, save a version
          if (onlineUsersBefore.length > 1 && onlineUsersAfter.length > 0) {
            await saveDocumentVersion(documentId, user._id);
          }

          // Notify others about user departure
          io.to(documentId).emit("user-left", {
            userId: user._id,
            onlineUsers: onlineUsersAfter,
          });
        }

        console.log(`User disconnected: ${user.username}`);
      } catch (error) {
        console.error("Error handling disconnection:", error);
      }
    });
  });
};
