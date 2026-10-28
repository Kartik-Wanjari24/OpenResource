import { z } from 'zod';

// Resource Category enum values
export const ResourceCategories = [
  '3D_PRINTING',
  'LASER_CUTTING',
  'CNC_MACHINING',
  'ELECTRONICS_LAB',
  'WOODWORKING',
  'METALWORKING',
  'PHOTOGRAPHY',
  'VIDEO_PRODUCTION',
  'COMPUTING',
  'OTHER',
] as const;

// Day of week enum
export const DaysOfWeek = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

// Resource Condition enum
export const ResourceConditions = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'NEEDS_MAINTENANCE',
  'OUT_OF_SERVICE',
] as const;

// Time format validation (HH:mm)
const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

// Availability Schedule schema
export const availabilityScheduleSchema = z.object({
  dayOfWeek: z.enum(DaysOfWeek),
  startTime: z.string().regex(timeRegex, 'Time must be in HH:mm format'),
  endTime: z.string().regex(timeRegex, 'Time must be in HH:mm format'),
}).refine(
  (data) => {
    const [startHour, startMin] = data.startTime.split(':').map(Number);
    const [endHour, endMin] = data.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return endMinutes > startMinutes;
  },
  { message: 'End time must be after start time' }
);

// Create Resource schema
export const createResourceSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  category: z.enum(ResourceCategories),
  location: z.string().min(3).max(100),
  imageUrl: z.string().url().optional(),
  requiredBadgeIds: z.array(z.string()).default([]),
  requiresSupervision: z.boolean().default(false),
  securityDeposit: z.number().min(0).default(0),
  weeklyUsageCap: z.number().int().min(1).max(168).default(40),
  currentCondition: z.enum(ResourceConditions).default('GOOD'),
  availability: z.array(availabilityScheduleSchema).min(1, 'At least one availability schedule is required'),
});

// Update Resource schema (partial updates)
export const updateResourceSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(2000).optional(),
  category: z.enum(ResourceCategories).optional(),
  location: z.string().min(3).max(100).optional(),
  imageUrl: z.string().url().optional().nullable(),
  requiredBadgeIds: z.array(z.string()).optional(),
  requiresSupervision: z.boolean().optional(),
  securityDeposit: z.number().min(0).optional(),
  weeklyUsageCap: z.number().int().min(1).max(168).optional(),
  currentCondition: z.enum(ResourceConditions).optional(),
  isActive: z.boolean().optional(),
  availability: z.array(availabilityScheduleSchema).optional(),
});

// Query parameters for GET /api/resources
export const resourceQuerySchema = z.object({
  category: z.enum(ResourceCategories).optional(),
  location: z.string().optional(),
  available: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'category', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Resource ID parameter
export const resourceIdSchema = z.object({
  id: z.string().min(1),
});

// Discovery Request schema
export const discoveryRequestSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  filters: z.object({
    category: z.enum(ResourceCategories).optional(),
    location: z.string().max(100).optional(),
    maxDeposit: z.number().min(0).optional(),
    availableOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  }).optional(),
  userContext: z.object({
    includeEligibility: z.boolean().default(true),
    includeAlternatives: z.boolean().default(true),
  }).optional(),
});

// Type exports
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourceQueryParams = z.infer<typeof resourceQuerySchema>;
export type AvailabilityScheduleInput = z.infer<typeof availabilityScheduleSchema>;
export type DiscoveryRequestInput = z.infer<typeof discoveryRequestSchema>;
