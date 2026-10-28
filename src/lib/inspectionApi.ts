/**
 * Inspection API Client
 * Integration point with Member 4's inspection system
 *
 * NOTE: Real inspection API not yet available.
 * Using demo fixture data until Member 4's endpoints are ready.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE';
}

export interface InspectionImage {
  url: string;
  width: number;
  height: number;
  boundingBoxes: BoundingBox[];
}

export interface DamageItem {
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE';
  repairCost: number;
}

export interface Inspection {
  id: string;
  resourceId: string;
  inspectorId: string;
  inspectorName: string;
  beforeImage: InspectionImage;
  afterImage: InspectionImage;
  damageReport: DamageItem[];
  overallCondition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  timestamp: string;
}

export interface InspectionListItem {
  id: string;
  resourceId: string;
  resourceName: string;
  timestamp: string;
  overallCondition: string;
  damageCount: number;
}

/**
 * Inspection API adapter
 * TODO: Replace with real API calls when Member 4's endpoints are available
 * Expected endpoint: GET /api/inspections/:id
 */
export const inspectionApi = {
  /**
   * Get full inspection details including before/after images and bounding boxes
   * @param inspectionId - Inspection ID
   * @returns Full inspection data
   *
   * INTEGRATION CONTRACT WITH MEMBER 4:
   * - Endpoint: GET /api/inspections/:id
   * - Response format: { inspection: Inspection }
   * - Image URLs should be absolute or relative to API base
   * - Bounding box coordinates in pixels relative to original image
   */
  async getInspection(inspectionId: string): Promise<Inspection> {
    // TODO: Replace with real API call
    // const response = await fetchApi<{ inspection: Inspection }>(`/api/inspections/${inspectionId}`);
    // return response.inspection;

    // Demo fixture data
    return getDemoInspection(inspectionId);
  },

  /**
   * Get list of inspections for a resource
   * @param resourceId - Resource ID
   * @returns List of inspection summaries
   *
   * INTEGRATION CONTRACT WITH MEMBER 4:
   * - Endpoint: GET /api/resources/:id/inspections
   * - Response format: { inspections: InspectionListItem[] }
   */
  async getResourceInspections(resourceId: string): Promise<InspectionListItem[]> {
    // TODO: Replace with real API call
    // const response = await fetchApi<{ inspections: InspectionListItem[] }>(`/api/resources/${resourceId}/inspections`);
    // return response.inspections;

    // Demo fixture data
    return getDemoInspectionList(resourceId);
  },
};

/**
 * Demo fixture data
 * Explicitly marked as DEMO DATA - not real inspection results
 */
function getDemoInspection(inspectionId: string): Inspection {
  // Using placeholder images with proper aspect ratios
  const demoInspections: Record<string, Inspection> = {
    'demo_insp_001': {
      id: 'demo_insp_001',
      resourceId: 'demo_resource_001',
      inspectorId: 'demo_qualified_student',
      inspectorName: 'Alice Chen',
      beforeImage: {
        url: 'https://via.placeholder.com/800x600/e2e8f0/334155?text=Before+Image+Demo',
        width: 800,
        height: 600,
        boundingBoxes: [
          {
            x: 120,
            y: 150,
            width: 180,
            height: 120,
            label: 'Scratch on build plate',
            severity: 'MINOR',
          },
          {
            x: 450,
            y: 300,
            width: 120,
            height: 90,
            label: 'Worn nozzle',
            severity: 'MODERATE',
          },
        ],
      },
      afterImage: {
        url: 'https://via.placeholder.com/800x600/dcfce7/15803d?text=After+Image+Demo',
        width: 800,
        height: 600,
        boundingBoxes: [
          {
            x: 450,
            y: 300,
            width: 120,
            height: 90,
            label: 'Nozzle replaced',
            severity: 'MINOR',
          },
        ],
      },
      damageReport: [
        {
          description: 'Minor scratch on build plate - cosmetic only',
          severity: 'MINOR',
          repairCost: 0,
        },
        {
          description: 'Worn nozzle replaced',
          severity: 'MODERATE',
          repairCost: 25.00,
        },
      ],
      overallCondition: 'GOOD',
      timestamp: '2026-10-27T14:30:00Z',
    },
  };

  return demoInspections[inspectionId] || {
    id: inspectionId,
    resourceId: 'unknown',
    inspectorId: 'demo_user',
    inspectorName: 'Demo Inspector',
    beforeImage: {
      url: 'https://via.placeholder.com/800x600/e2e8f0/334155?text=No+Before+Image',
      width: 800,
      height: 600,
      boundingBoxes: [],
    },
    afterImage: {
      url: 'https://via.placeholder.com/800x600/dcfce7/15803d?text=No+After+Image',
      width: 800,
      height: 600,
      boundingBoxes: [],
    },
    damageReport: [],
    overallCondition: 'GOOD',
    timestamp: new Date().toISOString(),
  };
}

function getDemoInspectionList(resourceId: string): InspectionListItem[] {
  return [
    {
      id: 'demo_insp_001',
      resourceId,
      resourceName: '3D Printer - Prusa MK4',
      timestamp: '2026-10-27T14:30:00Z',
      overallCondition: 'GOOD',
      damageCount: 2,
    },
  ];
}
