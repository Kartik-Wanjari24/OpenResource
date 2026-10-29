import React, { useState, useEffect, useCallback } from 'react';
import type { Booking, UserPersona } from '../../types/member2.ts';
import { BookingStatus, UserRole } from '../../types/member2.ts';
import { member2Api, ApiClientError } from '../../services/member2Api.ts';

interface BookingStatusPanelProps {
  currentPersona: UserPersona;
  selectedBookingId?: string | null;
  refreshTrigger?: number;
  onSelectBooking?: (booking: Booking) => void;
  onOpenCustody?: (booking: Booking) => void;
}

type TabType = 'ALL' | 'MINE' | 'ACTION_REQUIRED' | 'ACTIVE' | 'ARCHIVED';

export const BookingStatusPanel: React.FC<BookingStatusPanelProps> = ({
  currentPersona,
  selectedBookingId,
  refreshTrigger,
  onSelectBooking,
  onOpenCustody,
}) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const list = await member2Api.getBookings(undefined, currentPersona);
      setBookings(list);
      setErrorMsg(null);
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Failed to load bookings';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [currentPersona]);

  useEffect(() => {
    let active = true;
    member2Api.getBookings(undefined, currentPersona)
      .then((list) => {
        if (active) {
          setBookings(list);
          setErrorMsg(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Failed to load bookings';
          setErrorMsg(msg);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPersona, refreshTrigger]);

  // Derived effective selection ID (defaults to parent selected ID if present)
  const effectiveExpandedId = expandedBookingId ?? selectedBookingId;

  // Filtering based on tab selection
  const filteredBookings = bookings.filter((b) => {
    const isMine = b.userId === currentPersona.id;
    const isOwner = b.ownerId === currentPersona.id;
    const isAdmin = currentPersona.role === UserRole.ADMIN;

    switch (activeTab) {
      case 'MINE':
        return isMine;
      case 'ACTION_REQUIRED':
        if (isOwner || isAdmin) {
          return b.status === BookingStatus.REQUESTED || b.status === BookingStatus.ELIGIBILITY_VERIFIED || b.status === BookingStatus.RETURNED;
        }
        return b.status === BookingStatus.APPROVED; // Student needs to check in
      case 'ACTIVE':
        return b.status === BookingStatus.APPROVED || b.status === BookingStatus.CHECKED_IN;
      case 'ARCHIVED':
        return b.status === BookingStatus.COMPLETED || b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED;
      case 'ALL':
      default:
        return true;
    }
  });

  // Action: Owner Approves
  const handleApprove = async (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await member2Api.transitionBooking(
        booking.id,
        {
          targetStatus: BookingStatus.APPROVED,
          notes: `Approved by ${currentPersona.name}`,
        },
        currentPersona
      );
      setActionSuccessMsg(`Booking ${booking.id} approved successfully!`);
      setBookings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Approval failed';
      setErrorMsg(msg);
    }
  };

  // Action: Owner Rejects
  const handleReject = async (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    const reason = window.prompt('Please enter the reason for rejecting this booking:', 'Resource unavailable or scheduled maintenance');
    if (!reason) return;

    setErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await member2Api.transitionBooking(
        booking.id,
        {
          targetStatus: BookingStatus.REJECTED,
          reason,
        },
        currentPersona
      );
      setActionSuccessMsg(`Booking ${booking.id} has been rejected.`);
      setBookings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Rejection failed';
      setErrorMsg(msg);
    }
  };

  // Action: Borrower or Owner Cancels
  const handleCancel = async (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to cancel this booking? This will release the slot.')) {
      return;
    }

    setErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await member2Api.transitionBooking(
        booking.id,
        {
          targetStatus: BookingStatus.CANCELLED,
          reason: `Cancelled by ${currentPersona.name}`,
        },
        currentPersona
      );
      setActionSuccessMsg(`Booking ${booking.id} was successfully cancelled.`);
      setBookings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Cancellation failed';
      setErrorMsg(msg);
    }
  };

  // Action: Complete returned booking
  const handleComplete = async (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await member2Api.transitionBooking(
        booking.id,
        {
          targetStatus: BookingStatus.COMPLETED,
          notes: 'Final return inspection completed. Session closed.',
        },
        currentPersona
      );
      setActionSuccessMsg(`Booking ${booking.id} marked as COMPLETED.`);
      setBookings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Completion failed';
      setErrorMsg(msg);
    }
  };

  return (
    <div className="m2-scope">
      <div className="m2-card">
        <div className="m2-card-header">
          <div>
            <h2 className="m2-title">
              <span>📅</span> Resource Bookings & Lifecycle
            </h2>
            <p className="m2-subtitle">
              Live status, RBAC-authorized handoffs, and quota tracking
            </p>
          </div>

          <button
            type="button"
            className="m2-btn m2-btn-secondary"
            onClick={fetchBookings}
            disabled={loading}
            aria-label="Refresh bookings"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Bookings'}
          </button>
        </div>

        {errorMsg && (
          <div className="m2-alert m2-alert-error" role="alert">
            <span>⚠️</span>
            <div>{errorMsg}</div>
          </div>
        )}

        {actionSuccessMsg && (
          <div className="m2-alert m2-alert-success" role="status">
            <span>✓</span>
            <div>{actionSuccessMsg}</div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="m2-filter-tabs" role="tablist" aria-label="Booking Filter Tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            className={`m2-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            All Bookings ({bookings.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MINE'}
            className={`m2-tab-btn ${activeTab === 'MINE' ? 'active' : ''}`}
            onClick={() => setActiveTab('MINE')}
          >
            My Bookings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ACTION_REQUIRED'}
            className={`m2-tab-btn ${activeTab === 'ACTION_REQUIRED' ? 'active' : ''}`}
            onClick={() => setActiveTab('ACTION_REQUIRED')}
          >
            Action Required
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ACTIVE'}
            className={`m2-tab-btn ${activeTab === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setActiveTab('ACTIVE')}
          >
            Active Custody
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ARCHIVED'}
            className={`m2-tab-btn ${activeTab === 'ARCHIVED' ? 'active' : ''}`}
            onClick={() => setActiveTab('ARCHIVED')}
          >
            Archived / History
          </button>
        </div>

        {/* Booking Cards Grid */}
        {filteredBookings.length === 0 ? (
          <div className="m2-empty-state">
            {loading ? 'Loading resource bookings...' : 'No bookings found in this view.'}
          </div>
        ) : (
          <div className="m2-booking-grid">
            {filteredBookings.map((b) => {
              const isMine = b.userId === currentPersona.id;
              const isOwner = b.ownerId === currentPersona.id;
              const isAdmin = currentPersona.role === UserRole.ADMIN;

              const canCancel =
                (isMine || isOwner || isAdmin) &&
                (b.status === BookingStatus.REQUESTED ||
                  b.status === BookingStatus.ELIGIBILITY_VERIFIED ||
                  b.status === BookingStatus.WAITLISTED ||
                  b.status === BookingStatus.APPROVED);

              const canApproveOrReject =
                (isOwner || isAdmin) &&
                (b.status === BookingStatus.REQUESTED ||
                  b.status === BookingStatus.ELIGIBILITY_VERIFIED);

              const canComplete =
                (isOwner || isAdmin) &&
                (b.status === BookingStatus.RETURNED || b.status === BookingStatus.INCIDENT_FLAGGED);

              const canAccessCustody =
                (isMine || isOwner || isAdmin) &&
                (b.status === BookingStatus.APPROVED || b.status === BookingStatus.CHECKED_IN);

              const isExpanded = effectiveExpandedId === b.id;

              return (
                <div
                  key={b.id}
                  className={`m2-booking-item ${isExpanded ? 'selected' : ''}`}
                  onClick={() => {
                    setExpandedBookingId(isExpanded ? null : b.id);
                    if (onSelectBooking) onSelectBooking(b);
                  }}
                  tabIndex={0}
                  role="region"
                  aria-label={`Booking ${b.id} for ${b.resourceName || b.resourceId}`}
                >
                  <div>
                    <div className="m2-booking-item-header">
                      <h3 className="m2-resource-name">{b.resourceName || b.resourceId}</h3>
                      <span className={`m2-badge m2-status-${b.status}`}>
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="m2-time-range">
                      🕒 {new Date(b.startTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })} —{' '}
                      {new Date(b.endTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ({b.estimatedHours}h)
                    </div>

                    <p className="m2-intent-text">
                      <strong>Intent:</strong> {b.intent}
                    </p>

                    <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '8px' }}>
                      <strong>Borrower:</strong>{' '}
                      {b.borrower?.name || b.userId}
                      {b.borrower?.isMasked ? ' (PII Masked)' : ''}
                      {b.borrower?.phone && ` • 📞 ${b.borrower.phone}`}
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div>
                    <div className="m2-item-actions">
                      {canAccessCustody && (
                        <button
                          type="button"
                          className="m2-btn m2-btn-primary m2-btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenCustody) onOpenCustody(b);
                          }}
                        >
                          🔑 {b.status === BookingStatus.APPROVED ? 'Check In Pass' : 'Process Return'}
                        </button>
                      )}

                      {canApproveOrReject && (
                        <>
                          <button
                            type="button"
                            className="m2-btn m2-btn-success m2-btn-sm"
                            onClick={(e) => handleApprove(b, e)}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            className="m2-btn m2-btn-danger m2-btn-sm"
                            onClick={(e) => handleReject(b, e)}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}

                      {canComplete && (
                        <button
                          type="button"
                          className="m2-btn m2-btn-success m2-btn-sm"
                          onClick={(e) => handleComplete(b, e)}
                        >
                          ✓ Sign Off & Complete
                        </button>
                      )}

                      {canCancel && (
                        <button
                          type="button"
                          className="m2-btn m2-btn-secondary m2-btn-sm"
                          onClick={(e) => handleCancel(b, e)}
                        >
                          Cancel Booking
                        </button>
                      )}

                      <button
                        type="button"
                        className="m2-btn m2-btn-secondary m2-btn-sm"
                        style={{ marginLeft: 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedBookingId(isExpanded ? null : b.id);
                        }}
                      >
                        {isExpanded ? 'Hide Details' : 'Details'}
                      </button>
                    </div>

                    {/* Expandable Details & Audit History */}
                    {isExpanded && (
                      <div className="m2-detail-box">
                        <div style={{ fontSize: '0.8125rem', marginBottom: '8px' }}>
                          <strong>Booking Reference:</strong> <code>{b.id}</code>
                        </div>
                        <div style={{ fontSize: '0.8125rem', marginBottom: '8px' }}>
                          <strong>Resource ID:</strong> <code>{b.resourceId}</code>
                        </div>
                        {b.rejectionReason && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--m2-danger)', marginBottom: '8px' }}>
                            <strong>Rejection Reason:</strong> {b.rejectionReason}
                          </div>
                        )}
                        {b.cancellationReason && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--m2-text-muted)', marginBottom: '8px' }}>
                            <strong>Cancellation Reason:</strong> {b.cancellationReason}
                          </div>
                        )}
                        {b.conditionNotes && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--m2-primary)', marginBottom: '8px' }}>
                            <strong>Return Condition:</strong> {b.conditionNotes}
                          </div>
                        )}

                        {b.history && b.history.length > 0 && (
                          <>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--m2-text-muted)', marginTop: '12px' }}>
                              AUDIT TIMELINE:
                            </div>
                            <ul className="m2-timeline">
                              {b.history.map((hist) => (
                                <li key={hist.id} className="m2-timeline-item">
                                  <strong>{hist.toStatus}</strong> by <code>{hist.actorId}</code> ({hist.actorRole})
                                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)' }}>
                                    {new Date(hist.timestamp).toLocaleString()}
                                    {hist.notes && ` — ${hist.notes}`}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
