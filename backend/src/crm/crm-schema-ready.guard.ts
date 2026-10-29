import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CrmSchemaReadyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    void context;
    if (process.env.CRM_SCHEMA_READY !== 'true') {
      throw new ServiceUnavailableException('CRM storage is not enabled.');
    }
    return true;
  }
}
