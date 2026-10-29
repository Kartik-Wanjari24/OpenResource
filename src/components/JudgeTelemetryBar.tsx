import { useState, useEffect } from 'react';
import { devApi, ApiError, type Persona } from '../lib/api';
import styles from './JudgeTelemetryBar.module.css';

interface JudgeTelemetryBarProps {
  currentPersona: Persona | null;
  onPersonaChange: (persona: Persona, headers: Record<string, string>) => void;
  challengeProgress: number;
  maxSteps?: number;
}

export function JudgeTelemetryBar({
  currentPersona,
  onPersonaChange,
  challengeProgress,
  maxSteps = 10,
}: JudgeTelemetryBarProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devEnabled, setDevEnabled] = useState(false);

  const buildHeaders = (persona: Persona) => ({
    'X-Test-User-Id': persona.id,
    'X-Test-User-Role': persona.role,
    'X-Test-User-Badges': persona.badges.join(','),
    'X-User-Id': persona.id,
    'X-User-Role': persona.role,
    'X-User-Badges': persona.badges.join(','),
  });

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    setIsLoadingPersonas(true);
    setError(null);
    try {
      const data = await devApi.getPersonas();
      setPersonas(data.personas);
      setDevEnabled(true);

      if (!currentPersona && data.personas.length > 0) {
        const defaultPersona = data.personas[0];
        onPersonaChange(defaultPersona, buildHeaders(defaultPersona));
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        setDevEnabled(false);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load personas');
      }
    } finally {
      setIsLoadingPersonas(false);
    }
  };

  const handleImpersonate = async (personaName: string) => {
    setIsImpersonating(true);
    setError(null);
    try {
      const data = await devApi.impersonate(personaName);
      const headers = {
        'X-Test-User-Id': data.instructions.headers['X-Test-User-Id'],
        'X-Test-User-Role': data.instructions.headers['X-Test-User-Role'],
        'X-Test-User-Badges': data.instructions.headers['X-Test-User-Badges'],
        'X-User-Id': data.instructions.headers['X-Test-User-Id'],
        'X-User-Role': data.instructions.headers['X-Test-User-Role'],
        'X-User-Badges': data.instructions.headers['X-Test-User-Badges'],
      };
      const persona = personas.find((p) => p.name === personaName);
      if (persona) {
        onPersonaChange(persona, headers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to impersonate');
    } finally {
      setIsImpersonating(false);
    }
  };

  const handleResetSeed = async () => {
    setIsResetting(true);
    setError(null);
    try {
      await devApi.resetSeed();
      setShowResetConfirm(false);
      // Reload personas after reset
      await loadPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset seed');
    } finally {
      setIsResetting(false);
    }
  };

  // Don't render if dev endpoints are not available
  if (!devEnabled && !isLoadingPersonas) {
    return null;
  }

  const progressPercentage = (challengeProgress / maxSteps) * 100;

  return (
    <div className={styles.container} role="banner" aria-label="Judge Telemetry Bar">
      <div className={styles.content}>
        {/* Current Persona */}
        <div className={styles.section}>
          <span className={styles.label}>Persona:</span>
          {currentPersona ? (
            <div className={styles.persona}>
              <span className={styles.personaName}>{currentPersona.displayName}</span>
              <span className={styles.personaRole}>{currentPersona.role}</span>
            </div>
          ) : (
            <span className={styles.placeholder}>No persona selected</span>
          )}
        </div>

        {/* Persona Switcher */}
        <div className={styles.section}>
          <label htmlFor="persona-select" className={styles.label}>
            Switch to:
          </label>
          <select
            id="persona-select"
            className={styles.select}
            value=""
            onChange={(e) => handleImpersonate(e.target.value)}
            disabled={isImpersonating || isLoadingPersonas}
            aria-label="Select persona to impersonate"
          >
            <option value="" disabled>
              {isLoadingPersonas ? 'Loading...' : 'Select persona'}
            </option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.name}>
                {persona.name} ({persona.role})
              </option>
            ))}
          </select>
        </div>

        {/* Challenge Progress */}
        <div className={styles.section}>
          <span className={styles.label}>Challenge Progress:</span>
          <div className={styles.progressContainer}>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-valuenow={challengeProgress}
              aria-valuemin={0}
              aria-valuemax={maxSteps}
              aria-label={`Challenge progress: ${challengeProgress} of ${maxSteps} steps`}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {challengeProgress}/{maxSteps}
            </span>
          </div>
        </div>

        {/* Reset Button */}
        <div className={styles.section}>
          {!showResetConfirm ? (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => setShowResetConfirm(true)}
              disabled={isResetting}
              aria-label="Reset demo database"
            >
              Reset Demo
            </button>
          ) : (
            <div className={styles.confirmGroup}>
              <span className={styles.confirmText}>Confirm reset?</span>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={handleResetSeed}
                disabled={isResetting}
                aria-label="Confirm reset"
              >
                {isResetting ? 'Resetting...' : 'Yes'}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                aria-label="Cancel reset"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
