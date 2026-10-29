import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BetterAuthRequest } from '../internal-users/better-auth-internal-user.guard';
import { BetterAuthInternalUserGuard } from '../internal-users/better-auth-internal-user.guard';
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
import { CrmSchemaReadyGuard } from './crm-schema-ready.guard';
import { CrmService } from './crm.service';

@Controller('crm')
@UseGuards(BetterAuthInternalUserGuard, CrmSchemaReadyGuard)
export class CrmController {
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  @Get('owners')
  listActiveOwners() {
    return this.crm.listActiveOwners();
  }

  @Get('inquiries')
  listInquiries(@Query() query: InquiryListQueryDto) {
    return this.crm.listInquiries(query);
  }

  @Post('inquiries')
  createInquiry(@Body() input: CreateInquiryDto, @Req() request: BetterAuthRequest) {
    return this.crm.createManualInquiry(input, request.betterAuthInternalUser!.id);
  }

  @Get('inquiries/:id')
  getInquiry(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.getInquiry(id);
  }

  @Patch('inquiries/:id')
  updateInquiry(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateInquiryDto) {
    return this.crm.updateInquiry(id, input);
  }

  @Get('companies')
  listCompanies(@Query() query: CompanyListQueryDto) {
    return this.crm.listCompanies(query);
  }

  @Post('companies')
  createCompany(@Body() input: CreateCompanyDto) {
    return this.crm.createCompany(input);
  }

  @Get('companies/:id')
  getCompany(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.getCompany(id);
  }

  @Get('contacts/:id')
  getContact(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.getContact(id);
  }

  @Patch('companies/:id')
  updateCompany(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateCompanyDto) {
    return this.crm.updateCompany(id, input);
  }

  @Delete('companies/:id')
  archiveCompany(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.archiveCompany(id);
  }

  @Get('companies/:companyId/contacts')
  listContacts(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.crm.listContacts(companyId, query);
  }

  @Post('companies/:companyId/contacts')
  createContact(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() input: CreateContactDto,
  ) {
    return this.crm.createContact(companyId, input);
  }

  @Patch('contacts/:id')
  updateContact(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateContactDto) {
    return this.crm.updateContact(id, input);
  }

  @Delete('contacts/:id')
  archiveContact(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.archiveContact(id);
  }

  @Get('opportunities')
  listOpportunities(@Query() query: OpportunityListQueryDto) {
    return this.crm.listOpportunities(query);
  }

  @Get('opportunities/:id')
  getOpportunity(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.getOpportunity(id);
  }

  @Post('opportunities')
  createOpportunity(@Body() input: CreateOpportunityDto) {
    return this.crm.createOpportunity(input);
  }

  @Patch('opportunities/:id')
  updateOpportunity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateOpportunityDto,
  ) {
    return this.crm.updateOpportunity(id, input);
  }

  @Delete('opportunities/:id')
  archiveOpportunity(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.archiveOpportunity(id);
  }

  @Get('activities')
  listActivities(@Query() query: ActivityListQueryDto) {
    return this.crm.listActivities(query);
  }

  @Get('activities/:id')
  getActivity(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crm.getActivity(id);
  }

  @Post('activities')
  createActivity(@Body() input: CreateActivityDto, @Req() request: BetterAuthRequest) {
    return this.crm.createActivity(input, request.betterAuthInternalUser!.id);
  }

  @Patch('activities/:id')
  updateActivity(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateActivityDto) {
    return this.crm.updateActivity(id, input);
  }
}
