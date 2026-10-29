import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 4000;

  @IsString()
  WEB_ORIGIN: string = 'http://localhost:3000';

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  SUPABASE_URL?: string;

  @IsOptional()
  @IsString()
  SUPABASE_PUBLISHABLE_KEY?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  BETTER_AUTH_DEV_ENABLED?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  BETTER_AUTH_SCHEMA_READY?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  BETTER_AUTH_URL?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  BETTER_AUTH_SECRET?: string;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${errors.map((error) => error.property).join(', ')}`,
    );
  }

  if (validated.BETTER_AUTH_DEV_ENABLED === 'true') {
    if (validated.NODE_ENV !== 'development') {
      throw new Error('Better Auth development flow can only be enabled in development.');
    }
    if (validated.BETTER_AUTH_SCHEMA_READY !== 'true') {
      throw new Error('Better Auth requires BETTER_AUTH_SCHEMA_READY=true.');
    }
    if (!validated.BETTER_AUTH_URL || !validated.BETTER_AUTH_SECRET) {
      throw new Error('Better Auth requires BETTER_AUTH_URL and BETTER_AUTH_SECRET.');
    }
  }

  return validated;
}
