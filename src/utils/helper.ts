import mongoose from 'mongoose';
import DocumentModel from '../models/Document';

/**
 * Add a user to the online users list for a document
 */
export const addUserToDocument = async (documentId: string, user: any) => {
    try {
        await DocumentModel.findByIdAndUpdate(
            documentId,
            { 
                $addToSet: { onlineUsers: user._id }
            },
            { new: true }
        );
        return true;
    } catch (error) {
        console.error('Error adding user to document:', error);
        return false;
    }
};

/**
 * Remove a user from the online users list for a document
 */
export const removeUserFromDocument = async (documentId: string, userId: mongoose.Types.ObjectId) => {
    try {
        await DocumentModel.findByIdAndUpdate(
            documentId,
            { 
                $pull: { onlineUsers: userId }
            },
            { new: true }
        );
        return true;
    } catch (error) {
        console.error('Error removing user from document:', error);
        return false;
    }
};

/**
 * Get all online users for a document
 */
export const getOnlineUsers = async (documentId: string) => {
    try {
        const document = await DocumentModel.findById(documentId)
            .populate('onlineUsers', 'username email _id')
            .populate('owner', 'username email _id')
            .populate('collaborators.user', 'username email _id');
        
        if (!document) return [];
        
        const onlineUsers = document.onlineUsers || [];
        return onlineUsers;
    } catch (error) {
        console.error('Error getting online users:', error);
        return [];
    }
};

/**
 * Check if a user has access to a document
 */
export const hasDocumentAccess = async (documentId: string, userId: mongoose.Types.ObjectId) => {
    try {
        const document = await DocumentModel.findById(documentId);
        if (!document) return false;
        
        // User is document owner
        if (document.owner.toString() === userId.toString()) {
            return true;
        }
        
        // User is in collaborators with any permission level
        const isCollaborator = document.collaborators.some(
            collaborator => collaborator.user.toString() === userId.toString()
        );
        
        return isCollaborator;
    } catch (error) {
        console.error('Error checking document access:', error);
        return false;
    }
};

/**
 * Check if a user has edit permission for a document
 */
export const hasEditPermission = async (documentId: string, userId: mongoose.Types.ObjectId) => {
    try {
        const document = await DocumentModel.findById(documentId);
        if (!document) return false;
        
        // User is document owner
        if (document.owner.toString() === userId.toString()) {
            return true;
        }
        
        // User is in collaborators with edit permission
        const collaborator = document.collaborators.find(
            c => c.user.toString() === userId.toString()
        );
        
        return collaborator?.permission === 'edit';
    } catch (error) {
        console.error('Error checking edit permission:', error);
        return false;
    }
};