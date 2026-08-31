import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CampaignStatus,
  CustomerSegment,
  SmsKind,
  type CampaignDto,
} from '@restaurant-os/types';
import type { CreateCampaignInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { SmsService } from '../sms/sms.service';
import { segmentFilter } from './customer-segments';

/** How many recipients one campaign may reach, whatever the segment returns. */
const MAX_RECIPIENTS = 5000;

/**
 * Marketing campaigns.
 *
 * The rule that matters: a campaign only ever reaches customers who opted in.
 * Consent is filtered in the recipient query itself rather than checked per
 * message, so there is no path where a coding slip sends marketing to someone
 * who declined.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly sms: SmsService,
  ) {}

  async list(ctx: RequestContext): Promise<CampaignDto[]> {
    await this.plans.requireFeature(ctx.tenantId, 'campaignsEnabled');
    const rows = await this.prisma.campaign.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toCampaignDto);
  }

  /** How many people a segment would actually reach, given consent. */
  async preview(ctx: RequestContext, segment: CustomerSegment) {
    await this.plans.requireFeature(ctx.tenantId, 'campaignsEnabled');
    const recipients = await this.prisma.customer.count({
      where: this.recipientWhere(ctx.tenantId, segment),
    });
    const { limits, usage } = await this.plans.entitlements(ctx.tenantId);
    return {
      recipients,
      allowance: limits.smsAllowance,
      used: usage.monthlyMarketingSms,
      remaining:
        limits.smsAllowance === null
          ? null
          : Math.max(0, limits.smsAllowance - usage.monthlyMarketingSms),
    };
  }

  async create(ctx: RequestContext, input: CreateCampaignInput) {
    await this.plans.requireFeature(ctx.tenantId, 'campaignsEnabled');
    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        segment: input.segment,
        body: input.body,
        status: CampaignStatus.DRAFT,
      },
    });
    return toCampaignDto(campaign);
  }

  /**
   * Sends a draft campaign.
   *
   * Recipients are resolved at send time, not at draft time: a segment is a
   * live definition, and a customer who became inactive since the draft was
   * written should get the win-back message the operator intended.
   */
  async send(ctx: RequestContext, campaignId: string) {
    await this.plans.requireFeature(ctx.tenantId, 'campaignsEnabled');

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: ctx.tenantId },
    });
    if (!campaign) throw AppException.notFound('کمپین');
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw AppException.conflict('این کمپین قبلاً ارسال شده است.');
    }

    const recipients = await this.prisma.customer.findMany({
      where: this.recipientWhere(ctx.tenantId, campaign.segment as CustomerSegment),
      select: { id: true, phone: true, name: true },
      take: MAX_RECIPIENTS,
    });

    if (recipients.length === 0) {
      throw AppException.validation(
        'هیچ مشتری‌ای با این شرایط و با رضایت دریافت پیامک وجود ندارد.',
      );
    }

    // The whole send has to fit in the month's remaining allowance. Charging
    // for a partial send would leave the operator unable to tell who got it.
    await this.plans.requireCapacity(ctx.tenantId, 'smsAllowance', recipients.length);

    await this.prisma.campaign.update({
      where: { id: campaignId, tenantId: ctx.tenantId },
      data: { status: CampaignStatus.SENDING, recipientCount: recipients.length },
    });

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const messageId = await this.sms.enqueue({
        tenantId: ctx.tenantId,
        customerId: recipient.id,
        campaignId,
        kind: SmsKind.MARKETING,
        to: recipient.phone,
        body: renderBody(campaign.body, recipient.name),
      });
      if (messageId) sent += 1;
      else failed += 1;
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId, tenantId: ctx.tenantId },
      data: {
        status: CampaignStatus.SENT,
        sentCount: sent,
        failedCount: failed,
        sentAt: new Date(),
      },
    });

    this.logger.log(
      `Campaign ${campaign.name} queued ${sent} messages (${failed} rejected)`,
    );
    return toCampaignDto(updated);
  }

  /**
   * Consent is part of the recipient query, not a later check. A marketing
   * message can only be addressed to somebody who said yes.
   */
  private recipientWhere(tenantId: string, segment: CustomerSegment) {
    return {
      tenantId,
      marketingConsent: true,
      ...segmentFilter(segment),
    };
  }
}

/** `{name}` is the only placeholder; anything else is left as typed. */
function renderBody(body: string, name: string | null): string {
  return body.replace(/\{name\}/g, name?.trim() || 'مشتری گرامی');
}

function toCampaignDto(row: {
  id: string;
  name: string;
  segment: string;
  body: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: Date | null;
  createdAt: Date;
}): CampaignDto {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment as CampaignDto['segment'],
    body: row.body,
    status: row.status as CampaignDto['status'],
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
