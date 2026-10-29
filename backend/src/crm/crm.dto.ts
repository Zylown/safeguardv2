import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  ValidateIf,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import {
  ActivityTaskStatus,
  ActivityType,
  InquiryLocale,
  InquiryStatus,
  OpportunityStage,
} from '../generated/prisma/client';

export class PageQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class InquiryListQueryDto extends PageQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(InquiryLocale)
  locale?: InquiryLocale;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['createdAt', 'companyName', 'contactName', 'email', 'status'])
  sortBy?: 'createdAt' | 'companyName' | 'contactName' | 'email' | 'status';

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}

export class CompanyListQueryDto extends PageQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;
}

export class OpportunityListQueryDto extends PageQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
}

export class ActivityListQueryDto extends PageQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  companyId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  opportunityId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  inquiryId?: string;
}

export class CreateInquiryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(InquiryLocale)
  locale?: InquiryLocale;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(240)
  contactName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  productReference?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999.999)
  quantity?: number;

  @IsString()
  @Length(1, 10000)
  message!: string;
}

export class UpdateInquiryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;
}

export class CreateCompanyDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(240)
  legalName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  websiteUrl?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  city?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  industry?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  notes?: string;
}

export class UpdateCompanyDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(240)
  legalName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  websiteUrl?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  city?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  industry?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  notes?: string;
}

export class CreateContactDto {
  @IsString()
  @Length(1, 120)
  firstName!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  notes?: string;
}

export class UpdateContactDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 120)
  firstName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  notes?: string;
}

export class CreateOpportunityDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  estimatedAmount?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  followUpAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @IsUUID()
  companyId!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  contactId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  ownerId?: string;
}

export class UpdateOpportunityDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  estimatedAmount?: number | null;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string | null;

  @IsOptional()
  @IsDateString()
  followUpAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;
}

export class CreateActivityDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsString()
  @Length(1, 4000)
  description!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  occurredAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  taskDueAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ActivityTaskStatus)
  taskStatus?: ActivityTaskStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  companyId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  opportunityId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  inquiryId?: string;
}

export class UpdateActivityDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ActivityTaskStatus)
  taskStatus?: ActivityTaskStatus;
}

export class LinkInquiryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  companyId?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  contactId?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  opportunityId?: string | null;
}
