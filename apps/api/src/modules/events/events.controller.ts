import { Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createEventSchema,
  eventRsvpSchema,
  slugSchema,
  updateEventSchema,
  uuidSchema,
  type CreateEventInput,
  type EventRsvpInput,
  type UpdateEventInput,
} from '@restaurant-os/validation';
import { Ctx, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'List the tenant events' })
  list(@Ctx() ctx: RequestContext) {
    return this.events.list(ctx);
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create an event' })
  create(@Ctx() ctx: RequestContext, @ZodBody(createEventSchema) dto: CreateEventInput) {
    return this.events.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update an event' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateEventSchema) dto: UpdateEventInput,
  ) {
    return this.events.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Delete an event' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.events.remove(ctx, id);
  }

  @Get(':id/rsvps')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'List RSVPs for an event' })
  rsvps(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.events.listRsvps(ctx, id);
  }

  @Get(':id/qr')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: "The event's dedicated QR as a data URL" })
  qr(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.events.qrDataUrl(ctx, id);
  }
}

@ApiTags('events')
@Controller('public/restaurants/:slug/events')
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public list of a restaurant events' })
  list(@ZodParam('slug', slugSchema) slug: string) {
    return this.events.publicList(slug);
  }

  @Public()
  @Get(':eventSlug')
  @ApiOperation({ summary: 'Public event page data' })
  get(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodParam('eventSlug', slugSchema) eventSlug: string,
  ) {
    return this.events.publicGet(slug, eventSlug);
  }

  @Public()
  @Post(':eventSlug/rsvp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reserve a spot at an event' })
  rsvp(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodParam('eventSlug', slugSchema) eventSlug: string,
    @ZodBody(eventRsvpSchema) dto: EventRsvpInput,
  ) {
    return this.events.rsvp(slug, eventSlug, dto);
  }
}
