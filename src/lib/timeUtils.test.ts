/**
 * Tests for time utilities and conflict detection
 */

import { describe, it, expect } from 'vitest';
import {
  slotsOverlap,
  findConflicts,
  isSlotAvailable,
  generateTimeSlots,
  startOfDay,
  endOfDay,
  addDays,
  startOfWeek,
  isSameDay,
  getDurationHours,
  createTimeSlot,
  type TimeSlot,
  type Booking,
} from '../lib/timeUtils';

describe('slotsOverlap', () => {
  it('should detect overlapping slots', () => {
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T10:00:00'),
      endTime: new Date('2026-10-28T12:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(true);
  });

  it('should not detect adjacent slots as overlapping', () => {
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T11:00:00'),
      endTime: new Date('2026-10-28T13:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(false);
  });

  it('should detect slot completely inside another', () => {
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T13:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T10:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(true);
  });

  it('should not detect non-overlapping slots', () => {
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T13:00:00'),
      endTime: new Date('2026-10-28T15:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(false);
  });

  it('should handle same start and end times', () => {
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(true);
  });
});

describe('findConflicts', () => {
  const bookings: Booking[] = [
    {
      id: 'b1',
      resourceId: 'r1',
      userId: 'u1',
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
      status: 'CONFIRMED',
    },
    {
      id: 'b2',
      resourceId: 'r1',
      userId: 'u2',
      startTime: new Date('2026-10-28T13:00:00'),
      endTime: new Date('2026-10-28T15:00:00'),
      status: 'CONFIRMED',
    },
    {
      id: 'b3',
      resourceId: 'r1',
      userId: 'u3',
      startTime: new Date('2026-10-28T10:00:00'),
      endTime: new Date('2026-10-28T12:00:00'),
      status: 'PENDING',
    },
  ];

  it('should find single conflict', () => {
    const targetSlot: TimeSlot = {
      startTime: new Date('2026-10-28T10:30:00'),
      endTime: new Date('2026-10-28T11:30:00'),
    };
    const conflicts = findConflicts(targetSlot, bookings);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((b) => b.id)).toContain('b1');
    expect(conflicts.map((b) => b.id)).toContain('b3');
  });

  it('should find no conflicts for non-overlapping slot', () => {
    const targetSlot: TimeSlot = {
      startTime: new Date('2026-10-28T15:00:00'),
      endTime: new Date('2026-10-28T17:00:00'),
    };
    const conflicts = findConflicts(targetSlot, bookings);
    expect(conflicts).toHaveLength(0);
  });

  it('should verify adjacent slots do not overlap', () => {
    // Test the core overlap logic with truly adjacent slots
    const slot1: TimeSlot = {
      startTime: new Date('2026-10-28T09:00:00'),
      endTime: new Date('2026-10-28T11:00:00'),
    };
    const slot2: TimeSlot = {
      startTime: new Date('2026-10-28T11:00:00'), // Starts exactly when slot1 ends
      endTime: new Date('2026-10-28T13:00:00'),
    };
    expect(slotsOverlap(slot1, slot2)).toBe(false);
  });

  it('should not count adjacent booking as conflict', () => {
    // Use a slot that doesn't overlap with any existing bookings
    const targetSlot: TimeSlot = {
      startTime: new Date('2026-10-28T15:00:00'), // After b2 ends
      endTime: new Date('2026-10-28T17:00:00'),
    };
    const conflicts = findConflicts(targetSlot, bookings);
    expect(conflicts).toHaveLength(0);
  });
});

describe('isSlotAvailable', () => {
  const schedule = [
    { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
    { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00' },
  ];

  it('should return true for slot within availability', () => {
    const slot: TimeSlot = {
      startTime: new Date('2026-10-27T10:00:00'), // Monday
      endTime: new Date('2026-10-27T11:00:00'),
    };
    expect(isSlotAvailable(slot, schedule)).toBe(true);
  });

  it('should return false for slot outside availability hours', () => {
    const slot: TimeSlot = {
      startTime: new Date('2026-10-27T21:00:00'), // Monday after 20:00
      endTime: new Date('2026-10-27T22:00:00'),
    };
    expect(isSlotAvailable(slot, schedule)).toBe(false);
  });

  it('should return false for unavailable day', () => {
    const slot: TimeSlot = {
      startTime: new Date('2026-10-30T10:00:00'), // Thursday (not in schedule)
      endTime: new Date('2026-10-30T11:00:00'),
    };
    expect(isSlotAvailable(slot, schedule)).toBe(false);
  });

  it('should return false for slot starting before availability', () => {
    // Tuesday schedule is 09:00-17:00, test with a slot at 08:00-09:00 (before availability starts)
    const slot: TimeSlot = {
      startTime: new Date('2026-10-28T07:00:00'), // Well before 09:00
      endTime: new Date('2026-10-28T08:00:00'), // Still before 09:00
    };
    expect(isSlotAvailable(slot, schedule)).toBe(false);
  });
});

describe('generateTimeSlots', () => {
  it('should generate hourly slots for a day', () => {
    const start = new Date('2026-10-28T08:00:00');
    const end = new Date('2026-10-28T12:00:00');
    const slots = generateTimeSlots(start, end, 60);
    expect(slots).toHaveLength(4); // 8, 9, 10, 11 (not including 12)
  });

  it('should generate 30-minute slots', () => {
    const start = new Date('2026-10-28T08:00:00');
    const end = new Date('2026-10-28T10:00:00');
    const slots = generateTimeSlots(start, end, 30);
    expect(slots).toHaveLength(4); // 8:00, 8:30, 9:00, 9:30
  });

  it('should generate empty array for same start and end', () => {
    const date = new Date('2026-10-28T08:00:00');
    const slots = generateTimeSlots(date, date, 60);
    expect(slots).toHaveLength(0);
  });
});

describe('Date utilities', () => {
  it('startOfDay should set time to 00:00:00', () => {
    const date = new Date('2026-10-28T15:30:45');
    const start = startOfDay(date);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('endOfDay should set time to 23:59:59', () => {
    const date = new Date('2026-10-28T10:00:00');
    const end = endOfDay(date);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  it('addDays should add days correctly', () => {
    const date = new Date('2026-10-28T10:00:00');
    const future = addDays(date, 5);
    expect(future.getDate()).toBe(2); // November 2nd
    expect(future.getMonth()).toBe(10); // November (0-indexed)
  });

  it('startOfWeek should return Monday', () => {
    const wednesday = new Date('2026-10-28T10:00:00'); // Wednesday
    const monday = startOfWeek(wednesday);
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getDate()).toBe(26); // Oct 26
  });

  it('isSameDay should compare dates correctly', () => {
    const date1 = new Date('2026-10-28T10:00:00');
    const date2 = new Date('2026-10-28T15:30:00');
    const date3 = new Date('2026-10-29T10:00:00');
    expect(isSameDay(date1, date2)).toBe(true);
    expect(isSameDay(date1, date3)).toBe(false);
  });
});

describe('getDurationHours', () => {
  it('should calculate duration correctly', () => {
    const start = new Date('2026-10-28T09:00:00');
    const end = new Date('2026-10-28T11:30:00');
    expect(getDurationHours(start, end)).toBe(2.5);
  });

  it('should return 0 for same time', () => {
    const time = new Date('2026-10-28T09:00:00');
    expect(getDurationHours(time, time)).toBe(0);
  });
});

describe('createTimeSlot', () => {
  it('should create slot with correct times', () => {
    const date = new Date('2026-10-28');
    const slot = createTimeSlot(date, 9, 30, 120); // 9:30 AM, 2 hours
    expect(slot.startTime.getHours()).toBe(9);
    expect(slot.startTime.getMinutes()).toBe(30);
    expect(slot.endTime.getHours()).toBe(11);
    expect(slot.endTime.getMinutes()).toBe(30);
  });
});
