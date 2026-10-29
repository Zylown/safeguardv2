import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInquiryDto, UpdateInquiryDto } from './crm.dto';

describe('CRM DTO validation', () => {
  it('rejects null for optional buyer snapshot fields instead of letting invalid values reach services', async () => {
    const dto = plainToInstance(CreateInquiryDto, { message: 'Need a valve', companyName: null });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('companyName');
  });

  it('allows explicit null only for inquiry links so a seller can unlink a record', async () => {
    const dto = plainToInstance(UpdateInquiryDto, {
      companyId: null,
      contactId: null,
      opportunityId: null,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
