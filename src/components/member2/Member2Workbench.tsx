import React, { useState } from 'react';
import type { Booking, UserPersona, CreateBookingInput } from '../../types/member2.ts';
import { PRECONFIGURED_PERSONAS, member2Api, setActivePersona } from '../../services/member2Api.ts';
import { PersonaSwitcher } from './PersonaSwitcher.tsx';
import { BookingStatusPanel } from './BookingStatusPanel.tsx';
import { CustodyPanel } from './CustodyPanel.tsx';
import { NotificationCenter } from './NotificationCenter.tsx';
import './member2.css';

interface Member2WorkbenchProps {
  initialPersona?: UserPersona;
}

export const Member2Workbench: React.FC<Member2WorkbenchProps> = ({
  initialPersona = PRECONFIGURED_PERSONAS.demo_qualified_student,
}) => {
  const [currentPersona, setCurrentPersonaState] = useState<UserPersona>(initialPersona);
  const [activeCustodyBooking, setActiveCustodyBooking] = useState<Booking | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Quick booking modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resourceId, setResourceId] = useState('res_3d_prusa');
  const [durationHours, setDurationHours] = useState('2');
  const [intent, setIntent] = useState('Robotics prototype component fabrication');
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handlePersonaChange = (p: UserPersona) => {
    setCurrentPersonaState(p);
    setActivePersona(p);
    setActiveCustodyBooking(null);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateMsg(null);

    const now = new Date();
    // Schedule 1 hour from now
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + parseFloat(durationHours) * 60 * 60 * 1000);

    const input: CreateBookingInput = {
      resourceId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      intent: intent.trim(),
    };

    try {
      const newBooking = await member2Api.createBooking(input, currentPersona);
      setRefreshTick((t) => t + 1);
      setCreateMsg({
        type: 'success',
        text: `Booking requested! Status: ${newBooking.status}. Reference: ${newBooking.id}`,
      });
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateMsg(null);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create booking';
      setCreateMsg({ type: 'error', text: message });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="m2-scope" style={{ width: '100%', margin: '0 auto', textAlign: 'left' }}>
      {/* Dev Persona Switcher Bar */}
      <PersonaSwitcher
        currentPersona={currentPersona}
        onPersonaChange={handlePersonaChange}
      />

      {/* Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: 700 }}>
            Booking, Custody & Notifications
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--m2-text-muted)', fontSize: '0.875rem' }}>
            Member 2 Independent Module • Verified against backend API contracts
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="m2-btn m2-btn-primary"
            onClick={() => setShowCreateModal(true)}
            id="btn-open-request-modal"
          >
            ➕ New Booking Request
          </button>
        </div>
      </div>

      {/* Main Grid: Bookings on Left (70%), Notifications on Right (30%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div style={{ gridColumn: 'span 2' }}>
          <BookingStatusPanel
            currentPersona={currentPersona}
            selectedBookingId={selectedBookingId}
            refreshTrigger={refreshTick}
            onSelectBooking={(b) => setSelectedBookingId(b.id)}
            onOpenCustody={(b) => setActiveCustodyBooking(b)}
          />
        </div>

        <div style={{ gridColumn: 'span 1' }}>
          <NotificationCenter
            currentPersona={currentPersona}
            refreshTrigger={refreshTick}
            onSelectBooking={(bookingId) => setSelectedBookingId(bookingId)}
          />
        </div>
      </div>

      {/* Custody Panel Modal */}
      {activeCustodyBooking && (
        <CustodyPanel
          key={activeCustodyBooking.id}
          booking={activeCustodyBooking}
          currentPersona={currentPersona}
          onClose={() => setActiveCustodyBooking(null)}
          onBookingUpdated={(updated) => {
            setActiveCustodyBooking(updated);
            setRefreshTick((t) => t + 1);
          }}
        />
      )}

      {/* Quick Booking Modal */}
      {showCreateModal && (
        <div
          className="m2-custody-modal-backdrop"
          onClick={() => setShowCreateModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="m2-custody-modal" onClick={(e) => e.stopPropagation()}>
            <div className="m2-card-header">
              <h2 className="m2-title">Request Resource Booking</h2>
              <button
                type="button"
                className="m2-btn m2-btn-secondary m2-btn-sm"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            {createMsg && (
              <div
                className={`m2-alert ${createMsg.type === 'error' ? 'm2-alert-error' : 'm2-alert-success'}`}
              >
                {createMsg.text}
              </div>
            )}

            <form onSubmit={handleCreateBooking}>
              <div className="m2-form-group">
                <label htmlFor="create-resource" className="m2-form-label">
                  Target Resource:
                </label>
                <select
                  id="create-resource"
                  className="m2-form-input"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                >
                  <option value="res_3d_prusa">3D Printer - Prusa MK4 (Digital Fab Lab)</option>
                  <option value="res_laser_epilog">Laser Cutter - Epilog Fusion Pro</option>
                  <option value="res_cnc_tormach">CNC Mill - Tormach 1100</option>
                  <option value="res_3d_bambu">3D Printer - Bambu Lab X1</option>
                  <option value="res_elec_bench">Electronics Lab Bench</option>
                </select>
              </div>

              <div className="m2-form-group">
                <label htmlFor="create-duration" className="m2-form-label">
                  Duration (Hours):
                </label>
                <input
                  id="create-duration"
                  type="number"
                  min="0.5"
                  max="12"
                  step="0.5"
                  className="m2-form-input"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  required
                />
              </div>

              <div className="m2-form-group">
                <label htmlFor="create-intent" className="m2-form-label">
                  Project Intent / Reason:
                </label>
                <textarea
                  id="create-intent"
                  rows={3}
                  className="m2-form-textarea"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  required
                  minLength={5}
                />
              </div>

              <button
                type="submit"
                className="m2-btn m2-btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                disabled={createLoading}
              >
                {createLoading ? 'Submitting Request...' : 'Submit Booking Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
