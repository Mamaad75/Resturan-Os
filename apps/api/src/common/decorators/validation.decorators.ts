import { Body, Param, Query } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/** `@ZodBody(createOrderSchema) dto: CreateOrderInput` */
export const ZodBody = (schema: ZodSchema) => Body(new ZodValidationPipe(schema));

/** `@ZodQuery(orderQuerySchema) query: OrderQueryInput` */
export const ZodQuery = (schema: ZodSchema) => Query(new ZodValidationPipe(schema));

/** `@ZodParam('id', uuidSchema) id: string` */
export const ZodParam = (name: string, schema: ZodSchema) =>
  Param(name, new ZodValidationPipe(schema));
