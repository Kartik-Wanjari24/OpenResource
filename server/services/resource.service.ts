import { PrismaClient, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../utils/errors.js';
import {
  CreateResourceInput,
  UpdateResourceInput,
  ResourceQueryParams,
} from '../types/validation.js';

const prisma = new PrismaClient();

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
  }

  /**
   * Get a single resource by ID
   */
  async getResourceById(id: string): Promise<any> {
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
