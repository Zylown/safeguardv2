jest.mock('@nestjs/common', () => {
  class ServiceUnavailableException extends Error {}
  return { Injectable: () => (target: unknown) => target, ServiceUnavailableException };
});

import { ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CrmSchemaReadyGuard } from './crm-schema-ready.guard';

describe('CrmSchemaReadyGuard', () => {
  const original = process.env.CRM_SCHEMA_READY;
  const context = {} as ExecutionContext;

  afterEach(() => {
    if (original === undefined) delete process.env.CRM_SCHEMA_READY;
    else process.env.CRM_SCHEMA_READY = original;
  });

  it('keeps CRM routes unavailable unless the candidate schema is explicitly enabled', () => {
    delete process.env.CRM_SCHEMA_READY;
    expect(() => new CrmSchemaReadyGuard().canActivate(context)).toThrow(
      ServiceUnavailableException,
    );
    process.env.CRM_SCHEMA_READY = 'false';
    expect(() => new CrmSchemaReadyGuard().canActivate(context)).toThrow(
      ServiceUnavailableException,
    );
    process.env.CRM_SCHEMA_READY = 'true';
    expect(new CrmSchemaReadyGuard().canActivate(context)).toBe(true);
  });
});
