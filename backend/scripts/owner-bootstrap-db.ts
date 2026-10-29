import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for the owner bootstrap CLI.');

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
