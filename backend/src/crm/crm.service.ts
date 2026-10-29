import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActivityTaskStatus,
  ActivityType,
  InquirySource,
  InquiryStatus,
  OpportunityStage,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ActivityListQueryDto,
  CompanyListQueryDto,
  CreateActivityDto,
  CreateCompanyDto,
  CreateContactDto,
  CreateInquiryDto,
  CreateOpportunityDto,
  InquiryListQueryDto,
  OpportunityListQueryDto,
  PageQueryDto,
  UpdateActivityDto,
  UpdateCompanyDto,
  UpdateContactDto,
  UpdateInquiryDto,
  UpdateOpportunityDto,
} from './crm.dto';

const PAGE_SIZE_DEFAULT = 25;
const MAX_PAGE_SIZE = 100;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizedCountry(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

function pageInfo(page: number | undefined, pageSize: number | undefined) {
  const safePage = Math.max(1, page ?? 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? PAGE_SIZE_DEFAULT));
  return { page: safePage, pageSize: safePageSize, skip: (safePage - 1) * safePageSize };
}

function containsQuery(value: string) {
  return { contains: value.trim(), mode: 'insensitive' as const };
}

function rethrowUniqueConflict(error: unknown, message: string): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
}

@Injectable()
export class CrmService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listActiveOwners() {
    return this.prisma.internalUser.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
    });
  }

  async listInquiries(query: InquiryListQueryDto) {
    const { page, pageSize, skip } = pageInfo(query.page, query.pageSize);
    const q = query.q?.trim();
    const where: Prisma.InquiryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(q
        ? {
            OR: [
              { companyName: containsQuery(q) },
              { contactName: containsQuery(q) },
              { email: containsQuery(q) },
              { productName: containsQuery(q) },
              { productReference: containsQuery(q) },
              { message: containsQuery(q) },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inquiry.findMany({
        where,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortDirection ?? 'desc' }
          : { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
        },
      }),
      this.prisma.inquiry.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getInquiry(id: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
        activities: {
          orderBy: { occurredAt: 'desc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found.');
    return inquiry;
  }

  async getContact(id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, archivedAt: null },
      include: { company: true },
    });
    if (!contact) throw new NotFoundException('Contact not found.');
    return contact;
  }

  async getOpportunity(id: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, archivedAt: null },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, fullName: true } },
        inquiries: { orderBy: { createdAt: 'desc' }, take: 20 },
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 30,
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found.');
    return opportunity;
  }

  async getActivity(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, fullName: true } },
        company: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        inquiry: { select: { id: true, companyName: true, contactName: true, email: true } },
      },
    });
    if (!activity) throw new NotFoundException('Activity not found.');
    return activity;
  }

  async createManualInquiry(input: CreateInquiryDto, actorId: string) {
    const email = input.email ? normalizedEmail(input.email) : undefined;
    if (email) {
      const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
      const duplicate = await this.prisma.inquiry.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          message: input.message.trim(),
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('A matching recent inquiry already exists.');
    }
    return this.prisma.inquiry.create({
      data: {
        source: InquirySource.MANUAL,
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.companyName !== undefined ? { companyName: input.companyName.trim() } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName.trim() } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(input.countryCode !== undefined
          ? { countryCode: normalizedCountry(input.countryCode) }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
        ...(input.productName !== undefined ? { productName: input.productName.trim() } : {}),
        ...(input.productReference !== undefined
          ? { productReference: input.productReference.trim() }
          : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        message: input.message.trim(),
        createdById: actorId,
      },
    });
  }

  async updateInquiry(id: string, input: UpdateInquiryDto) {
    const current = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Inquiry not found.');
    const links = {
      companyId: input.companyId === undefined ? current.companyId : input.companyId,
      contactId: input.contactId === undefined ? current.contactId : input.contactId,
      opportunityId:
        input.opportunityId === undefined ? current.opportunityId : input.opportunityId,
    };
    if (
      input.companyId !== undefined ||
      input.contactId !== undefined ||
      input.opportunityId !== undefined
    ) {
      await this.assertInquiryLinks(links.companyId, links.contactId, links.opportunityId);
    }
    return this.prisma.inquiry.update({
      where: { id },
      data: {
        ...(input.status
          ? {
              status: input.status,
              closedAt: input.status === InquiryStatus.CLOSED ? new Date() : null,
            }
          : {}),
        ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId } : {}),
      },
    });
  }

  async listCompanies(query: CompanyListQueryDto) {
    const { page, pageSize, skip } = pageInfo(query.page, query.pageSize);
    const q = query.q?.trim();
    const where: Prisma.CompanyWhereInput = {
      archivedAt: null,
      ...(query.countryCode ? { countryCode: query.countryCode.toUpperCase() } : {}),
      ...(q
        ? {
            OR: [
              { name: containsQuery(q) },
              { legalName: containsQuery(q) },
              { city: containsQuery(q) },
              { industry: containsQuery(q) },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
        include: { _count: { select: { contacts: true, opportunities: true, inquiries: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, archivedAt: null },
      include: {
        contacts: {
          where: { archivedAt: null },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
        opportunities: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' } },
        inquiries: { orderBy: { createdAt: 'desc' }, take: 10 },
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 20,
          include: { author: { select: { fullName: true } } },
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found.');
    return company;
  }

  async createCompany(input: CreateCompanyDto) {
    const name = input.name.trim();
    const duplicate = await this.prisma.company.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, archivedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('An active company with this name already exists.');
    try {
      return await this.prisma.company.create({
        data: {
          name,
          ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
          ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl.trim() } : {}),
          ...(input.countryCode !== undefined
            ? { countryCode: normalizedCountry(input.countryCode) }
            : {}),
          ...(input.city !== undefined ? { city: input.city.trim() } : {}),
          ...(input.industry !== undefined ? { industry: input.industry.trim() } : {}),
          ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
        },
      });
    } catch (error) {
      rethrowUniqueConflict(error, 'An active company with this name already exists.');
    }
  }

  async updateCompany(id: string, input: UpdateCompanyDto) {
    const current = await this.prisma.company.findFirst({ where: { id, archivedAt: null } });
    if (!current) throw new NotFoundException('Company not found.');
    const name = input.name?.trim();
    if (name && name.toLowerCase() !== current.name.toLowerCase()) {
      const duplicate = await this.prisma.company.findFirst({
        where: { id: { not: id }, name: { equals: name, mode: 'insensitive' }, archivedAt: null },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException('An active company with this name already exists.');
    }
    try {
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(input.legalName !== undefined ? { legalName: input.legalName?.trim() ?? null } : {}),
          ...(input.websiteUrl !== undefined
            ? { websiteUrl: input.websiteUrl?.trim() ?? null }
            : {}),
          ...(input.countryCode !== undefined
            ? { countryCode: normalizedCountry(input.countryCode) }
            : {}),
          ...(input.city !== undefined ? { city: input.city?.trim() ?? null } : {}),
          ...(input.industry !== undefined ? { industry: input.industry?.trim() ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
        },
      });
    } catch (error) {
      rethrowUniqueConflict(error, 'An active company with this name already exists.');
    }
  }

  async archiveCompany(id: string) {
    const result = await this.prisma.company.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Company not found.');
    return { archived: true };
  }

  async listContacts(companyId: string, query: PageQueryDto) {
    await this.assertActiveCompany(companyId);
    const { page, pageSize, skip } = pageInfo(query.page, query.pageSize);
    const q = query.q?.trim();
    const where: Prisma.ContactWhereInput = {
      companyId,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { firstName: containsQuery(q) },
              { lastName: containsQuery(q) },
              { email: containsQuery(q) },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createContact(companyId: string, input: CreateContactDto) {
    await this.assertActiveCompany(companyId);
    const email = input.email ? normalizedEmail(input.email) : undefined;
    if (email) {
      const duplicate = await this.prisma.contact.findFirst({
        where: { companyId, email: { equals: email, mode: 'insensitive' }, archivedAt: null },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException('This email is already a contact for the company.');
    }
    try {
      return await this.prisma.contact.create({
        data: {
          companyId,
          firstName: input.firstName.trim(),
          ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle.trim() } : {}),
          ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
        },
      });
    } catch (error) {
      rethrowUniqueConflict(error, 'This email is already a contact for the company.');
    }
  }

  async updateContact(id: string, input: UpdateContactDto) {
    const current = await this.prisma.contact.findFirst({ where: { id, archivedAt: null } });
    if (!current) throw new NotFoundException('Contact not found.');
    const email =
      input.email === undefined ? current.email : input.email ? normalizedEmail(input.email) : null;
    if (email) {
      const duplicate = await this.prisma.contact.findFirst({
        where: {
          id: { not: id },
          companyId: current.companyId,
          email: { equals: email, mode: 'insensitive' },
          archivedAt: null,
        },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException('This email is already a contact for the company.');
    }
    try {
      return await this.prisma.contact.update({
        where: { id },
        data: {
          ...(input.firstName ? { firstName: input.firstName.trim() } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName?.trim() ?? null } : {}),
          ...(input.email !== undefined ? { email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() ?? null } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle?.trim() ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
        },
      });
    } catch (error) {
      rethrowUniqueConflict(error, 'This email is already a contact for the company.');
    }
  }

  async archiveContact(id: string) {
    const result = await this.prisma.contact.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Contact not found.');
    return { archived: true };
  }

  async listOpportunities(query: OpportunityListQueryDto) {
    const { page, pageSize, skip } = pageInfo(query.page, query.pageSize);
    const q = query.q?.trim();
    const where: Prisma.OpportunityWhereInput = {
      archivedAt: null,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(q ? { OR: [{ name: containsQuery(q) }, { company: { name: containsQuery(q) } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          owner: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createOpportunity(input: CreateOpportunityDto) {
    await this.assertActiveCompany(input.companyId);
    await this.assertContactCompany(input.contactId, input.companyId);
    await this.assertActiveOwner(input.ownerId);
    this.assertAmountCurrency(input.estimatedAmount, input.currencyCode);
    return this.prisma.opportunity.create({
      data: {
        name: input.name.trim(),
        companyId: input.companyId,
        stage: input.stage ?? OpportunityStage.NEW,
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.estimatedAmount !== undefined ? { estimatedAmount: input.estimatedAmount } : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
        ...(input.followUpAt ? { followUpAt: new Date(input.followUpAt) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
      },
    });
  }

  async updateOpportunity(id: string, input: UpdateOpportunityDto) {
    const current = await this.prisma.opportunity.findFirst({ where: { id, archivedAt: null } });
    if (!current) throw new NotFoundException('Opportunity not found.');
    await this.assertContactCompany(
      input.contactId === undefined
        ? (current.contactId ?? undefined)
        : (input.contactId ?? undefined),
      current.companyId,
    );
    await this.assertActiveOwner(
      input.ownerId === undefined ? (current.ownerId ?? undefined) : (input.ownerId ?? undefined),
    );
    const amount =
      input.estimatedAmount === undefined
        ? current.estimatedAmount?.toNumber()
        : (input.estimatedAmount ?? undefined);
    const currency =
      input.currencyCode === undefined
        ? current.currencyCode?.trim()
        : (input.currencyCode ?? undefined);
    this.assertAmountCurrency(amount, currency);
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.stage ? { stage: input.stage } : {}),
        ...(input.estimatedAmount !== undefined ? { estimatedAmount: input.estimatedAmount } : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
        ...(input.followUpAt !== undefined
          ? { followUpAt: input.followUpAt ? new Date(input.followUpAt) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      },
    });
  }

  async archiveOpportunity(id: string) {
    const result = await this.prisma.opportunity.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Opportunity not found.');
    return { archived: true };
  }

  async listActivities(query: ActivityListQueryDto) {
    const { page, pageSize, skip } = pageInfo(query.page, query.pageSize);
    const where: Prisma.ActivityWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(query.inquiryId ? { inquiryId: query.inquiryId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: pageSize,
        include: { author: { select: { id: true, fullName: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createActivity(input: CreateActivityDto, authorId: string) {
    await this.assertActivityLinks(input.companyId, input.opportunityId, input.inquiryId);
    if (input.type === ActivityType.TASK && !input.taskStatus) {
      input.taskStatus = ActivityTaskStatus.OPEN;
    } else if (input.type !== ActivityType.TASK && (input.taskStatus || input.taskDueAt)) {
      throw new UnprocessableEntityException('Only tasks may have task status or a due date.');
    }
    return this.prisma.activity.create({
      data: {
        type: input.type,
        description: input.description.trim(),
        taskStatus:
          input.type === ActivityType.TASK ? (input.taskStatus ?? ActivityTaskStatus.OPEN) : null,
        authorId,
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
        ...(input.taskDueAt ? { taskDueAt: new Date(input.taskDueAt) } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
        ...(input.inquiryId ? { inquiryId: input.inquiryId } : {}),
      },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async updateActivity(id: string, input: UpdateActivityDto) {
    const current = await this.prisma.activity.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Activity not found.');
    if (current.type !== ActivityType.TASK)
      throw new UnprocessableEntityException('Only tasks have a task status.');
    if (!input.taskStatus) throw new UnprocessableEntityException('A task status is required.');
    return this.prisma.activity.update({ where: { id }, data: { taskStatus: input.taskStatus } });
  }

  private async assertInquiryLinks(
    companyId: string | null,
    contactId: string | null,
    opportunityId: string | null,
  ) {
    if (!companyId && (contactId || opportunityId)) {
      throw new UnprocessableEntityException(
        'Link a company before linking a contact or opportunity.',
      );
    }
    if (companyId) await this.assertActiveCompany(companyId);
    if (contactId) await this.assertContactCompany(contactId, companyId!);
    if (opportunityId) {
      const opportunity = await this.prisma.opportunity.findFirst({
        where: { id: opportunityId, archivedAt: null },
      });
      if (!opportunity || opportunity.companyId !== companyId) {
        throw new UnprocessableEntityException(
          'The opportunity must belong to the linked company.',
        );
      }
    }
  }

  private async assertActivityLinks(
    companyId?: string,
    opportunityId?: string,
    inquiryId?: string,
  ) {
    if (companyId) await this.assertActiveCompany(companyId);
    const [opportunity, inquiry] = await Promise.all([
      opportunityId
        ? this.prisma.opportunity.findFirst({
            where: { id: opportunityId, archivedAt: null },
            select: { id: true, companyId: true },
          })
        : null,
      inquiryId
        ? this.prisma.inquiry.findUnique({
            where: { id: inquiryId },
            select: { id: true, companyId: true, opportunityId: true },
          })
        : null,
    ]);
    if (opportunityId && !opportunity) throw new NotFoundException('Opportunity not found.');
    if (inquiryId && !inquiry) throw new NotFoundException('Inquiry not found.');
    const relatedCompanyIds = [companyId, opportunity?.companyId, inquiry?.companyId].filter(
      (id): id is string => id !== undefined && id !== null,
    );
    if (new Set(relatedCompanyIds).size > 1) {
      throw new UnprocessableEntityException('Activity links must refer to the same company.');
    }
    if (opportunity && inquiry?.opportunityId && opportunity.id !== inquiry.opportunityId) {
      throw new UnprocessableEntityException('Activity links must refer to the same opportunity.');
    }
  }

  private async assertActiveCompany(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, archivedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found.');
  }

  private async assertContactCompany(contactId: string | null | undefined, companyId: string) {
    if (!contactId) return;
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, companyId, archivedAt: null },
      select: { id: true },
    });
    if (!contact)
      throw new UnprocessableEntityException(
        'The contact must be active and belong to the selected company.',
      );
  }

  private async assertActiveOwner(ownerId?: string | null) {
    if (!ownerId) return;
    const owner = await this.prisma.internalUser.findFirst({
      where: { id: ownerId, isActive: true },
      select: { id: true },
    });
    if (!owner)
      throw new UnprocessableEntityException(
        'The opportunity owner must be an active internal user.',
      );
  }

  private assertAmountCurrency(amount?: number, currency?: string) {
    if ((amount === undefined) !== (currency === undefined)) {
      throw new UnprocessableEntityException(
        'Estimated amount and currency must be provided together.',
      );
    }
  }
}
