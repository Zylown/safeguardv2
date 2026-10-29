import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { BetterAuthRequest } from './better-auth-internal-user.guard';
import { BetterAuthInternalUserGuard } from './better-auth-internal-user.guard';

@Controller('internal')
export class BetterAuthInternalUsersController {
  @Get('me')
  @UseGuards(BetterAuthInternalUserGuard)
  getCurrentBetterAuthUser(@Req() request: BetterAuthRequest) {
    return { user: request.betterAuthInternalUser };
  }
}
