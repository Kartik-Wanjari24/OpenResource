import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { CustodyController } from '../controllers/custody.controller.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

export const bookingRoutes = Router();

// Create booking request (authenticated)
bookingRoutes.post('/', authenticate, BookingController.createBooking);

// List bookings with optional filter & privacy masking
bookingRoutes.get('/', optionalAuthenticate, BookingController.getBookings);

// Member 1 integration route: User booking summary and quota
bookingRoutes.get('/user/:userId', optionalAuthenticate, BookingController.getUserBookings);

// On-demand no-show processor (must be defined before /:id)
bookingRoutes.post('/process-no-shows', optionalAuthenticate, CustodyController.processNoShows);

// Retrieve single booking by ID with privacy masking
bookingRoutes.get('/:id', optionalAuthenticate, BookingController.getBookingById);

// State transition (authenticated with role checks)
bookingRoutes.post('/:id/transition', authenticate, BookingController.transitionBooking);

// Custody operations: GENERATE_CREDENTIAL, CHECK_IN, CHECK_OUT
bookingRoutes.post('/:id/custody', authenticate, CustodyController.handleCustodyAction);
