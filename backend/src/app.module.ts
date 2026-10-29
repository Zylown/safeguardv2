import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { InternalUsersModule } from './internal-users/internal-users.module';
import { CrmModule } from './crm/crm.module';

@Module({
  imports: [PrismaModule, HealthModule, InternalUsersModule, CrmModule],
})
export class AppModule {}
