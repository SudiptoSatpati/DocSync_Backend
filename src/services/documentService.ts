import Document from '../models/Document';
import DocumentVersion from '../models/DocumentVersion';
import { Types } from 'mongoose';

export const createDocumentVersion = async (
    documentId: Types.ObjectId | string,
    content: string,
    userId: Types.ObjectId | string
) => {
    try {
        const document = await Document.findById(documentId);

        if (!document) {
            throw new Error('Document not found');
        }

        // Increment version number
        document.currentVersion += 1;
        document.content = content;
        document.updatedAt = new Date();

        await document.save();

        // Create new version record
        const version = await DocumentVersion.create({
            document: documentId,
            versionNumber: document.currentVersion,
            content,
            createdBy: userId
        });

        return version;
    } catch (error) {
        console.error('Error creating document version:', error);
        throw error;
    }
};

export const getDocumentWithCollaborators = async (documentId: Types.ObjectId | string) => {
    try {
        const document = await Document.findById(documentId)
            .populate('owner', 'username email')
            .populate('collaborators.user', 'username email');

        if (!document) {
            throw new Error('Document not found');
        }

        return document;
    } catch (error) {
        console.error('Error getting document with collaborators:', error);
        throw error;
    }
};

export const checkDocumentAccess = async (
    documentId: Types.ObjectId | string,
    userId: Types.ObjectId | string
) => {
    try {
        const document = await Document.findById(documentId);

        if (!document) {
            return { hasAccess: false, message: 'Document not found' };
        }

        if (document.owner.toString() === userId.toString()) {
            return { hasAccess: true, permission: 'owner', document };
        }

        const collaborator = document.collaborators.find(
            (c) => c.user.toString() === userId.toString()
        );

        if (!collaborator) {
            return { hasAccess: false, message: 'Access denied' };
        }

        return { hasAccess: true, permission: collaborator.permission, document };
    } catch (error) {
        console.error('Error checking document access:', error);
        return { hasAccess: false, message: 'Error checking access' };
    }
};
