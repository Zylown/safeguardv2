import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './internal-user.guard';
import { InternalUserGuard } from './internal-user.guard';

@Controller()
export class InternalUsersController {
  @Get('me')
  @UseGuards(InternalUserGuard)
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { user: request.internalUser };
  }
}
