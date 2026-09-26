import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  activatePlanSchema,
  bankAccountSchema,
  createPlanSchema,
  extendSubscriptionSchema,
  invoiceQuerySchema,
  rejectInvoiceSchema,
  reviewInvoiceSchema,
  suspendTenantSchema,
  entitlementOverridesSchema,
  tenantNotesSchema,
  updatePlanSchema,
  updateBankAccountSchema,
  updateSubscriptionSchema,
  uuidSchema,
  type ActivatePlanInput,
  type BankAccountInput,
  type CreatePlanInput,
  type ExtendSubscriptionInput,
  type InvoiceQueryInput,
  type RejectInvoiceInput,
  type ReviewInvoiceInput,
  type UpdateBankAccountInput,
  type SuspendTenantInput,
  type EntitlementOverridesInput,
  type TenantNotesInput,
  type UpdatePlanInput,
  type UpdateSubscriptionInput,
  phoneBankQuerySchema,
  settleSettlementsSchema,
  settlementQuerySchema,
  updatePlatformPaymentConfigSchema,
  updatePlatformSmsConfigSchema,
  type PhoneBankQueryInput,
  type SettleSettlementsInput,
  type SettlementQueryInput,
  type UpdatePlatformPaymentConfigInput,
  type UpdatePlatformSmsConfigInput,
} from '@restaurant-os/validation';
import {
  ClientInfo,
  PlatformCtx,
  PlatformOnly,
} from '../../common/decorators/auth.decorators';
import {
  ZodBody,
  ZodParam,
  ZodQuery,
} from '../../common/decorators/validation.decorators';
import type { PlatformContext } from '../../common/types/request-context';
import { BillingService } from '../billing/billing.service';
import { PlansService } from '../plans/plans.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformPlansService } from './platform-plans.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformTenantsService, type AuditMeta } from './platform-tenants.service';

/**
 * The FoodOS platform surface.
 *
 * `@PlatformOnly()` on the class means every route here authenticates against
 * PlatformAdmin and is invisible to tenant sessions - a restaurant owner's
 * token fails signature verification before any handler runs.
 */
