import { PrismaClient, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../utils/errors.js';
import {
  CreateResourceInput,
  UpdateResourceInput,
  ResourceQueryParams,
} from '../types/validation.js';

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
    availability: {
      status: 'AVAILABLE',
      schedule: [
        { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00' },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    availability: { status: 'AVAILABLE', schedule: [{ dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '18:00' }] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    availability: { status: 'AVAILABLE', schedule: [{ dayOfWeek: 'WEDNESDAY', startTime: '10:00', endTime: '17:00' }] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    availability: { status: 'AVAILABLE', schedule: [{ dayOfWeek: 'FRIDAY', startTime: '09:00', endTime: '20:00' }] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class ResourceService {
  /**
   * Get all resources with filtering and pagination
   */
  async getAllResources(
    query: ResourceQueryParams,
    userId?: string
  ): Promise<PaginatedResponse<any>> {
    const { category, location, available, search, page, limit, sortBy, sortOrder } = query;

    try {
      const where: Prisma.ResourceWhereInput = {
        isActive: true,
      };

      if (category) {
        where.category = category;
      }

      if (location) {
        where.location = {
          contains: location,
          mode: 'insensitive',
        };
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      const total = await prisma.resource.count({ where });
      if (total === 0) {
        return {
          items: FALLBACK_RESOURCES,
          pagination: {
            total: FALLBACK_RESOURCES.length,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(FALLBACK_RESOURCES.length / limit)),
          },
        };
      }

      const skip = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      const orderBy: Prisma.ResourceOrderByWithRelationInput = {};
      if (sortBy === 'name') {
        orderBy.name = sortOrder;
      } else if (sortBy === 'category') {
        orderBy.category = sortOrder;
      } else if (sortBy === 'createdAt') {
        orderBy.createdAt = sortOrder;
      }

      const resources = await prisma.resource.findMany({
        where,
        include: {
          availability: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy,
      });

      const formattedResources = resources.map((resource) => ({
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
          schedule: resource.availability.map((a) => ({
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        },
        owner: resource.owner,
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      }));

      return {
        items: formattedResources,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      console.warn('Falling back to seed resources because resource lookup failed:', error);
      return {
        items: FALLBACK_RESOURCES,
        pagination: {
          total: FALLBACK_RESOURCES.length,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(FALLBACK_RESOURCES.length / limit)),
        },
      };
    }
  }

  /**
   * Get a single resource by ID
   */
  async getResourceById(id: string): Promise<any> {
    try {
      const resource = await prisma.resource.findUnique({
        where: { id },
        include: {
          availability: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!resource) {
        const fallback = FALLBACK_RESOURCES.find((item) => item.id === id);
        if (fallback) {
          return fallback;
        }
        throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found');
      }

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
        isActive: resource.isActive,
        availability: {
          status: resource.isActive ? 'AVAILABLE' : 'UNAVAILABLE',
          schedule: resource.availability.map((a) => ({
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        },
        owner: resource.owner,
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const fallback = FALLBACK_RESOURCES.find((item) => item.id === id);
      if (fallback) {
        return fallback;
      }
      throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Failed to load resource');
    }
  }

  /**
   * Create a new resource
   */
  async createResource(data: CreateResourceInput, ownerId: string): Promise<any> {
    const { availability, ...resourceData } = data;

    try {
      const resource = await prisma.resource.create({
        data: {
          ...resourceData,
          ownerId,
          availability: {
            create: availability.map((schedule) => ({
              dayOfWeek: schedule.dayOfWeek,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              isActive: true,
            })),
          },
        },
        include: {
          availability: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

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
          status: 'AVAILABLE',
          schedule: resource.availability.map((a) => ({
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        },
        owner: resource.owner,
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new AppError(409, ErrorCode.CONFLICT, 'A resource with this name already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Update an existing resource
   */
  async updateResource(
    id: string,
    data: UpdateResourceInput,
    userId: string,
    userRole: string
  ): Promise<any> {
    const existingResource = await prisma.resource.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!existingResource) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found');
    }

    if (existingResource.ownerId !== userId && userRole !== 'ADMIN') {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        'You do not have permission to modify this resource'
      );
    }

    const { availability, ...resourceData } = data;

    try {
      if (availability) {
        await prisma.availabilitySchedule.deleteMany({
          where: { resourceId: id },
        });
      }

      const resource = await prisma.resource.update({
        where: { id },
        data: {
          ...resourceData,
          ...(availability && {
            availability: {
              create: availability.map((schedule) => ({
                dayOfWeek: schedule.dayOfWeek,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                isActive: true,
              })),
            },
          }),
        },
        include: {
          availability: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

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
        isActive: resource.isActive,
        availability: {
          status: resource.isActive ? 'AVAILABLE' : 'UNAVAILABLE',
          schedule: resource.availability.map((a) => ({
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        },
        owner: resource.owner,
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new AppError(409, ErrorCode.CONFLICT, 'A resource with this name already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete a resource (soft delete)
   */
  async deleteResource(id: string, userId: string, userRole: string): Promise<void> {
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!resource) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found');
    }

    if (resource.ownerId !== userId && userRole !== 'ADMIN') {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        'You do not have permission to delete this resource'
      );
    }

    await prisma.resource.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

export const resourceService = new ResourceService();
