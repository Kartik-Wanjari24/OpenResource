import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

export const notificationRoutes = Router();

// All notification endpoints require authenticated user identity
notificationRoutes.use(authenticate);

// List authenticated user's notifications (newest first, paginated)
notificationRoutes.get('/', NotificationController.getNotifications);

// Mark all notifications as read (both POST and PATCH supported)
notificationRoutes.post('/read-all', NotificationController.markAllAsRead);
notificationRoutes.patch('/read-all', NotificationController.markAllAsRead);

// Mark single notification as read
notificationRoutes.patch('/:id/read', NotificationController.markAsRead);
