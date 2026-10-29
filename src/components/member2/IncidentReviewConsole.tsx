import React, { useState, useEffect } from 'react';
import type { UserPersona } from '../../types/member2.ts';

interface DetectedAnomaly {
  type: string;
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE';
  confidence?: number;
}

interface Penalty {
  amount: number;
  currency: string;
  description: string;
}

interface Incident {
  id: string;
  bookingId: string;
  resourceId: string;
  userId: string;
  source: 'AI_INSPECTION' | 'MANUAL_REPORT';
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'OVERRIDDEN' | 'DISMISSED';

  // AI-detected anomalies
  detectedAnomalies?: DetectedAnomaly[];
  aiSeverity?: 'MINOR' | 'MODERATE' | 'SEVERE';
  matchScore?: number;

  // Manual report
  reportedBy?: string;
  reportDescription?: string;

  // Proposed and final penalties
  proposedPenalty?: Penalty;
  finalPenalty?: Penalty;

  // Review details
  reviewedBy?: string;
  reviewedAt?: string;
  reviewDecision?: 'CONFIRM' | 'OVERRIDE' | 'DISMISS';
  reviewReason: string;

  createdAt: string;
  updatedAt: string;
}

interface IncidentReviewConsoleProps {
  currentPersona: UserPersona;
  onClose: () => void;
}

