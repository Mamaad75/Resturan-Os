import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { AppException } from '../exceptions/app.exception';

/**
 * Validates and *replaces* the incoming payload with the parsed result, so
 * controllers receive normalised data (trimmed strings, coerced numbers,
 * Persian digits converted, phone numbers canonicalised).
 *
 * Server-side validation is mandatory on every mutating endpoint; the frontend
 * uses the same schemas purely for immediate feedback.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw AppException.validation(
      'اطلاعات ارسال‌شده معتبر نیست.',
      flattenZodError(result.error),
    );
  }
}

/** Turns a ZodError into `{ "items.0.quantity": ["..."] }`. */
export function flattenZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}
