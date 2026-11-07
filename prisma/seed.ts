import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v7 } from 'uuid';
import { Algorithm, hash } from '@node-rs/argon2';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main(): Promise<void> {
  const permissions = ['users:read', 'users:write', 'api-clients:write'];
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) are required for seed');
  }

  await prisma.$transaction(async (tx) => {
    const adminRole = await tx.role.upsert({
      where: { key: 'admin' },
      create: { id: v7(), key: 'admin', name: 'Administrator', description: 'Full staff access' },
      update: {},
    });
    for (const key of permissions) {
      const permission = await tx.permission.upsert({
        where: { key }, create: { id: v7(), key }, update: {},
      });
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        create: { id: v7(), roleId: adminRole.id, permissionId: permission.id },
        update: {},
      });
    }
    const existing = await tx.user.findUnique({ where: { email: adminEmail } });
    const admin = existing ?? await tx.user.create({
      data: {
        id: v7(), email: adminEmail,
        passwordHash: await hash(adminPassword, {
          algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
        }),
        status: 'ACTIVE', emailVerifiedAt: new Date(),
      },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      create: { id: v7(), userId: admin.id, roleId: adminRole.id },
      update: {},
    });
  });
  console.log('Seed complete: permissions, admin role and administrator provisioned');
}

void main().finally(async () => { await prisma.$disconnect(); });
