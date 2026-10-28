import React, { useState } from 'react';
import type { Booking, CustodyCredential, UserPersona } from '../../types/member2.ts';
import { BookingStatus, CustodyAction, UserRole } from '../../types/member2.ts';
import { member2Api, ApiClientError } from '../../services/member2Api.ts';

interface CustodyPanelProps {
  booking: Booking | null;
  currentPersona: UserPersona;
  onClose: () => void;
  onBookingUpdated: (booking: Booking) => void;
}

export const CustodyPanel: React.FC<CustodyPanelProps> = ({
  booking,
  currentPersona,
  onClose,
  onBookingUpdated,
}) => {
  // Secure volatile state: erased on close or booking switch
  const [credential, setCredential] = useState<CustodyCredential | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!booking) return null;

  const isApproved = booking.status === BookingStatus.APPROVED;
  const isCheckedIn = booking.status === BookingStatus.CHECKED_IN;
  const isBorrower = booking.userId === currentPersona.id;
  const isOwner = booking.ownerId === currentPersona.id;
  const isAdmin = currentPersona.role === UserRole.ADMIN;
  const isAuthorized = isBorrower || isOwner || isAdmin;

  // 1. Generate One-Time Credential (OTP / QR Token)
  const handleGenerateCredential = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await member2Api.handleCustodyAction(
        booking.id,
        {
          action: CustodyAction.GENERATE_CREDENTIAL,
          credentialAction: 'CHECK_IN',
          ttlMinutes: 10,
        },
        currentPersona
      );

      if (res.credential) {
        setCredential(res.credential);
        setSuccessMsg('New one-time custody credential generated. Valid for 10 minutes.');
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Failed to generate credential';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 2. Perform Check-In
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) {
      setErrorMsg('Please enter the 6-digit OTP code or QR token to verify check-in');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const isCodeAllDigits = /^\d+$/.test(otpInput.trim());
      const res = await member2Api.handleCustodyAction(
        booking.id,
        {
          action: CustodyAction.CHECK_IN,
          otpCode: isCodeAllDigits ? otpInput.trim() : undefined,
          qrToken: !isCodeAllDigits ? otpInput.trim() : undefined,
        },
        currentPersona
      );

      if (res.booking) {
        setSuccessMsg('Check-in verified successfully! Resource custody is now active.');
        // Cleanse memory
        setCredential(null);
        setOtpInput('');
        onBookingUpdated(res.booking);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Check-in verification failed';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 3. Perform Check-Out / Return
  const handleCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await member2Api.handleCustodyAction(
        booking.id,
        {
          action: CustodyAction.CHECK_OUT,
          conditionNotes: conditionNotes.trim() || undefined,
          incidentFlag,
        },
        currentPersona
      );

      if (res.booking) {
        setSuccessMsg(
          incidentFlag
            ? 'Resource return recorded with incident flag. Escalated for owner inspection.'
            : 'Resource returned successfully. Custody session concluded.'
        );
        // Cleanse memory
        setCredential(null);
        setConditionNotes('');
        setIncidentFlag(false);
        onBookingUpdated(res.booking);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Return processing failed';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Wipes sensitive credential state on exit
    setCredential(null);
    setOtpInput('');
    setConditionNotes('');
    setIncidentFlag(false);
    onClose();
  };

  return (
    <div className="m2-scope">
      <div
        className="m2-custody-modal-backdrop"
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custody-modal-title"
      >
        <div className="m2-custody-modal" onClick={(e) => e.stopPropagation()}>
          <div className="m2-card-header">
            <div>
              <h2 id="custody-modal-title" className="m2-title">
                Custody Handover & Verification
              </h2>
              <div className="m2-subtitle">
                Booking ID: <code>{booking.id}</code> • Resource:{' '}
                <strong>{booking.resourceName || booking.resourceId}</strong>
              </div>
            </div>
            <button
              type="button"
              className="m2-btn m2-btn-secondary m2-btn-sm"
              onClick={handleClose}
              aria-label="Close custody modal"
            >
              ✕ Close
            </button>
          </div>

          {errorMsg && (
            <div className="m2-alert m2-alert-error" role="alert">
              <span>⚠️</span>
              <div>{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="m2-alert m2-alert-success" role="status">
              <span>✓</span>
              <div>{successMsg}</div>
            </div>
          )}

          {!isAuthorized && (
            <div className="m2-alert m2-alert-error">
              <span>🔒</span>
              <div>
                <strong>Access Restricted</strong>: Only the authorized borrower (
                <code>{booking.userId}</code>) or the resource owner can manage custody for this booking.
              </div>
            </div>
          )}

          {/* Workflow 1: Check-In Handover */}
          {isApproved && isAuthorized && (
            <div>
              <div style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
                This booking is <strong>APPROVED</strong>. Present a one-time OTP or QR pass at the physical lab bench to take custody.
              </div>

              {!credential ? (
                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <button
                    type="button"
                    className="m2-btn m2-btn-primary"
                    onClick={handleGenerateCredential}
                    disabled={loading}
                    id="btn-generate-credential"
                  >
                    {loading ? 'Generating...' : '🔑 Generate One-Time Check-In Pass'}
                  </button>
                  <p style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)', marginTop: '8px' }}>
                    Passes expire automatically in 10 minutes and allow a maximum of 3 verification attempts.
                  </p>
                </div>
              ) : (
                <div className="m2-credential-display">
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--m2-text-muted)' }}>
                    CONFIDENTIAL CHECK-IN CODE (SINGLE USE)
                  </div>
                  <div className="m2-otp-code" id="display-otp-code">
                    {credential.otpCode}
                  </div>
                  <div style={{ fontSize: '0.75rem', marginBottom: '8px', color: 'var(--m2-text-muted)' }}>
                    Opaque QR Token payload:
                  </div>
                  <div className="m2-qr-text">{credential.qrToken}</div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--m2-warning)',
                      marginTop: '10px',
                      fontWeight: 500,
                    }}
                  >
                    Expires at: {new Date(credential.expiresAt).toLocaleTimeString()} • Attempts remaining:{' '}
                    {credential.attemptsRemaining}
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--m2-border)', margin: '20px 0' }} />

              <form onSubmit={handleCheckIn}>
                <div className="m2-form-group">
                  <label htmlFor="otp-input" className="m2-form-label">
                    Enter Verification Code (OTP or QR Token):
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    className="m2-form-input"
                    placeholder="e.g. 749102"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                    maxLength={64}
                  />
                </div>
                <button
                  type="submit"
                  className="m2-btn m2-btn-success"
                  style={{ width: '100%' }}
                  disabled={loading || !otpInput.trim()}
                  id="btn-confirm-checkin"
                >
                  {loading ? 'Verifying...' : '✓ Confirm Check-In & Take Custody'}
                </button>
              </form>
            </div>
          )}

          {/* Workflow 2: Check-Out / Return */}
          {isCheckedIn && isAuthorized && (
            <form onSubmit={handleCheckOut}>
              <div style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
                Resource is currently <strong>CHECKED IN</strong> under custody. Inspect the item and record return condition notes below.
              </div>

              <div className="m2-form-group">
                <label htmlFor="condition-notes" className="m2-form-label">
                  Return Condition & Handover Notes:
                </label>
                <textarea
                  id="condition-notes"
                  className="m2-form-textarea"
                  rows={3}
                  placeholder="e.g. Cleaned 3D print bed, no nozzle clogs, original power cable returned"
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="m2-form-group">
                <label className="m2-checkbox-label">
                  <input
                    type="checkbox"
                    checked={incidentFlag}
                    onChange={(e) => setIncidentFlag(e.target.checked)}
                    disabled={loading}
                    id="checkbox-incident-flag"
                  />
                  <span>⚠️ Report Damage, Defect, or Safety Incident</span>
                </label>
                {incidentFlag && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--m2-danger)', marginTop: '4px' }}>
                    This booking will transition to INCIDENT_FLAGGED for mandatory lab manager inspection.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className={`m2-btn ${incidentFlag ? 'm2-btn-danger' : 'm2-btn-primary'}`}
                style={{ width: '100%' }}
                disabled={loading}
                id="btn-confirm-checkout"
              >
                {loading
                  ? 'Processing Return...'
                  : incidentFlag
                  ? 'Flag Incident & Process Return'
                  : '✓ Process Safe Return (Conclude Custody)'}
              </button>
            </form>
          )}

          {/* Non-custody statuses */}
          {!isApproved && !isCheckedIn && (
            <div className="m2-empty-state">
              Custody operations are only available for bookings in <strong>APPROVED</strong> (check-in) or{' '}
              <strong>CHECKED_IN</strong> (return) status. Current status is <code>{booking.status}</code>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
