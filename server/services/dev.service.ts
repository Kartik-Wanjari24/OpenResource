import { PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../utils/errors.js';

const prisma = new PrismaClient();

export interface DemoPersona {
  id: string;
  email: string;
  name: string;
  role: string;
  badges: string[];
}

export const DEMO_PERSONAS: Record<string, DemoPersona> = {
  'Lab Owner': {
    id: 'demo_lab_owner',
    email: 'lab.owner@openresource.demo',
    name: 'Dr. Sarah Martinez',
    role: 'LAB_OWNER',
    badges: ['badge_safety_101', 'badge_admin'],
  },
  'Qualified Student A': {
    id: 'demo_qualified_student',
    email: 'alice.chen@openresource.demo',
    name: 'Alice Chen',
    role: 'USER',
    badges: ['badge_safety_101', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
  'Resource-Hog Student B': {
    id: 'demo_resource_hog',
    email: 'bob.quota@openresource.demo',
    name: 'Bob Wilson',
    role: 'USER',
    badges: ['badge_safety_101', 'badge_3d_basics'],
  },
  'Admin': {
    id: 'demo_admin',
    email: 'admin@openresource.demo',
    name: 'System Administrator',
    role: 'ADMIN',
    badges: ['badge_safety_101', 'badge_admin', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
};

const SEED_RESOURCES = [
  {
    id: 'resource_prusa_mk4',
    name: '3D Printer - Prusa MK4',
    description: 'High-precision FDM 3D printer with automatic bed leveling and multi-material support',
    category: 'THREE_D_PRINTING',
    location: 'Lab A - Station 3',
    requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
    requiresSupervision: false,
    securityDeposit: 50.0,
    weeklyUsageCap: 10,
    currentCondition: 'EXCELLENT',
    availability: [
      { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '18:00' },
    ],
  },
  {
    id: 'resource_epilog_fusion',
    name: 'Laser Cutter - Epilog Fusion Pro',
    description: '48" x 36" CO2 laser cutter for precise cutting and engraving',
    category: 'LASER_CUTTING',
    location: 'Lab B - Station 1',
    requiredBadgeIds: ['badge_safety_101', 'badge_laser_cert'],
    requiresSupervision: true,
    securityDeposit: 100.0,
    weeklyUsageCap: 5,
    currentCondition: 'GOOD',
    availability: [
      { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 'THURSDAY', startTime: '09:00', endTime: '17:00' },
    ],
  },
  {
    id: 'resource_tormach_1100',
    name: 'CNC Mill - Tormach 1100',
    description: 'Precision CNC milling machine for metal and plastic machining',
    category: 'CNC_MACHINING',
    location: 'Lab B - Station 5',
    requiredBadgeIds: ['badge_safety_101', 'badge_cnc_basics'],
    requiresSupervision: true,
    securityDeposit: 150.0,
    weeklyUsageCap: 8,
    currentCondition: 'GOOD',
    availability: [
      { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 'FRIDAY', startTime: '09:00', endTime: '17:00' },
    ],
  },
  {
    id: 'resource_bambu_x1',
    name: '3D Printer - Bambu Lab X1',
    description: 'Fast multi-color 3D printer with automatic material switching',
    category: 'THREE_D_PRINTING',
    location: 'Lab A - Station 4',
    requiredBadgeIds: ['badge_safety_101'],
    requiresSupervision: false,
    securityDeposit: 30.0,
    weeklyUsageCap: 15,
    currentCondition: 'EXCELLENT',
    availability: [
      { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '20:00' },
    ],
  },
  {
    id: 'resource_electronics_bench',
    name: 'Electronics Lab Bench',
    description: 'Fully equipped workstation with oscilloscope, power supply, and soldering equipment',
    category: 'ELECTRONICS_LAB',
    location: 'Lab C - Bench 2',
    requiredBadgeIds: ['badge_safety_101'],
    requiresSupervision: false,
    securityDeposit: 0.0,
    weeklyUsageCap: 20,
    currentCondition: 'GOOD',
    availability: [
      { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '22:00' },
      { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '22:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '22:00' },
      { dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '22:00' },
      { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '22:00' },
    ],
  },
];

export class DevService {
  private checkDevEnvironment(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowDevEndpoints = process.env.ALLOW_DEV_ENDPOINTS === 'true';

    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (allowDevEndpoints) {
      return;
    }

    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      'Development endpoints are disabled in production'
    );
  }

  private async ensureDemoUsers(): Promise<void> {
    for (const personaName of Object.keys(DEMO_PERSONAS)) {
      const persona = DEMO_PERSONAS[personaName];
      await prisma.user.upsert({
        where: { id: persona.id },
        update: { email: persona.email, name: persona.name, role: persona.role },
        create: { id: persona.id, email: persona.email, name: persona.name, role: persona.role },
      });
    }
  }

  async impersonate(personaName: string): Promise<DemoPersona> {
    this.checkDevEnvironment();
    const persona = DEMO_PERSONAS[personaName];
    if (!persona) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        `Unknown persona: "${personaName}". Available: ${Object.keys(DEMO_PERSONAS).join(', ')}`
      );
    }

    await this.ensureDemoUsers();
    return persona;
  }

  async resetSeed(): Promise<string[]> {
    this.checkDevEnvironment();

    const operations: string[] = [];

    try {
      await prisma.availabilitySchedule.deleteMany({});
      operations.push('Cleared all availability schedules');

      await prisma.resource.deleteMany({});
      operations.push('Cleared all resources');

      await this.ensureDemoUsers();
      operations.push(`Created/updated ${Object.keys(DEMO_PERSONAS).length} demo users`);

      for (const seedResource of SEED_RESOURCES) {
        const { availability, ...resourceData } = seedResource;
        await prisma.resource.upsert({
          where: { id: seedResource.id },
          update: {
            ...resourceData,
            ownerId: DEMO_PERSONAS['Lab Owner'].id,
            isActive: true,
          },
          create: {
            ...resourceData,
            ownerId: DEMO_PERSONAS['Lab Owner'].id,
            availability: {
              create: availability.map((schedule) => ({
                dayOfWeek: schedule.dayOfWeek as any,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                isActive: true,
              })),
            },
          },
        });

        await prisma.availabilitySchedule.deleteMany({ where: { resourceId: seedResource.id } });
        await prisma.availabilitySchedule.createMany({
          data: availability.map((schedule) => ({
            resourceId: seedResource.id,
            dayOfWeek: schedule.dayOfWeek as any,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isActive: true,
          })),
        });
      }

      operations.push(`Created ${SEED_RESOURCES.length} demo resources`);
      operations.push('Database reset to deterministic demo state');
      return operations;
    } catch (error) {
      console.error('Seed reset error:', error);
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        'Failed to reset seed data',
        [{ message: error instanceof Error ? error.message : 'Unknown error' }]
      );
    }
  }

  getAvailablePersonas(): Record<string, DemoPersona> {
    try {
      this.checkDevEnvironment();
      return DEMO_PERSONAS;
    } catch {
      return DEMO_PERSONAS;
    }
  }
}

export const devService = new DevService();
