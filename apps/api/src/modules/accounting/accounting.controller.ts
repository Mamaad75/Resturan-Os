import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  accountingSummaryQuerySchema,
  createExpenseSchema,
  expenseCategorySchema,
  expenseQuerySchema,
  quickPurchaseSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  uuidSchema,
  type AccountingSummaryQueryInput,
  type CreateExpenseInput,
  type ExpenseCategoryInput,
  type ExpenseQueryInput,
  type QuickPurchaseInput,
  type UpdateExpenseCategoryInput,
  type UpdateExpenseInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  ZodBody,
  ZodParam,
  ZodQuery,
} from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { AccountingService } from './accounting.service';

/**
 * The books.
 *
 * Reading needs ACCOUNTING_READ; writing needs ACCOUNTING_MANAGE. A quick
 * purchase also raises stock, so it additionally requires the inventory
 * permission - one call should not be a way around the other module's rules.
 */
@ApiTags('accounting')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  /* ------------------------------------------------------------ categories */

  @Get('categories')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Expense categories, seeded on first use' })
  categories(@Ctx() ctx: RequestContext) {
    return this.accounting.categories(ctx);
  }

  @Post('categories')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Add a category' })
  createCategory(
    @Ctx() ctx: RequestContext,
    @ZodBody(expenseCategorySchema) dto: ExpenseCategoryInput,
  ) {
    return this.accounting.createCategory(ctx, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Rename or deactivate a category' })
  updateCategory(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateExpenseCategorySchema) dto: UpdateExpenseCategoryInput,
  ) {
    return this.accounting.updateCategory(ctx, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Delete a category, or retire it if it is in use' })
  deleteCategory(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
  ) {
    return this.accounting.deleteCategory(ctx, id);
  }

  /* -------------------------------------------------------------- expenses */

  @Get('expenses')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Expenses in a date range, with the range total' })
  expenses(
    @Ctx() ctx: RequestContext,
    @ZodQuery(expenseQuerySchema) query: ExpenseQueryInput,
  ) {
    return this.accounting.listExpenses(ctx, query);
  }

  @Post('expenses')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Record a payment out' })
  createExpense(
    @Ctx() ctx: RequestContext,
    @ZodBody(createExpenseSchema) dto: CreateExpenseInput,
  ) {
    return this.accounting.createExpense(ctx, dto);
  }

  @Patch('expenses/:id')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Correct an expense' })
  updateExpense(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateExpenseSchema) dto: UpdateExpenseInput,
  ) {
    return this.accounting.updateExpense(ctx, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Remove an expense' })
  deleteExpense(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
  ) {
    return this.accounting.deleteExpense(ctx, id);
  }

  /* ------------------------------------------------------------- purchases */

  @Post('purchases')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE, Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Record a purchase and stock it in one step' })
  quickPurchase(
    @Ctx() ctx: RequestContext,
    @ZodBody(quickPurchaseSchema) dto: QuickPurchaseInput,
  ) {
    return this.accounting.quickPurchase(ctx, dto);
  }

  /* --------------------------------------------------------------- summary */

  @Get('summary')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Revenue, purchases, expenses and profit for a range' })
  summary(
    @Ctx() ctx: RequestContext,
    @ZodQuery(accountingSummaryQuerySchema) query: AccountingSummaryQueryInput,
  ) {
    return this.accounting.summary(ctx, query);
  }
}
