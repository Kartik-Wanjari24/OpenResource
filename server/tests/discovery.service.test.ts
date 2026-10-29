import { describe, it, expect } from 'vitest';
import { DiscoveryService, EligibilityStatus } from '../services/discovery.service';

describe('Discovery Service - Eligibility Logic', () => {
  const discoveryService = new DiscoveryService();

  describe('evaluateEligibility', () => {
    it('should return READY_TO_BOOK when user has all required badges and quota available', () => {
      const resource = {
        id: 'res_123',
        name: '3D Printer',
        isActive: true,
        requiredBadgeIds: ['badge_safety_101'],
        weeklyUsageCap: 10,
        requiresSupervision: false,
        availability: [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00', isActive: true }
        ],
      };

      const userBadgeIds = ['badge_safety_101', 'badge_3d_basics'];
      const userWeeklyUsage = new Map<string, number>();
      const request = { query: '3D printer' };

      // Access private method via type assertion for testing
      const eligibility = (discoveryService as any).evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      expect(eligibility.status).toBe(EligibilityStatus.READY_TO_BOOK);
      expect(eligibility.canBook).toBe(true);
      expect(eligibility.reasons).toHaveLength(0);
    });

    it('should return MISSING_PREREQUISITE when user lacks required badges', () => {
      const resource = {
        id: 'res_123',
        name: 'Laser Cutter',
        isActive: true,
        requiredBadgeIds: ['badge_safety_101', 'badge_laser_cert'],
        weeklyUsageCap: 10,
        requiresSupervision: true,
        availability: [],
      };

      const userBadgeIds = ['badge_safety_101']; // Missing laser cert
      const userWeeklyUsage = new Map<string, number>();
      const request = { query: 'laser' };

      const eligibility = (discoveryService as any).evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      expect(eligibility.status).toBe(EligibilityStatus.MISSING_PREREQUISITE);
      expect(eligibility.canBook).toBe(false);
      expect(eligibility.reasons.length).toBeGreaterThan(0);
      expect(eligibility.reasons[0].type).toBe('MISSING_BADGE');
      expect(eligibility.reasons[0].badgeId).toBe('badge_laser_cert');
    });

    it('should return QUOTA_EXCEEDED when user has reached weekly limit', () => {
      const resource = {
        id: 'res_123',
        name: 'CNC Mill',
        isActive: true,
        requiredBadgeIds: [],
        weeklyUsageCap: 5,
        requiresSupervision: false,
        availability: [],
      };

      const userBadgeIds: string[] = [];
      const userWeeklyUsage = new Map<string, number>([['res_123', 5]]);
      const request = { query: 'cnc' };

      const eligibility = (discoveryService as any).evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      expect(eligibility.status).toBe(EligibilityStatus.QUOTA_EXCEEDED);
      expect(eligibility.canBook).toBe(false);
      expect(eligibility.reasons.some(r => r.type === 'WEEKLY_CAP_REACHED')).toBe(true);
    });

    it('should handle multiple missing badges', () => {
      const resource = {
        id: 'res_123',
        name: 'Advanced Equipment',
        isActive: true,
        requiredBadgeIds: ['badge_safety_101', 'badge_laser_cert', 'badge_cnc_cert'],
        weeklyUsageCap: 10,
        requiresSupervision: false,
        availability: [],
      };

      const userBadgeIds: string[] = []; // No badges
      const userWeeklyUsage = new Map<string, number>();
      const request = { query: 'equipment' };

      const eligibility = (discoveryService as any).evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      expect(eligibility.status).toBe(EligibilityStatus.MISSING_PREREQUISITE);
      expect(eligibility.canBook).toBe(false);
      expect(eligibility.reasons.filter(r => r.type === 'MISSING_BADGE')).toHaveLength(3);
    });

    it('should mark inactive resources as ineligible', () => {
      const resource = {
        id: 'res_123',
        name: 'Broken Printer',
        isActive: false,
        requiredBadgeIds: [],
        weeklyUsageCap: 10,
        requiresSupervision: false,
        availability: [],
      };

      const userBadgeIds: string[] = [];
      const userWeeklyUsage = new Map<string, number>();
      const request = { query: 'printer' };

      const eligibility = (discoveryService as any).evaluateEligibility(
        resource,
        userBadgeIds,
        userWeeklyUsage,
        request
      );

      expect(eligibility.canBook).toBe(false);
      expect(eligibility.reasons.some(r => r.type === 'RESOURCE_INACTIVE')).toBe(true);
    });
  });

  describe('calculateMatchScore', () => {
    it('should give higher score for exact category match', () => {
      const resource = {
        name: '3D Printer Prusa',
        description: 'High precision printer',
        category: '3D_PRINTING',
        location: 'Lab A',
        securityDeposit: 50,
        currentCondition: 'EXCELLENT',
        availability: [],
      };

      const requestWithCategory = {
        query: '3d printer',
        filters: { category: '3D_PRINTING' as const },
      };

      const requestWithoutCategory = {
        query: '3d printer',
        filters: {},
      };

      const scoreWith = (discoveryService as any).calculateMatchScore(resource, requestWithCategory);
      const scoreWithout = (discoveryService as any).calculateMatchScore(resource, requestWithoutCategory);

      expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('should give bonus for excellent condition', () => {
      const excellentResource = {
        name: 'Printer A',
        description: 'Test',
        category: '3D_PRINTING',
        location: 'Lab A',
        securityDeposit: 50,
        currentCondition: 'EXCELLENT',
        availability: [],
      };

      const goodResource = {
        ...excellentResource,
        currentCondition: 'GOOD',
      };

      const request = { query: 'printer' };

      const excellentScore = (discoveryService as any).calculateMatchScore(excellentResource, request);
      const goodScore = (discoveryService as any).calculateMatchScore(goodResource, request);

      expect(excellentScore).toBeGreaterThan(goodScore);
    });

    it('should consider deposit budget', () => {
      const resource = {
        name: 'Equipment',
        description: 'Test',
        category: 'CNC_MACHINING',
        location: 'Lab A',
        securityDeposit: 30,
        currentCondition: 'GOOD',
        availability: [],
      };

      const requestWithinBudget = {
        query: 'equipment',
        filters: { maxDeposit: 50 },
      };

      const requestOverBudget = {
        query: 'equipment',
        filters: { maxDeposit: 20 },
      };

      const scoreWithin = (discoveryService as any).calculateMatchScore(resource, requestWithinBudget);
      const scoreOver = (discoveryService as any).calculateMatchScore(resource, requestOverBudget);

      expect(scoreWithin).toBeGreaterThan(scoreOver);
    });
  });

  describe('checkAvailability', () => {
    it('should return true when resource is available on requested day', () => {
      const resource = {
        availability: [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00', isActive: true },
          { dayOfWeek: 'WEDNESDAY', startTime: '09:00', endTime: '17:00', isActive: true },
        ],
      };

      // Monday = day 1
      const mondayDate = '2026-10-26'; // This is a Monday

      const isAvailable = (discoveryService as any).checkAvailability(resource, mondayDate);

      expect(isAvailable).toBe(true);
    });

    it('should return false when resource is not available on requested day', () => {
      const resource = {
        availability: [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00', isActive: true },
        ],
      };

      const tuesdayDate = '2026-10-27'; // Tuesday

      const isAvailable = (discoveryService as any).checkAvailability(resource, tuesdayDate);

      expect(isAvailable).toBe(false);
    });

    it('should return true when no date is specified', () => {
      const resource = {
        availability: [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00', isActive: true },
        ],
      };

      const isAvailable = (discoveryService as any).checkAvailability(resource, undefined);

      expect(isAvailable).toBe(true);
    });
  });

  describe('getAlternativeReason', () => {
    it('should suggest alternatives based on missing badge issue', () => {
      const original = {
        resource: { name: 'Advanced Equipment' },
        eligibility: {
          status: EligibilityStatus.MISSING_PREREQUISITE,
          canBook: false,
          reasons: [{ type: 'MISSING_BADGE', message: 'Missing badge' }],
        },
      };

      const alternative = { name: 'Basic Equipment' };

      const reason = (discoveryService as any).getAlternativeReason(original, alternative);

      expect(reason).toContain('No training required');
    });

    it('should suggest alternatives based on quota issue', () => {
      const original = {
        resource: { name: 'Printer A' },
        eligibility: {
          status: EligibilityStatus.QUOTA_EXCEEDED,
          canBook: false,
          reasons: [{ type: 'WEEKLY_CAP_REACHED', message: 'Quota exceeded' }],
        },
      };

      const alternative = { name: 'Printer B' };

      const reason = (discoveryService as any).getAlternativeReason(original, alternative);

      expect(reason).toContain('usage available');
    });
  });
});
