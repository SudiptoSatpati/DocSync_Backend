import mongoose, { Schema, Document, Model } from 'mongoose';

// Define the document version interface
export interface IDocumentVersion extends Document {
    document: mongoose.Types.ObjectId;
    versionNumber: number;
    content: any;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
}

// Define the Mongoose schema
const DocumentVersionSchema: Schema<IDocumentVersion> = new Schema({
    document: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true
    },
    versionNumber: {
        type: Number,
        required: true
    },
    content: {
        type: Schema.Types.Mixed,
        required: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure unique version per document
DocumentVersionSchema.index({ document: 1, versionNumber: 1 }, { unique: true });

// Export the model
const DocumentVersionModel: Model<IDocumentVersion> = mongoose.model<IDocumentVersion>('DocumentVersion', DocumentVersionSchema);
export default DocumentVersionModel;
