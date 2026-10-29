const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface FairnessCandidate {
  userId: string;
  userName: string;
  department: string;
  role: string;
  projectUrgency: 'ACADEMIC_DEADLINE' | 'RESEARCH_GRANT' | 'PERSONAL_EXPLORATION';
  rolling14DayHoursUsed: number;
  resourceWeeklyMaxHours: number;
  pastWaitlistDenials: number;
  trustScore: number;
  hasRequiredBadges: boolean;
  requestedSlot: string;
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || 'Fairness request failed';
    throw new Error(message);
  }

  return payload.data ?? payload;
}

export const fairnessApi = {
  async rank(candidates: FairnessCandidate[]) {
    return fetchJson<{ rankings: unknown[] }>('/api/fairness/rank', {
      method: 'POST',
      body: JSON.stringify({ candidates }),
    });
  },

  async simulateClash(resourceName: string, slot: string) {
    return fetchJson<{ rankings: unknown[]; resourceName: string; contestedSlot: string }>(
      '/api/fairness/simulate-clash',
      {
        method: 'POST',
        body: JSON.stringify({ resourceName, slot }),
      }
    );
  },

  async resolve(params: { userId: string; decision: string; auditReason?: string }) {
    return fetchJson<{ resolution: { id: string; status: string; decision: string; receipt: string } }>(
      '/api/fairness/resolve',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },
};
