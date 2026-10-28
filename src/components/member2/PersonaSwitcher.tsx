import React from 'react';
import type { UserPersona } from '../../types/member2.ts';
import { PRECONFIGURED_PERSONAS } from '../../services/member2Api.ts';

interface PersonaSwitcherProps {
  currentPersona: UserPersona;
  onPersonaChange: (persona: UserPersona) => void;
}

export const PersonaSwitcher: React.FC<PersonaSwitcherProps> = ({
  currentPersona,
  onPersonaChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    const persona = PRECONFIGURED_PERSONAS[selectedKey];
    if (persona) {
      onPersonaChange(persona);
    }
  };

  const initials = currentPersona.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2);

  return (
    <div className="m2-scope">
      <div className="m2-persona-bar">
        <div className="m2-persona-info">
          <div className="m2-persona-avatar" aria-hidden="true">
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {currentPersona.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--m2-text-muted)' }}>
              {currentPersona.title} • Role: <strong>{currentPersona.role}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="persona-select" style={{ fontSize: '0.8125rem', color: 'var(--m2-text-muted)' }}>
            Switch Persona (Dev/Eval):
          </label>
          <select
            id="persona-select"
            className="m2-persona-select"
            value={currentPersona.id}
            onChange={handleChange}
            aria-label="Select active user persona for RBAC evaluation"
          >
            {Object.entries(PRECONFIGURED_PERSONAS).map(([key, p]) => (
              <option key={key} value={p.id}>
                {p.name} ({p.role}) — {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
