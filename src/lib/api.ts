/**
 * API Client for OpenResource
 * Handles HTTP requests to the backend with proper error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: Array<{ field?: string; message: string }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data.error || {};
      throw new ApiError(
        response.status,
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An error occurred',
        error.details
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or parsing error
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed'
    );
  }
}

// Types
export interface Persona {
  name: string;
  id: string;
  displayName: string;
  role: string;
  email: string;
  badges: string[];
}

export interface Resource {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  imageUrl?: string;
  requiredBadgeIds: string[];
  requiresSupervision: boolean;
  securityDeposit: number;
  weeklyUsageCap: number;
  currentCondition: string;
  availability: {
    status: string;
    schedule: Array<{
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }>;
  };
  owner: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EligibilityReason {
  type: string;
  message: string;
  badgeId?: string;
  badgeName?: string;
  currentUsage?: number;
  weeklyLimit?: number;
  resetsAt?: string;
}

export interface Eligibility {
  status: 'READY_TO_BOOK' | 'MISSING_PREREQUISITE' | 'QUOTA_EXCEEDED';
  canBook: boolean;
  reasons: EligibilityReason[];
  nextAvailableSlot?: string;
}

export interface DiscoveryResult {
  resource: Resource;
  eligibility: Eligibility;
  matchScore: number;
  matchReasons: string[];
}

export interface Alternative {
  resourceId: string;
  name: string;
  category: string;
  reason: string;
  availability: string;
}

// Development API
export const devApi = {
  async getPersonas(): Promise<{ personas: Persona[]; total: number }> {
    const response = await fetchApi<{
      success: boolean;
      data: { personas: Persona[]; total: number };
    }>('/api/dev/personas');
    return response.data;
  },

  async impersonate(personaName: string): Promise<{
    impersonatedUser: {
      id: string;
      name: string;
      email: string;
      role: string;
      badges: string[];
    };
    instructions: {
      headers: {
        'X-Test-User-Id': string;
        'X-Test-User-Role': string;
        'X-Test-User-Badges': string;
      };
    };
  }> {
    const response = await fetchApi<{
      success: boolean;
      data: {
        impersonatedUser: {
          id: string;
          name: string;
          email: string;
          role: string;
          badges: string[];
        };
        instructions: {
          headers: {
            'X-Test-User-Id': string;
            'X-Test-User-Role': string;
            'X-Test-User-Badges': string;
          };
        };
      };
    }>('/api/dev/impersonate', {
      method: 'POST',
      body: JSON.stringify({ personaName }),
    });
    return response.data;
  },

  async resetSeed(): Promise<{ operations: string[] }> {
    const response = await fetchApi<{
      success: boolean;
      data: { operations: string[] };
    }>('/api/dev/reset-seed', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
    return response.data;
  },
};

// Resource API
export const resourceApi = {
  async discover(params: {
    query?: string;
    filters?: {
      category?: string;
      location?: string;
      maxDeposit?: number;
      availableOn?: string;
    };
    headers?: Record<string, string>;
  }): Promise<{
    results: DiscoveryResult[];
    alternatives: Alternative[];
    totalResults: number;
  }> {
    const response = await fetchApi<{
      success: boolean;
      data: {
        results: DiscoveryResult[];
        alternatives: Alternative[];
        totalResults: number;
      };
    }>('/api/resources/discover', {
      method: 'POST',
      body: JSON.stringify({
        query: params.query,
        filters: params.filters,
      }),
      headers: params.headers,
    });
    return response.data;
  },

  async getResources(params: {
    category?: string;
    location?: string;
    search?: string;
    page?: number;
    limit?: number;
    headers?: Record<string, string>;
  }): Promise<{
    resources: Resource[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.category) queryParams.append('category', params.category);
    if (params.location) queryParams.append('location', params.location);
    if (params.search) queryParams.append('search', params.search);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await fetchApi<{
      success: boolean;
      data: {
        resources: Resource[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      };
    }>(`/api/resources?${queryParams.toString()}`, {
      headers: params.headers,
    });
    return response.data;
  },
};

// Health check
export const healthApi = {
  async check(): Promise<{ status: string; version: string }> {
    const response = await fetchApi<{
      status: string;
      version: string;
    }>('/health');
    return response;
  },
};
