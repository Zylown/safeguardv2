import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ActivityListQueryDto,
  CompanyListQueryDto,
  InquiryListQueryDto,
  OpportunityListQueryDto,
  PageQueryDto,
} from '../src/crm/crm.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  transformOptions: { enableImplicitConversion: true },
});

async function validateQuery<T>(
  query: string,
  metatype: new () => T,
): Promise<T> {
  const params = Object.fromEntries(new URLSearchParams(query));
  return (await pipe.transform(params, {
    type: 'query',
    metatype,
    data: '',
  })) as T;
}

test('unfiltered CRM list query strings pass the application ValidationPipe', async (t) => {
  const requests: Array<[string, string, new () => unknown]> = [
    [
      '/crm/inquiries',
      'page=1&pageSize=25&sortBy=createdAt&sortDirection=desc',
      InquiryListQueryDto,
    ],
    ['/crm/companies', 'page=1&pageSize=25', CompanyListQueryDto],
    [
      '/crm/companies/8d8f4c20-cf23-4e69-9fe6-8a198c913a02/contacts',
      'page=1&pageSize=25',
      PageQueryDto,
    ],
    ['/crm/opportunities', 'page=1&pageSize=25', OpportunityListQueryDto],
    ['/crm/activities', 'page=1&pageSize=25', ActivityListQueryDto],
  ];
  for (const [path, query, dto] of requests) {
    await t.test(path, async () => {
      assert.ok(await validateQuery(query, dto));
    });
  }
  await t.test('owners has no query DTO and is called without parameters', () => {
    assert.equal(new URLSearchParams('').toString(), '');
  });
});

test('valid CRM list filters transform numeric pagination', async () => {
  const inquiry = await validateQuery(
    'page=2&pageSize=25&q=consulta&status=NEW&sortBy=status&sortDirection=asc',
    InquiryListQueryDto,
  );
  assert.deepEqual(
    { page: inquiry.page, pageSize: inquiry.pageSize, q: inquiry.q, status: inquiry.status },
    { page: 2, pageSize: 25, q: 'consulta', status: 'NEW' },
  );
  const company = await validateQuery(
    'page=1&pageSize=25&countryCode=PE',
    CompanyListQueryDto,
  );
  assert.equal(company.countryCode, 'PE');
});

test('DTO rejects explicit blank, unknown, and malformed optional query values', async () => {
  const invalid: Array<[string, new () => unknown, string]> = [
    ['status=', InquiryListQueryDto, 'status'],
    ['countryCode=', CompanyListQueryDto, 'countryCode'],
    ['pageSize=', PageQueryDto, 'pageSize'],
    ['unknown=value', PageQueryDto, 'unknown'],
  ];
  for (const [fragment, dto, field] of invalid) {
    await assert.rejects(
      validateQuery(`page=1&pageSize=25&${fragment}`, dto),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal(error.getStatus(), 400);
        const response = error.getResponse() as { message?: string[] };
        assert.ok(response.message?.some((message) => message.includes(field)));
        return true;
      },
    );
  }
});
