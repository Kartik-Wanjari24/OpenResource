// OpenResource - Member 2 Component & Service Exports

export { Member2Workbench } from './Member2Workbench.tsx';
export { BookingStatusPanel } from './BookingStatusPanel.tsx';
export { CustodyPanel } from './CustodyPanel.tsx';
export { NotificationCenter } from './NotificationCenter.tsx';
export { PersonaSwitcher } from './PersonaSwitcher.tsx';

export {
  member2Api,
  PRECONFIGURED_PERSONAS,
  getActivePersona,
  setActivePersona,
  ApiClientError,
} from '../../services/member2Api.ts';

export type {
  Booking,
  BookingStatus,
  UserRole,
  CustodyAction,
  CustodyCredential,
  NotificationRecord,
  PaginatedNotificationsResult,
  UserPersona,
  CreateBookingInput,
  TransitionBookingInput,
  CustodyActionInput,
} from '../../types/member2.ts';