@ApiTags('platform')
@PlatformOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly dashboard: PlatformDashboardService,
    private readonly tenants: PlatformTenantsService,
    private readonly plans: PlansService,
    private readonly platformPlans: PlatformPlansService,
    private readonly audit: PlatformAuditService,
    private readonly billing: BillingService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /* ------------------------------------------------- payment/SMS config */

  @Get('payment-config')
  @ApiOperation({ summary: 'Platform online-gateway configuration (secrets masked)' })
  getPaymentConfig() {
    return this.settings.getPaymentConfig();
  }

  @Put('payment-config')
  @ApiOperation({ summary: 'Configure the platform online gateway' })
  updatePaymentConfig(
    @ZodBody(updatePlatformPaymentConfigSchema) dto: UpdatePlatformPaymentConfigInput,
  ) {
    return this.settings.updatePaymentConfig(dto);
  }

  @Get('sms-config')
  @ApiOperation({ summary: 'Platform SMS provider configuration (key masked)' })
  getSmsConfig() {
    return this.settings.getSmsConfig();
  }

  @Put('sms-config')
  @ApiOperation({ summary: 'Configure the platform SMS provider' })
  updateSmsConfig(
    @ZodBody(updatePlatformSmsConfigSchema) dto: UpdatePlatformSmsConfigInput,
  ) {
    return this.settings.updateSmsConfig(dto);
  }

  /* ---------------------------------------------------------- settlements */

  @Get('settlements')
  @ApiOperation({ summary: 'Public-gateway settlement ledger (what is owed to each restaurant)' })
  listSettlements(@ZodQuery(settlementQuerySchema) query: SettlementQueryInput) {
    return this.settings.listSettlements(query);
  }

  @Post('settlements/settle')
  @ApiOperation({ summary: 'Mark selected settlements as paid out' })
  settle(@ZodBody(settleSettlementsSchema) dto: SettleSettlementsInput) {
    return this.settings.settle(dto);
  }

  /* ------------------------------------------------------------ phone bank */

  @Get('phone-bank')
  @ApiOperation({ summary: 'Customer phone numbers collected across all restaurants' })
  phoneBank(@ZodQuery(phoneBankQuerySchema) query: PhoneBankQueryInput) {
    return this.settings.phoneBank(query);
  }

  /* ------------------------------------------------------------ dashboard */

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform-wide totals, revenue and recent activity' })
  getDashboard() {
    return this.dashboard.summary();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent platform administrator actions' })
  getActivity(@Query('limit') limit = '30') {
    return this.audit.list({ limit: Number(limit) || 30 });
  }

  /* -------------------------------------------------------------- tenants */

  @Get('tenants')
  @ApiOperation({ summary: 'Search and page through every business on the platform' })
  listTenants(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planKey') planKey?: string,
  ) {
    return this.tenants.list({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      search: search?.trim() || null,
      status: status?.trim() || null,
      planKey: planKey?.trim() || null,
    });
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'One business: subscription, usage, branches, staff' })
  getTenant(@ZodParam('id', uuidSchema) id: string) {
    return this.tenants.detail(id);
  }

  @Post('tenants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a business; reads continue, writes stop' })
  suspend(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(suspendTenantSchema) dto: SuspendTenantInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.suspend(admin, id, dto, meta);
  }

  @Post('tenants/:id/activate')
  @ApiOperation({ summary: 'Lift a suspension' })
  activate(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.activate(admin, id, meta);
  }

  @Post('tenants/:id/disable')
  @ApiOperation({ summary: 'Disable a business without touching its subscription' })
  disable(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setActive(admin, id, false, meta);
  }

  @Post('tenants/:id/restore')
  @ApiOperation({ summary: 'Restore a disabled business' })
  restore(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setActive(admin, id, true, meta);
  }

  @Patch('tenants/:id/notes')
  @ApiOperation({ summary: 'Platform-only notes about a business' })
  setNotes(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(tenantNotesSchema) dto: TenantNotesInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setNotes(admin, id, dto, meta);
  }

  @Put('tenants/:id/entitlements')
  @ApiOperation({
    summary: 'Grant or withdraw one tenant s exceptions to their plan',
    description:
      'A complete replacement of the exception set. Anything not sent follows ' +
      'the plan, including whatever the plan becomes later.',
  })
  setEntitlements(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(entitlementOverridesSchema) dto: EntitlementOverridesInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setEntitlementOverrides(admin, id, dto, meta);
  }

  /* --------------------------------------------------------- subscription */

  @Patch('tenants/:id/subscription')
  @ApiOperation({ summary: 'Change plan, status, or any subscription date' })
  updateSubscription(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateSubscriptionSchema) dto: UpdateSubscriptionInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.updateSubscription(admin, id, dto, meta);
  }

  @Post('tenants/:id/subscription/extend')
  @ApiOperation({ summary: 'Extend the subscription by a number of days' })
  extend(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(extendSubscriptionSchema) dto: ExtendSubscriptionInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.extend(admin, id, dto, meta);
  }

  /* ---------------------------------------------------------------- plans */

  @Get('plans')
  @ApiOperation({ summary: 'Every plan, including inactive ones' })
  listPlans() {
    return this.plans.listPlans(true);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a plan' })
  createPlan(
    @PlatformCtx() admin: PlatformContext,
    @ZodBody(createPlanSchema) dto: CreatePlanInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.platformPlans.create(admin, dto, meta);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Change a plan s limits, features or price' })
  updatePlan(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updatePlanSchema) dto: UpdatePlanInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.platformPlans.update(admin, id, dto, meta);
  }

  /* ------------------------------------------------------ plan activation */

  @Post('tenants/:id/subscription/activate')
  @ApiOperation({ summary: 'Put a tenant on a plan for N months, starting now' })
  activatePlan(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(activatePlanSchema) dto: ActivatePlanInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.billing.activatePlan(
      id,
      dto,
      { adminId: admin.adminId, source: 'platform' },
      meta,
    );
  }

  /* ---------------------------------------------------------- bank accounts */

  @Get('bank-accounts')
  @ApiOperation({ summary: 'Every card tenants can transfer to' })
  listBankAccounts() {
    return this.billing.listBankAccounts();
  }

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Add a card' })
  createBankAccount(
    @PlatformCtx() admin: PlatformContext,
    @ZodBody(bankAccountSchema) dto: BankAccountInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.billing.createBankAccount(admin, dto, meta);
  }

  @Patch('bank-accounts/:id')
  @ApiOperation({ summary: 'Edit or deactivate a card' })
  updateBankAccount(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateBankAccountSchema) dto: UpdateBankAccountInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.billing.updateBankAccount(admin, id, dto, meta);
  }

  /* --------------------------------------------------------------- invoices */

  @Get('invoices')
  @ApiOperation({ summary: 'Card-to-card payment requests, pending first' })
  listInvoices(@ZodQuery(invoiceQuerySchema) query: InvoiceQueryInput) {
    return this.billing.listInvoices(query);
  }

  @Post('invoices/:id/approve')
  @ApiOperation({ summary: 'Accept a receipt, which activates the plan' })
  approveInvoice(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(reviewInvoiceSchema) dto: ReviewInvoiceInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.billing.approveInvoice(admin, id, dto, meta);
  }

  @Post('invoices/:id/reject')
  @ApiOperation({ summary: 'Reject a receipt with a stated reason' })
  rejectInvoice(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(rejectInvoiceSchema) dto: RejectInvoiceInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.billing.rejectInvoice(admin, id, dto, meta);
  }
}
