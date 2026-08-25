import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { ApiSuccess } from '@restaurant-os/types';
import { map, Observable } from 'rxjs';

/** Marker a service can attach so pagination metadata lands in `meta`. */
export const ENVELOPE_META = Symbol('envelopeMeta');

export interface WithMeta {
  [ENVELOPE_META]?: Record<string, unknown>;
}

/**
 * Wraps every successful controller return value in `{ success: true, data }`.
 * Responses that already carry the envelope (or are raw streams/buffers) pass
 * through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<T> | T>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) {
          return { success: true, data: null } as unknown as ApiSuccess<T>;
        }
        if (Buffer.isBuffer(data) || typeof data === 'string') {
          return data;
        }
        if (typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        // `{ items, meta }` from paginated services is hoisted into the envelope.
        if (
          typeof data === 'object' &&
          'items' in (data as object) &&
          'meta' in (data as object)
        ) {
          const paginated = data as unknown as { items: unknown; meta: unknown };
          return {
            success: true,
            data: paginated.items,
            meta: paginated.meta,
          } as unknown as ApiSuccess<T>;
        }
        return { success: true, data } as ApiSuccess<T>;
      }),
    );
  }
}