export const IncidentReviewConsole: React.FC<IncidentReviewConsoleProps> = ({
  currentPersona,
  onClose,
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review form state
  const [decision, setDecision] = useState<'CONFIRM' | 'OVERRIDE' | 'DISMISS'>('CONFIRM');
  const [reason, setReason] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideCurrency, setOverrideCurrency] = useState('USD');
  const [overrideDescription, setOverrideDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isAuthorized = ['LAB_OWNER', 'ADMIN', 'AUDITOR'].includes(currentPersona.role);

  useEffect(() => {
    fetchPendingIncidents();
  }, [currentPersona]);

  const fetchPendingIncidents = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/incidents/pending', {
        headers: {
          'X-Test-User-Id': currentPersona.id,
          'X-Test-User-Role': currentPersona.role,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch pending incidents');
      }

      const data = await response.json();
      setIncidents(data.data.incidents || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load incidents';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const requestBody: any = {
        decision,
        reason: reason.trim(),
      };

      // Include finalPenalty for OVERRIDE decision
      if (decision === 'OVERRIDE') {
        const amount = parseFloat(overrideAmount);
        if (isNaN(amount) || amount < 0) {
          throw new Error('Invalid override amount');
        }
        requestBody.finalPenalty = {
          amount,
          currency: overrideCurrency,
          description: overrideDescription.trim(),
        };
      }

      const response = await fetch(`/api/incidents/${selectedIncident.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': currentPersona.id,
          'X-Test-User-Role': currentPersona.role,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to resolve incident');
      }

      const data = await response.json();
      const resolvedIncident = data.data.incident;

      // Update local state
      setIncidents((prev) => prev.filter((i) => i.id !== selectedIncident.id));
      setSelectedIncident(resolvedIncident);
      setSubmitSuccess(true);

      // Close review form after 2 seconds
      setTimeout(() => {
        setSelectedIncident(null);
        setReason('');
        setOverrideAmount('');
        setOverrideDescription('');
        setSubmitSuccess(false);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve incident';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'SEVERE':
        return '#dc2626';
      case 'MODERATE':
        return '#ea580c';
      case 'MINOR':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return '#f59e0b';
      case 'CONFIRMED':
        return '#dc2626';
      case 'OVERRIDDEN':
        return '#3b82f6';
      case 'DISMISSED':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  if (!isAuthorized) {
    return (
      <div className="m2-custody-modal-backdrop" onClick={onClose}>
        <div className="m2-custody-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
          <div className="m2-card-header">
            <h2 className="m2-title">Access Denied</h2>
            <button type="button" className="m2-btn m2-btn-secondary m2-btn-sm" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="m2-alert m2-alert-error">
            Only lab owners, administrators, and auditors can access the incident review console.
          </div>
          <button type="button" className="m2-btn m2-btn-secondary" onClick={onClose} style={{ width: '100%', marginTop: '16px' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m2-custody-modal-backdrop" onClick={onClose}>
      <div
        className="m2-custody-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: selectedIncident ? '900px' : '800px', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="m2-card-header">
          <div>
            <h2 className="m2-title">Incident Review Console</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
              Human-in-the-Loop Dispute Resolution • Phase 4
            </p>
          </div>
          <button type="button" className="m2-btn m2-btn-secondary m2-btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--m2-text-muted)' }}>
            Loading pending incidents...
          </div>
        )}

        {error && (
          <div className="m2-alert m2-alert-error">
            {error}
          </div>
        )}

        {!loading && !error && incidents.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No Pending Incidents</div>
            <div style={{ color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
              All damage reports have been reviewed and resolved.
            </div>
          </div>
        )}

        {!loading && !error && incidents.length > 0 && !selectedIncident && (
          <div>
            <div style={{ padding: '0 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
                {incidents.length} incident{incidents.length !== 1 ? 's' : ''} pending review
              </div>
              <button type="button" className="m2-btn m2-btn-sm m2-btn-secondary" onClick={fetchPendingIncidents}>
                🔄 Refresh
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="m2-card"
                  style={{ margin: '0 24px', cursor: 'pointer', transition: 'transform 0.15s' }}
                  onClick={() => setSelectedIncident(incident)}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: incident.source === 'AI_INSPECTION' ? '#eff6ff' : '#fef3c7',
                            color: incident.source === 'AI_INSPECTION' ? '#1e40af' : '#92400e',
                          }}
                        >
                          {incident.source === 'AI_INSPECTION' ? '🤖 AI-Detected' : '📝 Manual Report'}
                        </span>
                        {incident.aiSeverity && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: `${getSeverityColor(incident.aiSeverity)}20`,
                              color: getSeverityColor(incident.aiSeverity),
                            }}
                          >
                            {incident.aiSeverity}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--m2-text-muted)' }}>
                        Booking: {incident.bookingId} • Resource: {incident.resourceId}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {incident.proposedPenalty && (
                        <div style={{ fontWeight: 600, color: '#dc2626' }}>
                          ${incident.proposedPenalty.amount.toFixed(2)} {incident.proposedPenalty.currency}
                        </div>
                      )}
                    </div>
                  </div>

                  {incident.detectedAnomalies && incident.detectedAnomalies.length > 0 && (
                    <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                      <strong>{incident.detectedAnomalies.length} anomal{incident.detectedAnomalies.length !== 1 ? 'ies' : 'y'} detected:</strong>
                      <div style={{ marginTop: '4px', color: 'var(--m2-text-muted)' }}>
                        {incident.detectedAnomalies[0].description}
                        {incident.detectedAnomalies.length > 1 && ` (and ${incident.detectedAnomalies.length - 1} more)`}
                      </div>
                    </div>
                  )}

                  {incident.reportDescription && (
                    <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                      <div style={{ color: 'var(--m2-text-muted)' }}>{incident.reportDescription.substring(0, 100)}{incident.reportDescription.length > 100 && '...'}</div>
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '8px' }}>
                    Reported {new Date(incident.createdAt).toLocaleString()}
                    {incident.reportedBy && ` by ${incident.reportedBy}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedIncident && (
          <div style={{ padding: '0 24px 24px' }}>
            <button
              type="button"
              className="m2-btn m2-btn-sm m2-btn-secondary"
              onClick={() => {
                setSelectedIncident(null);
                setReason('');
                setOverrideAmount('');
                setOverrideDescription('');
                setSubmitError(null);
                setSubmitSuccess(false);
              }}
              style={{ marginBottom: '16px' }}
            >
              ← Back to List
            </button>

            <div className="m2-card">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Incident Details</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Source</div>
                  <div style={{ fontWeight: 500 }}>
                    {selectedIncident.source === 'AI_INSPECTION' ? '🤖 AI Inspection' : '📝 Manual Report'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Status</div>
                  <div style={{ fontWeight: 500, color: getStatusColor(selectedIncident.status) }}>
                    {selectedIncident.status.replace('_', ' ')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Booking ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedIncident.bookingId}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginBottom: '4px' }}>Resource ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedIncident.resourceId}</div>
                </div>
              </div>

              {selectedIncident.detectedAnomalies && selectedIncident.detectedAnomalies.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>
                    AI-Detected Anomalies ({selectedIncident.detectedAnomalies.length})
                  </div>
                  {selectedIncident.matchScore !== undefined && (
                    <div style={{ fontSize: '0.875rem', color: 'var(--m2-text-muted)', marginBottom: '8px' }}>
                      Match Score: {selectedIncident.matchScore}% • Severity: <strong style={{ color: getSeverityColor(selectedIncident.aiSeverity) }}>{selectedIncident.aiSeverity}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedIncident.detectedAnomalies.map((anomaly, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          borderLeft: `3px solid ${getSeverityColor(anomaly.severity)}`,
                          background: 'var(--m2-bg-secondary)',
                          borderRadius: '4px',
                        }}
                      >
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '4px' }}>
                          {anomaly.type.replace('_', ' ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--m2-text-muted)' }}>
                          {anomaly.description}
                        </div>
                        {anomaly.confidence && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '4px' }}>
                            Confidence: {(anomaly.confidence * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedIncident.reportDescription && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Manual Report Description</div>
                  <div
                    style={{
                      padding: '12px',
                      background: 'var(--m2-bg-secondary)',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                    }}
                  >
                    {selectedIncident.reportDescription}
                  </div>
                  {selectedIncident.reportedBy && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '4px' }}>
                      Reported by: {selectedIncident.reportedBy}
                    </div>
                  )}
                </div>
              )}

              {selectedIncident.proposedPenalty && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Proposed Penalty</div>
                  <div
                    style={{
                      padding: '12px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
                      ${selectedIncident.proposedPenalty.amount.toFixed(2)} {selectedIncident.proposedPenalty.currency}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
                      {selectedIncident.proposedPenalty.description}
                    </div>
                  </div>
                </div>
              )}

              {selectedIncident.status === 'PENDING_REVIEW' && (
                <form onSubmit={handleResolveIncident}>
                  <div style={{ borderTop: '1px solid var(--m2-border)', paddingTop: '16px', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Resolution Decision</h4>

                    {submitError && (
                      <div className="m2-alert m2-alert-error" style={{ marginBottom: '16px' }}>
                        {submitError}
                      </div>
                    )}

                    {submitSuccess && (
                      <div className="m2-alert m2-alert-success" style={{ marginBottom: '16px' }}>
                        Incident resolved successfully! Closing...
                      </div>
                    )}

                    <div className="m2-form-group">
                      <label className="m2-form-label">Decision *</label>
                      <select
                        className="m2-form-input"
                        value={decision}
                        onChange={(e) => setDecision(e.target.value as any)}
                        required
                      >
                        <option value="CONFIRM">✅ Confirm - Accept proposed penalty as-is</option>
                        <option value="OVERRIDE">📝 Override - Modify the penalty amount</option>
                        <option value="DISMISS">🚫 Dismiss - No penalty warranted</option>
                      </select>
                    </div>

                    {decision === 'OVERRIDE' && (
                      <>
                        <div className="m2-form-group">
                          <label className="m2-form-label">Override Penalty Amount *</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              className="m2-form-input"
                              value={overrideAmount}
                              onChange={(e) => setOverrideAmount(e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              required
                              style={{ flex: 1 }}
                            />
                            <select
                              className="m2-form-input"
                              value={overrideCurrency}
                              onChange={(e) => setOverrideCurrency(e.target.value)}
                              style={{ width: '100px' }}
                            >
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                        </div>

                        <div className="m2-form-group">
                          <label className="m2-form-label">Override Penalty Description *</label>
                          <input
                            type="text"
                            className="m2-form-input"
                            value={overrideDescription}
                            onChange={(e) => setOverrideDescription(e.target.value)}
                            placeholder="e.g., Reduced cost for partial damage"
                            required
                          />
                        </div>
                      </>
                    )}

                    <div className="m2-form-group">
                      <label className="m2-form-label">
                        Resolution Reason * <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--m2-text-muted)' }}>(min 10 characters for audit trail)</span>
                      </label>
                      <textarea
                        className="m2-form-textarea"
                        rows={4}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain the basis for your decision. This will be recorded in the audit trail."
                        required
                        minLength={10}
                      />
                      <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '4px' }}>
                        {reason.length}/10 characters minimum
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="m2-btn m2-btn-primary"
                      disabled={submitting || reason.length < 10 || (decision === 'OVERRIDE' && (!overrideAmount || !overrideDescription))}
                      style={{ width: '100%' }}
                    >
                      {submitting ? 'Resolving Incident...' : `${decision === 'CONFIRM' ? '✅ Confirm' : decision === 'OVERRIDE' ? '📝 Override' : '🚫 Dismiss'} Incident`}
                    </button>
                  </div>
                </form>
              )}

              {selectedIncident.status !== 'PENDING_REVIEW' && (
                <div style={{ borderTop: '1px solid var(--m2-border)', paddingTop: '16px', marginTop: '16px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Resolution</h4>
                  <div style={{ padding: '12px', background: 'var(--m2-bg-secondary)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                      <strong>Decision:</strong> <span style={{ color: getStatusColor(selectedIncident.status) }}>{selectedIncident.reviewDecision}</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                      <strong>Reason:</strong> {selectedIncident.reviewReason}
                    </div>
                    {selectedIncident.finalPenalty && (
                      <div style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                        <strong>Final Penalty:</strong> ${selectedIncident.finalPenalty.amount.toFixed(2)} {selectedIncident.finalPenalty.currency} - {selectedIncident.finalPenalty.description}
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)' }}>
                      Reviewed by {selectedIncident.reviewedBy} on {selectedIncident.reviewedAt && new Date(selectedIncident.reviewedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
