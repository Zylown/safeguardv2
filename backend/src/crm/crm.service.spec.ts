jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    Inject: () => () => undefined,
    ConflictException: class ConflictException extends HttpException {},
    NotFoundException: class NotFoundException extends HttpException {},
    UnprocessableEntityException: class UnprocessableEntityException extends HttpException {},
  };
});
jest.mock('../generated/prisma/client', () => ({
  ActivityType: { NOTE: 'NOTE', CALL: 'CALL', MEETING: 'MEETING', TASK: 'TASK' },
  ActivityTaskStatus: { OPEN: 'OPEN', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED' },
  InquiryLocale: { EN: 'EN', ES: 'ES' },
  InquirySource: { WEBSITE: 'WEBSITE', MANUAL: 'MANUAL' },
  InquiryStatus: { NEW: 'NEW', REVIEWING: 'REVIEWING', CONTACTED: 'CONTACTED', CLOSED: 'CLOSED' },
  OpportunityStage: {
    NEW: 'NEW',
    QUALIFIED: 'QUALIFIED',
    QUOTATION: 'QUOTATION',
    NEGOTIATION: 'NEGOTIATION',
    WON: 'WON',
    LOST: 'LOST',
  },
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  ActivityType,
  InquiryLocale,
  InquirySource,
  InquiryStatus,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';

const id = 'b6b438bb-d984-4ad5-9c8a-4a9260bd31a0';
const companyId = '3d395559-4561-4369-9d5d-fd2801c7db26';

function serviceWith(overrides: Record<string, unknown> = {}) {
  const prisma = {
    inquiry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue({ id: companyId }),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    contact: {
      findFirst: jest.fn().mockResolvedValue({ id }),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    opportunity: {
      findFirst: jest.fn().mockResolvedValue({ id, companyId }),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    internalUser: { findFirst: jest.fn().mockResolvedValue({ id }) },
    $transaction: jest.fn(),
    ...overrides,
  };
  return { crm: new CrmService(prisma as unknown as PrismaService), prisma };
}

describe('CrmService safety and workflow rules', () => {
  it('filters company search by normalized country code with bounded pagination', async () => {
    const { crm, prisma } = serviceWith();
    prisma.company.findMany.mockResolvedValue([]);
    prisma.company.count.mockResolvedValue(0);
    prisma.$transaction.mockResolvedValue([[], 0]);

    await expect(
      crm.listCompanies({ page: 2, pageSize: 10, q: 'pump', countryCode: 'us' }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          countryCode: 'US',
          OR: expect.arrayContaining([{ name: expect.objectContaining({ contains: 'pump' }) }]),
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.company.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ countryCode: 'US' }),
    });
  });

  it('creates only MANUAL inquiries and normalizes buyer email/country snapshots', async () => {
    const { crm, prisma } = serviceWith();
    prisma.inquiry.create.mockImplementation(({ data }) => data);
    await expect(
      crm.createManualInquiry(
        {
          email: ' Buyer@Example.test ',
          countryCode: 'us',
          companyName: '  Acme  ',
          message: ' Need a pump ',
          locale: InquiryLocale.EN,
        },
        id,
      ),
    ).resolves.toMatchObject({
      source: InquirySource.MANUAL,
      locale: InquiryLocale.EN,
      email: 'buyer@example.test',
      countryCode: 'US',
      companyName: 'Acme',
      message: 'Need a pump',
      createdById: id,
    });
    expect(prisma.inquiry.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate recent manual inquiry rather than creating another', async () => {
    const { crm, prisma } = serviceWith();
    prisma.inquiry.findFirst.mockResolvedValue({ id });
    await expect(
      crm.createManualInquiry({ email: 'buyer@example.test', message: 'same request' }, id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.inquiry.create).not.toHaveBeenCalled();
  });

  it('updates inquiry workflow/links without changing captured buyer fields', async () => {
    const snapshot = {
      id,
      email: 'buyer@example.test',
      companyName: 'Original Company',
      message: 'Original message',
      companyId: null,
      contactId: null,
      opportunityId: null,
    };
    const { crm, prisma } = serviceWith();
    prisma.inquiry.findUnique.mockResolvedValue(snapshot);
    prisma.inquiry.update.mockImplementation(({ data }) => data);
    await expect(crm.updateInquiry(id, { status: InquiryStatus.REVIEWING })).resolves.toMatchObject(
      { status: InquiryStatus.REVIEWING },
    );
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          email: expect.anything(),
          companyName: expect.anything(),
          message: expect.anything(),
        }),
      }),
    );
  });

  it('rejects mismatched company/contact links on an inquiry', async () => {
    const { crm, prisma } = serviceWith();
    prisma.inquiry.findUnique.mockResolvedValue({
      id,
      companyId: null,
      contactId: null,
      opportunityId: null,
    });
    prisma.company.findFirst.mockResolvedValue({ id: companyId });
    prisma.contact.findFirst.mockResolvedValue(null);
    await expect(crm.updateInquiry(id, { companyId, contactId: id })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.inquiry.update).not.toHaveBeenCalled();
  });

  it('rejects activity links spanning different companies', async () => {
    const { crm, prisma } = serviceWith();
    prisma.company.findFirst.mockResolvedValue({ id: companyId });
    prisma.opportunity.findFirst.mockResolvedValue({
      id,
      companyId: '60bfa192-39b5-49a2-a99c-3d2e9379657e',
    });
    await expect(
      crm.createActivity(
        { type: ActivityType.NOTE, description: 'Follow up', companyId, opportunityId: id },
        id,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('supports inquiry search, status filtering, ordering, and bounded pagination', async () => {
    const { crm, prisma } = serviceWith();
    const row = { id };
    prisma.$transaction.mockResolvedValue([[row], 1]);
    await expect(
      crm.listInquiries({
        page: 2,
        pageSize: 10,
        q: 'Acme',
        status: InquiryStatus.NEW,
        sortBy: 'companyName',
        sortDirection: 'asc',
      }),
    ).resolves.toEqual({ items: [row], page: 2, pageSize: 10, total: 1 });
    expect(prisma.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: InquiryStatus.NEW, OR: expect.any(Array) }),
        orderBy: { companyName: 'asc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('updates inquiry state without revalidating unchanged archived links', async () => {
    const { crm, prisma } = serviceWith();
    prisma.inquiry.findUnique.mockResolvedValue({
      id,
      companyId,
      contactId: id,
      opportunityId: null,
    });
    prisma.inquiry.update.mockImplementation(({ data }) => data);
    await expect(crm.updateInquiry(id, { status: InquiryStatus.CONTACTED })).resolves.toMatchObject(
      { status: InquiryStatus.CONTACTED },
    );
    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
  });

  it('normalizes company names and relies on the database unique index for race-safe duplicate protection', async () => {
    const { crm, prisma } = serviceWith();
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.create.mockImplementation(({ data }) => data);
    await expect(
      crm.createCompany({ name: '  Acme Systems  ', countryCode: 'us' }),
    ).resolves.toMatchObject({ name: 'Acme Systems', countryCode: 'US' });
    prisma.company.create.mockRejectedValue({ code: 'P2002' });
    await expect(crm.createCompany({ name: 'Another Company' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('normalizes contact email and rejects estimated amounts without their currency', async () => {
    const { crm, prisma } = serviceWith();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockImplementation(({ data }) => data);
    await expect(
      crm.createContact(companyId, { firstName: 'Ana', email: ' ANA@EXAMPLE.TEST ' }),
    ).resolves.toMatchObject({ email: 'ana@example.test' });
    await expect(
      crm.createOpportunity({ name: 'Valve inquiry', companyId, estimatedAmount: 1200 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it('archives companies without hard-deleting records', async () => {
    const { crm, prisma } = serviceWith();
    prisma.company.updateMany.mockResolvedValue({ count: 1 });
    await expect(crm.archiveCompany(companyId)).resolves.toEqual({ archived: true });
    expect(prisma.company.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: companyId, archivedAt: null },
        data: { archivedAt: expect.any(Date) },
      }),
    );
  });

  it('defaults manual tasks to OPEN and enforces task-only due dates', async () => {
    const { crm, prisma } = serviceWith();
    prisma.activity.create.mockImplementation(({ data }) => data);
    await expect(
      crm.createActivity({ type: ActivityType.TASK, description: 'Call customer' }, id),
    ).resolves.toMatchObject({
      type: ActivityType.TASK,
      taskStatus: 'OPEN',
      authorId: id,
    });
    await expect(
      crm.createActivity(
        {
          type: ActivityType.NOTE,
          description: 'Note',
          taskDueAt: '2026-10-20T00:00:00.000Z',
        },
        id,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);
  });
});
