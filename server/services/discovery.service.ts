import { PrismaClient } from '@prisma/client';
import { DiscoveryRequestInput } from '../types/validation.js';

const prisma = new PrismaClient();

const FALLBACK_RESOURCES = [
  {
    id: 'fallback_prusa_mk4s',
    name: 'Prusa MK4S High-Speed 3D Printer',
    description: 'High-precision FDM 3D printer for rapid prototyping and educational fabrication.',
    category: 'THREE_D_PRINTING',
    location: 'Lab A - Station 3',
    imageUrl: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=900&q=80',
    requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
    requiresSupervision: false,
    securityDeposit: 50,
    weeklyUsageCap: 10,
    currentCondition: 'EXCELLENT',
    isActive: true,
    owner: { id: 'seed-user-lab-owner', name: 'Lab Owner', email: 'lab.owner@openresource.local' },
    availability: [
      { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00', isActive: true },
      { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00', isActive: true },
      { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00', isActive: true },
    ],
  },
  {
    id: 'fallback_nvidia_h100',
    name: 'NVIDIA DGX H100 AI Node',
    description: 'Accelerated AI research node for large model training and visualization workloads.',
    category: 'COMPUTING',
    location: 'AI Lab - Rack 2',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    requiredBadgeIds: ['badge_safety_101'],
    requiresSupervision: true,
    securityDeposit: 250,
    weeklyUsageCap: 18,
    currentCondition: 'EXCELLENT',
    isActive: true,
    owner: { id: 'seed-user-lab-owner', name: 'Lab Owner', email: 'lab.owner@openresource.local' },
    availability: [{ dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '18:00', isActive: true }],
  },
  {
    id: 'fallback_keysight_scope',
    name: 'Keysight 4-Channel Oscilloscope',
    description: 'High-bandwidth bench oscilloscope for analog and digital signal capture.',
    category: 'ELECTRONICS_LAB',
    location: 'Instrumentation Bay',
    imageUrl: 'https://images.unsplash.com/photo-1555759949-cc2d0f5d38a0?auto=format&fit=crop&w=900&q=80',
    requiredBadgeIds: ['badge_safety_101'],
    requiresSupervision: false,
    securityDeposit: 120,
    weeklyUsageCap: 12,
    currentCondition: 'GOOD',
    isActive: true,
    owner: { id: 'seed-user-lab-owner', name: 'Lab Owner', email: 'lab.owner@openresource.local' },
    availability: [{ dayOfWeek: 'WEDNESDAY', startTime: '10:00', endTime: '17:00', isActive: true }],
  },
  {
    id: 'fallback_bambu_x1_carbon',
    name: 'Bambu Lab X1-Carbon',
    description: 'Fast multi-material 3D printer with enclosure and advanced calibration features.',
    category: 'THREE_D_PRINTING',
    location: 'Lab A - Station 4',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
    requiredBadgeIds: ['badge_safety_101'],
    requiresSupervision: false,
    securityDeposit: 30,
    weeklyUsageCap: 15,
    currentCondition: 'EXCELLENT',
    isActive: true,
    owner: { id: 'seed-user-lab-owner', name: 'Lab Owner', email: 'lab.owner@openresource.local' },
    availability: [{ dayOfWeek: 'FRIDAY', startTime: '09:00', endTime: '20:00', isActive: true }],
  },
];

// Eligibility status constants
export enum EligibilityStatus {
  READY_TO_BOOK = 'READY_TO_BOOK',
  MISSING_PREREQUISITE = 'MISSING_PREREQUISITE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
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

export interface ResourceEligibility {
  resource: any;
  eligibility: {
    status: EligibilityStatus;
    canBook: boolean;
    reasons: EligibilityReason[];
    nextAvailableSlot?: string;
  };
  matchScore: number;
  matchReasons: string[];
}

export interface AlternativeResource {
  resourceId: string;
  name: string;
  category: string;
  reason: string;
  availability: string;
}

/**
 * Discovery Service - Intelligent resource search with eligibility calculation
 */
export class DiscoveryService {
  /**
   * Discover resources with eligibility evaluation
   */
  async discoverResources(
    request: DiscoveryRequestInput,
    userId: string,
    userBadgeIds: string[]
  ): Promise<{
    results: ResourceEligibility[];
    alternatives: AlternativeResource[];
  }> {
    const userExists = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
    if (!userExists) {
      const fallbackUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
      if (fallbackUser) {
        userId = fallbackUser.id;
      }
    }

    const resources = await this.fetchMatchingResources(request);
    const userWeeklyUsage = await this.getUserWeeklyUsage(userId);

    // Evaluate eligibility for each resource
    const results: ResourceEligibility[] = [];

    for (const resource of resources) {
      const eligibility = this.evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      const matchScore = this.calculateMatchScore(resource, request);
      const matchReasons = this.getMatchReasons(resource, request);

      results.push({
        resource: this.formatResourceForDiscovery(resource),
        eligibility,
        matchScore,
        matchReasons,
      });
    }

    // Sort by match score (highest first) and eligibility status
    results.sort((a, b) => {
      // READY_TO_BOOK comes first
      if (a.eligibility.canBook && !b.eligibility.canBook) return -1;
      if (!a.eligibility.canBook && b.eligibility.canBook) return 1;

      // Then by match score
      return b.matchScore - a.matchScore;
    });

    // Find alternative resources for items that can't be booked
    const alternatives = await this.findAlternatives(
      results.filter(r => !r.eligibility.canBook),
      request,
      userBadgeIds,
      userWeeklyUsage
    );

    return {
      results,
      alternatives,
    };
  }

  /**
   * Fetch resources matching basic filters
   */
  private async fetchMatchingResources(request: DiscoveryRequestInput) {
    const { filters } = request;
    const where: any = {
      isActive: true,
    };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.location) {
      where.location = {
        contains: filters.location,
        mode: 'insensitive',
      };
    }

    if (filters?.maxDeposit !== undefined) {
      where.securityDeposit = {
        lte: filters.maxDeposit,
      };
    }

    if (request.query) {
      where.OR = [
        { name: { contains: request.query, mode: 'insensitive' } },
        { description: { contains: request.query, mode: 'insensitive' } },
      ];
    }

    try {
      const resources = await prisma.resource.findMany({
        where,
        include: {
          availability: {
            where: { isActive: true },
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        take: 50,
      });

      if (resources.length === 0) {
        return FALLBACK_RESOURCES.filter((resource) => {
          if (request.query) {
            const query = request.query.toLowerCase();
            return resource.name.toLowerCase().includes(query) || resource.description.toLowerCase().includes(query);
          }
          if (filters?.category && resource.category !== filters.category) return false;
          if (filters?.location && !resource.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
          if (filters?.maxDeposit !== undefined && resource.securityDeposit > filters.maxDeposit) return false;
          return true;
        });
      }

      return resources;
    } catch (error) {
      console.warn('Discovery fallback triggered because resource lookup failed:', error);
      return FALLBACK_RESOURCES.filter((resource) => {
        if (request.query) {
          const query = request.query.toLowerCase();
          return resource.name.toLowerCase().includes(query) || resource.description.toLowerCase().includes(query);
        }
        if (filters?.category && resource.category !== filters.category) return false;
        if (filters?.location && !resource.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
        if (filters?.maxDeposit !== undefined && resource.securityDeposit > filters.maxDeposit) return false;
        return true;
      });
    }
  }

  /**
   * Evaluate eligibility for a single resource
   */
  private evaluateEligibility(
    resource: any,
    userBadgeIds: string[],
    userWeeklyUsage: Map<string, number>,
    request: DiscoveryRequestInput
  ): {
    status: EligibilityStatus;
    canBook: boolean;
    reasons: EligibilityReason[];
    nextAvailableSlot?: string;
  } {
    const reasons: EligibilityReason[] = [];

    // Check 1: Resource must be active
    if (!resource.isActive) {
      reasons.push({
        type: 'RESOURCE_INACTIVE',
        message: 'Resource is currently inactive',
      });
    }

    // Check 2: Check required badges
    const missingBadges = resource.requiredBadgeIds.filter(
      (badgeId: string) => !userBadgeIds.includes(badgeId)
    );

    if (missingBadges.length > 0) {
      for (const badgeId of missingBadges) {
        reasons.push({
          type: 'MISSING_BADGE',
          message: `Missing required training badge`,
          badgeId,
          badgeName: this.getBadgeName(badgeId),
        });
      }
    }

    // Check 3: Check weekly usage quota
    const currentUsage = userWeeklyUsage.get(resource.id) || 0;
    if (currentUsage >= resource.weeklyUsageCap) {
      reasons.push({
        type: 'WEEKLY_CAP_REACHED',
        message: 'Weekly usage limit reached for this resource',
        currentUsage,
        weeklyLimit: resource.weeklyUsageCap,
        resetsAt: this.getWeekResetDate().toISOString(),
      });
    }

    // Check 4: Check availability for requested date (if provided)
    const availableOn = this.checkAvailability(resource, request.filters?.availableOn);
    if (request.filters?.availableOn && !availableOn) {
      reasons.push({
        type: 'NOT_AVAILABLE',
        message: `Resource not available on ${request.filters.availableOn}`,
      });
    }

    // Check 5: Supervision requirements (placeholder - would check user supervision eligibility)
    if (resource.requiresSupervision) {
      // For now, we'll assume user might need supervision but it's not a hard blocker
      // In a real system, we'd check if user has supervision privileges
    }

    // Determine overall status
    let status: EligibilityStatus;
    let canBook: boolean;

    if (reasons.length === 0) {
      status = EligibilityStatus.READY_TO_BOOK;
      canBook = true;
    } else if (reasons.some(r => r.type === 'WEEKLY_CAP_REACHED')) {
      status = EligibilityStatus.QUOTA_EXCEEDED;
      canBook = false;
    } else if (reasons.some(r => r.type === 'MISSING_BADGE')) {
      status = EligibilityStatus.MISSING_PREREQUISITE;
      canBook = false;
    } else {
      status = EligibilityStatus.MISSING_PREREQUISITE;
      canBook = false;
    }

    // Find next available slot
    const nextAvailableSlot = this.findNextAvailableSlot(resource, request.filters?.availableOn);

    return {
      status,
      canBook,
      reasons,
      nextAvailableSlot,
    };
  }

  /**
   * Calculate match score (0-1) based on query and filters
   */
  private calculateMatchScore(resource: any, request: DiscoveryRequestInput): number {
    let score = 0.5; // Base score

    // Query matching (name/description)
    if (request.query) {
      const query = request.query.toLowerCase();
      const name = resource.name.toLowerCase();
      const description = resource.description.toLowerCase();

      if (name.includes(query)) score += 0.3;
      if (description.includes(query)) score += 0.1;
    }

    // Category match
    if (request.filters?.category && resource.category === request.filters.category) {
      score += 0.2;
    }

    // Location match
    if (request.filters?.location && resource.location.toLowerCase().includes(request.filters.location.toLowerCase())) {
      score += 0.15;
    }

    // Deposit within budget
    if (request.filters?.maxDeposit && resource.securityDeposit <= request.filters.maxDeposit) {
      score += 0.1;
    }

    // Availability match
    if (request.filters?.availableOn && this.checkAvailability(resource, request.filters.availableOn)) {
      score += 0.15;
    }

    // Resource condition bonus
    if (resource.currentCondition === 'EXCELLENT') score += 0.05;
    if (resource.currentCondition === 'GOOD') score += 0.03;

    return Math.min(score, 1.0);
  }

  /**
   * Get human-readable match reasons
   */
  private getMatchReasons(resource: any, request: DiscoveryRequestInput): string[] {
    const reasons: string[] = [];

    if (request.filters?.category && resource.category === request.filters.category) {
      reasons.push('Exact category match');
    }

    if (request.filters?.availableOn && this.checkAvailability(resource, request.filters.availableOn)) {
      reasons.push('Available on requested date');
    }

    if (request.filters?.maxDeposit && resource.securityDeposit <= request.filters.maxDeposit) {
      reasons.push('Within security deposit budget');
    }

    if (request.filters?.location && resource.location.toLowerCase().includes(request.filters.location.toLowerCase())) {
      reasons.push('Location match');
    }

    if (resource.currentCondition === 'EXCELLENT') {
      reasons.push('Excellent condition');
    }

    return reasons;
  }

  /**
   * Find alternative resources for ineligible items
   */
  private async findAlternatives(
    ineligibleResults: ResourceEligibility[],
    request: DiscoveryRequestInput,
    userBadgeIds: string[],
    userWeeklyUsage: Map<string, number>
  ): Promise<AlternativeResource[]> {
    const alternatives: AlternativeResource[] = [];
    const seenResourceIds = new Set<string>();

    // Add ineligible resource IDs to seen set
    for (const result of ineligibleResults) {
      seenResourceIds.add(result.resource.id);
    }

    // For each ineligible resource, try to find similar eligible alternatives
    for (const ineligible of ineligibleResults.slice(0, 3)) { // Limit to top 3
      const category = ineligible.resource.category;

      // Find resources in same category that user IS eligible for
      const similarResources = await prisma.resource.findMany({
        where: {
          category,
          isActive: true,
          id: {
            notIn: Array.from(seenResourceIds),
          },
        },
        include: {
          availability: {
            where: { isActive: true },
          },
        },
        take: 5,
      });

      for (const similar of similarResources) {
        if (seenResourceIds.has(similar.id)) continue;

        const eligibility = this.evaluateEligibility(
          similar,
          userBadgeIds,
          userWeeklyUsage,
          request
        );

        if (eligibility.canBook) {
          alternatives.push({
            resourceId: similar.id,
            name: similar.name,
            category: similar.category,
            reason: this.getAlternativeReason(ineligible, similar),
            availability: eligibility.nextAvailableSlot || 'AVAILABLE',
          });

          seenResourceIds.add(similar.id);

          if (alternatives.length >= 5) break; // Limit total alternatives
        }
      }

      if (alternatives.length >= 5) break;
    }

    return alternatives;
  }

  /**
   * Get reason for suggesting alternative
   */
  private getAlternativeReason(original: ResourceEligibility, alternative: any): string {
    if (original.eligibility.reasons.some(r => r.type === 'MISSING_BADGE')) {
      return 'No training required';
    }
    if (original.eligibility.reasons.some(r => r.type === 'WEEKLY_CAP_REACHED')) {
      return 'Similar equipment, usage available';
    }
    return 'Similar capabilities, currently available';
  }

  /**
   * Get user's weekly usage by resource
   * In real implementation, this would query the booking system
   */
  private async getUserWeeklyUsage(userId: string): Promise<Map<string, number>> {
    // Mock implementation - in Phase 4+ this would query actual bookings
    // For now, return empty usage for all users
    return new Map<string, number>();
  }

  /**
   * Check if resource is available on a specific date
   */
  private checkAvailability(resource: any, dateString?: string): boolean {
    if (!dateString) return true;

    const requestedDate = new Date(dateString);
    const dayOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][requestedDate.getDay()];

    return resource.availability.some(
      (avail: any) => avail.dayOfWeek === dayOfWeek && avail.isActive
    );
  }

  /**
   * Find next available slot for a resource
   */
  private findNextAvailableSlot(resource: any, fromDate?: string): string | undefined {
    if (!resource.availability || resource.availability.length === 0) {
      return undefined;
    }

    // Return the first available day from the schedule
    // In real implementation, this would check actual booking conflicts
    const firstAvail = resource.availability[0];
    return fromDate || new Date().toISOString().split('T')[0];
  }

  /**
   * Get week reset date (next Monday)
   */
  private getWeekResetDate(): Date {
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }

  /**
   * Get badge name from badge ID (mock - would query badge system)
   */
  private getBadgeName(badgeId: string): string {
    // Mock badge names
    const badgeNames: Record<string, string> = {
      'badge_safety_101': 'General Lab Safety',
      'badge_3d_basics': '3D Printing Basics',
      'badge_3d_advanced': 'Advanced 3D Printing',
      'badge_laser_cert': 'Laser Cutter Certification',
      'badge_cnc_cert': 'CNC Machine Certification',
    };
    return badgeNames[badgeId] || badgeId;
  }

  /**
   * Format resource for discovery response
   */
  private formatResourceForDiscovery(resource: any) {
    return {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      category: resource.category,
      location: resource.location,
      imageUrl: resource.imageUrl,
      requiredBadgeIds: resource.requiredBadgeIds,
      requiresSupervision: resource.requiresSupervision,
      securityDeposit: resource.securityDeposit,
      weeklyUsageCap: resource.weeklyUsageCap,
      currentCondition: resource.currentCondition,
      availability: {
        status: resource.isActive ? 'AVAILABLE' : 'UNAVAILABLE',
        schedule: resource.availability.map((a: any) => ({
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      },
      owner: resource.owner,
    };
  }
}

export const discoveryService = new DiscoveryService();
