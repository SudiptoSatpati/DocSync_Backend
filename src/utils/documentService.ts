import Document from '../models/Document';
import DocumentVersion from '../models/DocumentVersion';
import redis from '../config/redis';

export const DocumentService = {
    async createDocument(data: {
        title: string, 
        content?: string, 
        owner: string, 
        generateVersion?: boolean
    }) {
        // Validate title
        if (!data.title || data.title.trim() === "") {
            throw new Error("Title cannot be empty");
        }

        // Ensure content is a non-empty string (default to a placeholder if empty)
        const documentContent = data.content && data.content.trim() !== "" 
            ? data.content 
            : " ";

        // Create the document
        const document = await Document.create({
            title: data.title.trim(),
            content: documentContent,
            owner: data.owner,
        });

        // Optionally create first document version
        if (data.generateVersion !== false) {
            await DocumentVersion.create({
                document: document._id,
                versionNumber: 1,
                content: documentContent,
                createdBy: data.owner,
            });
        }

        // Optionally invalidate Redis cache
        await redis.del(`user:${data.owner}:documents`);

        return document;
    },

    async findOrCreateDocument(id: string, userId: string) {
        if (!id) return null;
        
        try {
            const document = await Document.findById(id);
            if (document) return document;
            
            // Create a new document with the user as owner
            return await this.createDocument({
                title: 'Untitled Document',
                content: '',
                owner: userId,
                generateVersion: false  // Skip version for socket-created docs
            });
        } catch (error) {
            console.error('Error finding or creating document:', error);
            return null;
        }
    }
};