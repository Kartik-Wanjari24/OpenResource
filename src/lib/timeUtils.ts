/**
 * Time slot and conflict detection utilities
 */

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
}

export interface Booking extends TimeSlot {
  id: string;
  resourceId: string;
  userId: string;
  userName?: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

/**
 * Check if two time slots overlap
 * Adjacent slots (end time = start time) do NOT overlap
 */
export function slotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
  return slot1.startTime < slot2.endTime && slot2.startTime < slot1.endTime;
}

/**
 * Find all conflicting bookings for a given time slot
 */
export function findConflicts(
  targetSlot: TimeSlot,
  existingBookings: Booking[]
): Booking[] {
  return existingBookings.filter((booking) => slotsOverlap(targetSlot, booking));
}

/**
 * Check if a time slot is within resource availability
 */
export function isSlotAvailable(
  slot: TimeSlot,
  availabilitySchedule: Array<{
    dayOfWeek: string;
    startTime: string; // HH:mm
    endTime: string; // HH:mm
  }>
): boolean {
  const dayOfWeek = getDayOfWeek(slot.startTime);
  const schedule = availabilitySchedule.find((s) => s.dayOfWeek === dayOfWeek);

  if (!schedule) return false;

  const slotStart = getTimeOfDay(slot.startTime);
  const slotEnd = getTimeOfDay(slot.endTime);
  const availStart = timeStringToMinutes(schedule.startTime);
  const availEnd = timeStringToMinutes(schedule.endTime);

  // Slot must be completely within availability window
  return slotStart >= availStart && slotEnd <= availEnd;
}

/**
 * Generate time slots for a given date range
 */
export function generateTimeSlots(
  startDate: Date,
  endDate: Date,
  intervalMinutes: number = 60
): Date[] {
  const slots: Date[] = [];
  const current = new Date(startDate);

  while (current < endDate) {
    slots.push(new Date(current));
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }

  return slots;
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get day of week in uppercase format (MONDAY, TUESDAY, etc.)
 */
function getDayOfWeek(date: Date): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[date.getDay()];
}

/**
 * Get time of day in minutes since midnight
 */
function getTimeOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Convert time string (HH:mm) to minutes since midnight
 */
function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get start of day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get start of week (Monday)
 */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  result.setDate(result.getDate() + diff);
  return startOfDay(result);
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get duration in hours between two times
 */
export function getDurationHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Create a time slot from hour and minute
 */
export function createTimeSlot(
  date: Date,
  startHour: number,
  startMinute: number,
  durationMinutes: number
): TimeSlot {
  const startTime = new Date(date);
  startTime.setHours(startHour, startMinute, 0, 0);

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + durationMinutes);

  return { startTime, endTime };
}
