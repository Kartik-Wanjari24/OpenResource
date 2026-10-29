import React, { useState, useEffect } from 'react';
import type { UserPersona } from '../../types/member2.ts';

interface AuditEvent {
  id: string;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  eventType: string;
  timestamp: string;
  actorId: string;
  actorRole?: string;
  resourceId?: string;
  bookingId?: string;
  userId?: string;
  metadata: Record<string, any>;
  description: string;
}

interface VerificationResult {
  valid: boolean;
  totalEvents: number;
  verifiedEvents: number;
  firstFailureAt?: number;
  errors: Array<{
    sequenceNumber: number;
    errorType: string;
    message: string;
    expected?: string;
    actual?: string;
  }>;
  verificationTimestamp: string;
}

interface AuditExplorerProps {
  currentPersona: UserPersona;
  onClose: () => void;
}

export const AuditExplorer: React.FC<AuditExplorerProps> = ({
  currentPersona,
  onClose,
}) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditEvents();
  }, [currentPersona]);

  const fetchAuditEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/audit/events?limit=100', {
        headers: {
          'X-Test-User-Id': currentPersona.id,
          'X-Test-User-Role': currentPersona.role,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch audit events');
      }

      const data = await response.json();
      setEvents(data.data.events || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audit events';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    setVerificationError(null);
    setVerificationResult(null);

    try {
      const response = await fetch('/api/audit/verify', {
        headers: {
          'X-Test-User-Id': currentPersona.id,
          'X-Test-User-Role': currentPersona.role,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to verify audit chain');
      }

      const data = await response.json();
      setVerificationResult(data.data.integrity);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify audit chain';
      setVerificationError(message);
    } finally {
      setVerifying(false);
    }
  };

  const getEventTypeColor = (eventType: string) => {
    if (eventType.includes('booking')) return '#3b82f6';
    if (eventType.includes('check_in') || eventType.includes('check_out')) return '#8b5cf6';
    if (eventType.includes('damage') || eventType.includes('incident')) return '#dc2626';
    if (eventType.includes('eligibility') || eventType.includes('badge')) return '#10b981';
    return '#6b7280';
  };

  const formatEventType = (eventType: string) => {
    return eventType.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="m2-custody-modal-backdrop" onClick={onClose}>
      <div
        className="m2-custody-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: selectedEvent ? '900px' : '1000px', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="m2-card-header">
          <div>
            <h2 className="m2-title">🔐 Cryptographic Audit Explorer</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
              SHA-256 Hash-Chained Event Timeline • Phase 5
            </p>
          </div>
          <button type="button" className="m2-btn m2-btn-secondary m2-btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Verification Section */}
        <div style={{ padding: '0 24px 16px' }}>
          <button
            type="button"
            className="m2-btn m2-btn-primary"
            onClick={handleVerifyChain}
            disabled={verifying || loading}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {verifying ? '🔄 Verifying Hash Chain...' : '✓ Verify Hash Chain Integrity'}
          </button>

          {verificationResult && (
            <div
              className={verificationResult.valid ? 'm2-alert m2-alert-success' : 'm2-alert m2-alert-error'}
              style={{ marginTop: '12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <div style={{ fontSize: '1.5rem' }}>
                  {verificationResult.valid ? '✅' : '❌'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                    {verificationResult.valid ? 'Hash Chain Valid' : 'Hash Chain Compromised'}
                  </div>
                  <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                    <strong>Total Events:</strong> {verificationResult.totalEvents} |
                    <strong> Verified:</strong> {verificationResult.verifiedEvents} |
                    <strong> Failed:</strong> {verificationResult.totalEvents - verificationResult.verifiedEvents}
                  </div>
                  {!verificationResult.valid && verificationResult.firstFailureAt && (
                    <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                      <strong>First Failure:</strong> Sequence #{verificationResult.firstFailureAt}
                    </div>
                  )}
                  {verificationResult.errors && verificationResult.errors.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.875rem' }}>
                        Integrity Errors:
                      </div>
                      {verificationResult.errors.slice(0, 3).map((err, idx) => (
                        <div key={idx} style={{ fontSize: '0.75rem', marginBottom: '4px', paddingLeft: '12px' }}>
                          • Seq #{err.sequenceNumber}: {err.errorType} - {err.message}
                        </div>
                      ))}
                      {verificationResult.errors.length > 3 && (
                        <div style={{ fontSize: '0.75rem', fontStyle: 'italic', paddingLeft: '12px' }}>
                          ...and {verificationResult.errors.length - 3} more errors
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '8px' }}>
                    Verified at: {new Date(verificationResult.verificationTimestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {verificationError && (
            <div className="m2-alert m2-alert-error" style={{ marginTop: '12px' }}>
              <strong>Verification Failed:</strong> {verificationError}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--m2-text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
            <div>Loading audit timeline...</div>
          </div>
        )}

        {error && (
          <div className="m2-alert m2-alert-error" style={{ margin: '0 24px 16px' }}>
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>No Audit Events</div>
            <div style={{ color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
              The audit ledger is currently empty. Events will appear here as actions are performed.
            </div>
            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--m2-bg-secondary)', borderRadius: '8px', fontSize: '0.875rem' }}>
              <strong>Note:</strong> Phase 3 uses in-memory storage. Events reset on server restart.
            </div>
          </div>
        )}

        {!loading && !error && events.length > 0 && !selectedEvent && (
          <div>
            <div style={{ padding: '0 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--m2-border)' }}>
              <div style={{ color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
                {events.length} event{events.length !== 1 ? 's' : ''} in chain
              </div>
              <button type="button" className="m2-btn m2-btn-sm m2-btn-secondary" onClick={fetchAuditEvents}>
                🔄 Refresh
              </button>
            </div>

            <div style={{ padding: '16px 24px' }}>
              {events.map((event, index) => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: index < events.length - 1 ? '16px' : '0',
                    cursor: 'pointer',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--m2-border)',
                    background: 'var(--m2-bg-card)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onClick={() => setSelectedEvent(event)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--m2-shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>
                      Seq
                    </div>
                    <div style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: getEventTypeColor(event.eventType),
                    }}>
                      #{event.sequenceNumber}
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: `${getEventTypeColor(event.eventType)}20`,
                          color: getEventTypeColor(event.eventType),
                        }}
                      >
                        {formatEventType(event.eventType)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)' }}>
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.875rem', marginBottom: '8px', lineHeight: '1.4' }}>
                      {event.description}
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--m2-text-muted)' }}>
                      {event.actorId && (
                        <div>
                          <strong>Actor:</strong> {event.actorId}
                          {event.actorRole && ` (${event.actorRole})`}
                        </div>
                      )}
                      {event.bookingId && (
                        <div>
                          <strong>Booking:</strong> {event.bookingId}
                        </div>
                      )}
                      {event.resourceId && (
                        <div>
                          <strong>Resource:</strong> {event.resourceId}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--m2-border)', background: 'var(--m2-bg-secondary)', fontSize: '0.875rem' }}>
              <strong>⚠️ Storage Limitation:</strong> This audit ledger uses in-memory storage and resets on server restart.
              Production deployment requires durable database storage for persistent audit trails.
            </div>
          </div>
        )}

        {selectedEvent && (
          <div style={{ padding: '0 24px 24px' }}>
            <button
              type="button"
              className="m2-btn m2-btn-sm m2-btn-secondary"
              onClick={() => setSelectedEvent(null)}
              style={{ marginBottom: '16px' }}
            >
              ← Back to Timeline
            </button>

            <div className="m2-card">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>
                Event Details - Sequence #{selectedEvent.sequenceNumber}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Event Type</div>
                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    background: `${getEventTypeColor(selectedEvent.eventType)}20`,
                    color: getEventTypeColor(selectedEvent.eventType),
                    display: 'inline-block',
                  }}>
                    {formatEventType(selectedEvent.eventType)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Timestamp</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Actor</div>
                  <div style={{ fontSize: '0.875rem' }}>
                    {selectedEvent.actorId}
                    {selectedEvent.actorRole && <span style={{ color: 'var(--m2-text-muted)' }}> ({selectedEvent.actorRole})</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Event ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                    {selectedEvent.id}
                  </div>
                </div>
              </div>

              {(selectedEvent.bookingId || selectedEvent.resourceId || selectedEvent.userId) && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--m2-bg-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Related Entities</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.875rem' }}>
                    {selectedEvent.bookingId && (
                      <div><strong>Booking:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEvent.bookingId}</span></div>
                    )}
                    {selectedEvent.resourceId && (
                      <div><strong>Resource:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEvent.resourceId}</span></div>
                    )}
                    {selectedEvent.userId && (
                      <div><strong>User:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEvent.userId}</span></div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Description</div>
                <div style={{ padding: '12px', background: 'var(--m2-bg-secondary)', borderRadius: '6px', fontSize: '0.875rem', lineHeight: '1.5' }}>
                  {selectedEvent.description}
                </div>
              </div>

              {Object.keys(selectedEvent.metadata).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Metadata</div>
                  <pre style={{
                    padding: '12px',
                    background: '#1e293b',
                    color: '#e2e8f0',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: '200px',
                  }}>
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--m2-border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>Hash Chain Links</div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>
                    Previous Hash {selectedEvent.previousHash === 'GENESIS' && '(Genesis Event)'}
                  </div>
                  <div style={{
                    padding: '8px 12px',
                    background: selectedEvent.previousHash === 'GENESIS' ? '#fef3c7' : '#f1f5f9',
                    border: selectedEvent.previousHash === 'GENESIS' ? '1px solid #fbbf24' : '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    wordBreak: 'break-all',
                    color: selectedEvent.previousHash === 'GENESIS' ? '#92400e' : '#334155',
                  }}>
                    {selectedEvent.previousHash}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>
                    Current Hash (SHA-256)
                  </div>
                  <div style={{
                    padding: '8px 12px',
                    background: '#dbeafe',
                    border: '1px solid #3b82f6',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    wordBreak: 'break-all',
                    color: '#1e40af',
                  }}>
                    {selectedEvent.currentHash}
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--m2-bg-secondary)', borderRadius: '6px', fontSize: '0.75rem', lineHeight: '1.6' }}>
                  <strong>Hash Calculation:</strong> This event's hash is calculated as SHA-256(previousHash || canonicalPayload).
                  The next event in the chain will link to this hash, creating an immutable cryptographic chain.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
