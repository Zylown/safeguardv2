import { Module } from '@nestjs/common';
import { InternalUsersModule } from '../internal-users/internal-users.module';
import { CrmController } from './crm.controller';
import { CrmSchemaReadyGuard } from './crm-schema-ready.guard';
import { CrmService } from './crm.service';

@Module({
  imports: [InternalUsersModule],
  controllers: [CrmController],
  providers: [CrmService, CrmSchemaReadyGuard],
})
export class CrmModule {}
