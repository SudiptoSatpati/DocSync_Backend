import mongoose, { Schema, Document, Model } from 'mongoose';

// Define the structure of a collaborator
interface Collaborator {
    user: mongoose.Types.ObjectId;
    permission: 'view' | 'edit';
}

// Define the document interface
export interface IDocument extends Document {
    title: string;
    content: any;
    data?: any; // Add this line for Quill.js delta support
    owner: mongoose.Types.ObjectId;
    collaborators: Collaborator[];
    currentVersion: number;
    onlineUsers?: mongoose.Types.ObjectId[]; // Add this line for tracking online users
    createdAt: Date;
    updatedAt: Date;
}

// Define the Mongoose schema
const DocumentSchema: Schema<IDocument> = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: Schema.Types.Mixed,
        default: ''
    },
    data: {
        type: Schema.Types.Mixed, // Add this field for Quill.js delta support
        default: {}
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    collaborators: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view'
        }
    }],
    onlineUsers: [{ // Add this field for tracking online users
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    currentVersion: {
        type: Number,
        default: 1
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the timestamp when document is modified
DocumentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Export the model
const DocumentModel: Model<IDocument> = mongoose.model<IDocument>('Document', DocumentSchema);
export default DocumentModel;