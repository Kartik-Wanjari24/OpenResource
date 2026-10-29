import { useState, useMemo } from 'react';
import type { Resource } from '../lib/api';
import {
  generateTimeSlots,
  formatTime,
  formatDate,
  isSlotAvailable,
  startOfDay,
  endOfDay,
  addDays,
  startOfWeek,
  type Booking,
  findConflicts,
} from '../lib/timeUtils';
import styles from './ResourceTimeline.module.css';

type ViewMode = 'day' | 'week';

interface ResourceTimelineProps {
  resources: Resource[];
  bookings?: Booking[]; // Optional: from future booking API
  onSlotClick?: (resourceId: string, startTime: Date, endTime: Date) => void;
}

export function ResourceTimeline({
  resources,
  bookings = [],
  onSlotClick,
}: ResourceTimelineProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
        days: 1,
      };
    } else {
      const weekStart = startOfWeek(currentDate);
      return {
        start: startOfDay(weekStart),
        end: endOfDay(addDays(weekStart, 6)),
        days: 7,
      };
    }
  }, [currentDate, viewMode]);

  // Generate time slots (hourly intervals)
  const timeSlots = useMemo(() => {
    return generateTimeSlots(dateRange.start, dateRange.end, 60);
  }, [dateRange]);

  // Navigate dates
  const handlePrevious = () => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? -1 : -7));
  };

  const handleNext = () => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? 1 : 7));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Get slot state for a resource at a specific time
  const getSlotState = (resource: Resource, slotStart: Date): SlotState => {
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(slotEnd.getHours() + 1);

    // Check if slot is within resource availability schedule
    const available = isSlotAvailable(
      { startTime: slotStart, endTime: slotEnd },
      resource.availability.schedule
    );

    if (!available) {
      return { type: 'unavailable', conflicts: [] };
    }

    // Check for booking conflicts (when booking data is available)
    const resourceBookings = bookings.filter((b) => b.resourceId === resource.id);
    const conflicts = findConflicts({ startTime: slotStart, endTime: slotEnd }, resourceBookings);

    if (conflicts.length > 0) {
      return {
        type: conflicts.length > 1 ? 'conflict' : 'occupied',
        conflicts,
      };
    }

    return { type: 'available', conflicts: [] };
  };

  // Handle slot click
  const handleSlotClick = (
    resource: Resource,
    slotStart: Date,
    state: SlotState
  ) => {
    if (state.type === 'available' && onSlotClick) {
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotEnd.getHours() + 1);
      onSlotClick(resource.id, slotStart, slotEnd);
    }
  };

  // Format current date display
  const currentDateDisplay = useMemo(() => {
    if (viewMode === 'day') {
      return formatDate(currentDate);
    } else {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = addDays(weekStart, 6);
      return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
    }
  }, [currentDate, viewMode]);

  // Group time slots by day for week view
  const slotsByDay = useMemo(() => {
    if (viewMode === 'day') return null;

    const grouped: Record<string, Date[]> = {};
    timeSlots.forEach((slot) => {
      const dayKey = slot.toDateString();
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(slot);
    });
    return grouped;
  }, [timeSlots, viewMode]);

  if (resources.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>No Resources Available</h3>
          <p className={styles.emptyMessage}>
            Select resources from the marketplace to view their availability timeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with Controls */}
      <div className={styles.header}>
        <h2 className={styles.title}>Availability Timeline</h2>

        <div className={styles.controls}>
          {/* View Mode Toggle */}
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <button
              type="button"
              className={`${styles.viewButton} ${viewMode === 'day' ? styles.active : ''}`}
              onClick={() => setViewMode('day')}
              aria-pressed={viewMode === 'day'}
            >
              Day
            </button>
            <button
              type="button"
              className={`${styles.viewButton} ${viewMode === 'week' ? styles.active : ''}`}
              onClick={() => setViewMode('week')}
              aria-pressed={viewMode === 'week'}
            >
              Week
            </button>
          </div>

          {/* Date Navigation */}
          <div className={styles.dateNav}>
            <button
              type="button"
              className={styles.navButton}
              onClick={handlePrevious}
              aria-label="Previous"
            >
              ←
            </button>
            <span className={styles.currentDate}>{currentDateDisplay}</span>
            <button
              type="button"
              className={styles.navButton}
              onClick={handleNext}
              aria-label="Next"
            >
              →
            </button>
            <button
              type="button"
              className={styles.navButton}
              onClick={handleToday}
              aria-label="Today"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend} role="list" aria-label="Timeline legend">
        <div className={styles.legendItem} role="listitem">
          <div className={`${styles.legendColor} ${styles.available}`} />
          <span>Available</span>
        </div>
        <div className={styles.legendItem} role="listitem">
          <div className={`${styles.legendColor} ${styles.occupied}`} />
          <span>Occupied</span>
        </div>
        <div className={styles.legendItem} role="listitem">
          <div className={`${styles.legendColor} ${styles.conflict}`} />
          <span>Conflict</span>
        </div>
        <div className={styles.legendItem} role="listitem">
          <div className={`${styles.legendColor} ${styles.unavailable}`} />
          <span>Unavailable</span>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className={styles.timelineScroll}>
        <div className={styles.timeline} role="table" aria-label="Resource availability timeline">
          {/* Time Header */}
          <div className={styles.timeHeader} role="row">
            {viewMode === 'day'
              ? timeSlots.slice(0, 24).map((slot, idx) => (
                  <div key={idx} className={styles.timeLabel} role="columnheader">
                    {formatTime(slot)}
                  </div>
                ))
              : slotsByDay &&
                Object.keys(slotsByDay).map((dayKey, idx) => (
                  <div key={idx} className={styles.timeLabel} role="columnheader">
                    {formatDate(new Date(dayKey))}
                  </div>
                ))}
          </div>

          {/* Resource Lanes */}
          {resources.map((resource) => (
            <div key={resource.id} className={styles.resourceLane} role="row">
              <div className={styles.resourceLabel} role="rowheader">
                <div className={styles.resourceName}>{resource.name}</div>
                <div className={styles.resourceMeta}>{resource.location}</div>
              </div>

              <div className={styles.slotsContainer} role="rowgroup">
                {viewMode === 'day'
                  ? timeSlots.slice(0, 24).map((slot, idx) => {
                      const state = getSlotState(resource, slot);
                      return (
                        <TimeSlot
                          key={idx}
                          resource={resource}
                          slotStart={slot}
                          state={state}
                          onClick={() => handleSlotClick(resource, slot, state)}
                        />
                      );
                    })
                  : slotsByDay &&
                    Object.values(slotsByDay).map((daySlots, dayIdx) => {
                      // For week view, show aggregated availability per day
                      const dayStart = daySlots[0];
                      const hasAvailability = daySlots.some(
                        (slot) => getSlotState(resource, slot).type === 'available'
                      );
                      const hasBookings = daySlots.some(
                        (slot) => getSlotState(resource, slot).type !== 'unavailable'
                      );

                      return (
                        <div
                          key={dayIdx}
                          className={`${styles.slot} ${
                            hasAvailability
                              ? styles.available
                              : hasBookings
                              ? styles.occupied
                              : styles.unavailable
                          }`}
                          role="gridcell"
                        >
                          <span className={styles.tooltip}>
                            {formatDate(dayStart)} - {hasAvailability ? 'Available' : 'Occupied'}
                          </span>
                        </div>
                      );
                    })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Notice (shown when no bookings data) */}
      {bookings.length === 0 && (
        <div className={styles.notice} role="status">
          <h4 className={styles.noticeTitle}>📋 Booking Data Integration</h4>
          <p className={styles.noticeText}>
            Timeline shows resource availability schedules. Booking conflict detection will be
            enabled once the booking API (GET /api/bookings) is implemented by the team.
          </p>
        </div>
      )}
    </div>
  );
}

// Slot State Type
interface SlotState {
  type: 'available' | 'occupied' | 'conflict' | 'unavailable';
  conflicts: Booking[];
}

// Time Slot Component
function TimeSlot({
  slotStart,
  state,
  onClick,
}: {
  resource: Resource;
  slotStart: Date;
  state: SlotState;
  onClick: () => void;
}) {
  const slotEnd = new Date(slotStart);
  slotEnd.setHours(slotEnd.getHours() + 1);

  const tooltipText =
    state.type === 'available'
      ? `${formatTime(slotStart)} - ${formatTime(slotEnd)}\nClick to book`
      : state.type === 'occupied'
      ? `${formatTime(slotStart)} - ${formatTime(slotEnd)}\nOccupied`
      : state.type === 'conflict'
      ? `${formatTime(slotStart)} - ${formatTime(slotEnd)}\nMultiple bookings (conflict!)`
      : `${formatTime(slotStart)} - ${formatTime(slotEnd)}\nUnavailable`;

  return (
    <div
      className={`${styles.slot} ${styles[state.type]}`}
      onClick={state.type === 'available' ? onClick : undefined}
      onKeyDown={(e) => {
        if (state.type === 'available' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={state.type === 'available' ? 0 : -1}
      aria-label={tooltipText}
      aria-disabled={state.type !== 'available'}
    >
      <span className={styles.tooltip} aria-hidden="true">
        {tooltipText}
      </span>
    </div>
  );
}
