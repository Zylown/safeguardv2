import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  parseApplyFlag,
  requireDevelopmentEnvironment,
} from './demo-crm-plan.js';

export function createDemoCrmPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL no está configurada para esta operación.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export function isApplyMode(args: string[]): boolean {
  return parseApplyFlag(args);
}

export function requireDevelopment(): void {
  requireDevelopmentEnvironment(process.env.NODE_ENV);
}

export function printSafeFailure(error: unknown): void {
  const safeMessages = new Set([
    'La operación requiere exactamente un SUPER_ADMIN activo.',
    'Se encontraron datos DEMO parciales o duplicados; se aborta sin cambios.',
    'La operación solo está permitida con NODE_ENV=development.',
    'Argumento no válido. Use únicamente --apply para aplicar cambios.',
    'La limpieza podría afectar registros relacionados no DEMO; se aborta sin cambios.',
    'DATABASE_URL no está configurada para esta operación.',
  ]);
  const message = error instanceof Error ? error.message : '';
  console.error(
    safeMessages.has(message)
      ? message
      : 'Falló la operación; no se muestran detalles de conexión ni de datos.',
  );
}
