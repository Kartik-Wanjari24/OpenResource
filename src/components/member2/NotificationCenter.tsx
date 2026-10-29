import React, { useState, useEffect, useCallback } from 'react';
import type { NotificationRecord, UserPersona } from '../../types/member2.ts';
import { member2Api, ApiClientError } from '../../services/member2Api.ts';

interface NotificationCenterProps {
  currentPersona: UserPersona;
  refreshTrigger?: number;
  onSelectBooking?: (bookingId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentPersona,
  refreshTrigger,
  onSelectBooking,
}) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await member2Api.getNotifications(
        { unreadOnly: filterUnread, limit: 30 },
        currentPersona
      );
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
      setErrorMsg(null);
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Failed to load notifications';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [currentPersona, filterUnread]);

  useEffect(() => {
    let active = true;
    member2Api.getNotifications({ unreadOnly: filterUnread, limit: 30 }, currentPersona)
      .then((res) => {
        if (active) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setErrorMsg(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Failed to load notifications';
          setErrorMsg(msg);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPersona, filterUnread, refreshTrigger]);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await member2Api.markNotificationAsRead(id, currentPersona);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await member2Api.markAllNotificationsAsRead(currentPersona);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  return (
    <div className="m2-scope">
      <div className="m2-card">
        <div className="m2-notif-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h3 className="m2-title" style={{ fontSize: '1.125rem' }}>
              <span>🔔</span> In-App Notifications
              {unreadCount > 0 && (
                <span className="m2-notif-badge-count" aria-label={`${unreadCount} unread notifications`}>
                  {unreadCount} unread
                </span>
              )}
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`m2-btn m2-btn-sm ${filterUnread ? 'm2-btn-primary' : 'm2-btn-secondary'}`}
              onClick={() => setFilterUnread(!filterUnread)}
              aria-pressed={filterUnread}
            >
              {filterUnread ? 'Showing Unread' : 'Filter Unread'}
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                className="m2-btn m2-btn-secondary m2-btn-sm"
                onClick={handleMarkAllAsRead}
                disabled={loading}
              >
                Mark All Read
              </button>
            )}
            <button
              type="button"
              className="m2-btn m2-btn-secondary m2-btn-sm"
              onClick={fetchNotifications}
              disabled={loading}
              aria-label="Refresh notifications"
            >
              🔄
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="m2-alert m2-alert-error" style={{ marginTop: '12px' }}>
            <span>⚠️</span>
            <div>{errorMsg}</div>
          </div>
        )}

        {loading && notifications.length === 0 && (
          <div className="m2-empty-state">Loading notifications...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="m2-empty-state">
            {filterUnread ? 'No unread notifications' : 'No notifications found for this persona'}
          </div>
        )}

        <div className="m2-notif-list" style={{ marginTop: '12px' }}>
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`m2-notif-item ${!notif.read ? 'unread' : ''}`}
              onClick={() => {
                if (onSelectBooking) onSelectBooking(notif.bookingId);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (onSelectBooking) onSelectBooking(notif.bookingId);
                }
              }}
              style={{ cursor: onSelectBooking ? 'pointer' : 'default' }}
            >
              <div className="m2-notif-top">
                <span className="m2-notif-title">{notif.title}</span>
                <span className="m2-notif-time">
                  {new Date(notif.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="m2-notif-message">{notif.message}</p>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '8px',
                }}
              >
                <span style={{ fontSize: '0.6875rem', color: 'var(--m2-text-muted)' }}>
                  Booking: <code>{notif.bookingId}</code>
                </span>
                {!notif.read && (
                  <button
                    type="button"
                    className="m2-btn m2-btn-secondary m2-btn-sm"
                    onClick={(e) => handleMarkAsRead(notif.id, e)}
                    style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                  >
                    Mark as Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
