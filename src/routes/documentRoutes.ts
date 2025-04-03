import express from 'express';
import * as documentController from '../controllers/documentController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// ✅ Apply authentication middleware to all routes
router.use(authenticate);

// ✅ Document CRUD operations
router.post('/', documentController.createDocument);
router.get('/', documentController.getDocuments);
router.get('/:id', documentController.getDocumentById);
router.put('/:id', documentController.updateDocument);
router.delete('/:id', documentController.deleteDocument);

// ✅ Version history
router.get('/:id/versions', documentController.getDocumentVersions);
router.post('/:id/rollback/:versionNumber', documentController.rollbackToVersion);

// ✅ Collaborator management
router.post('/:id/collaborators', documentController.addCollaborator);
router.delete('/:id/collaborators/:userId', documentController.removeCollaborator);


// Route to request access (User -> Owner)
router.post("/request-access/:documentId",documentController.requestAccess);

// Route for owner to approve access
router.post("/approve-access/:documentId/:userId", documentController.approveAccess);

export default router;
