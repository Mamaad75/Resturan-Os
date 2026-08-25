import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorCode, type ApiError } from '@restaurant-os/types';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { AppException } from '../exceptions/app.exception';

/**
 * Renders every failure as the documented error envelope.
 *
 * Internal details (stack traces, SQL, Prisma messages) are logged server-side
 * and never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();

    const { status, body } = this.translate(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.error.code}: ${body.error.message}`,
      );
    }

    response.status(status).json(body);
  }

  private translate(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof AppException) {
      const payload = exception.getResponse() as {
        code: string;
        message: string;
        details?: Record<string, string[]>;
      };
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: payload.code,
            message: payload.message,
            ...(payload.details ? { details: payload.details } : {}),
          },
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.translatePrisma(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: string | string[] })?.message ?? exception.message);
      return {
        status,
        body: {
          success: false,
          error: {
            code: httpStatusToCode(status),
            message: Array.isArray(message)
              ? message.join(' ')
              : translateHttpMessage(status, String(message)),
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.',
        },
      },
    };
  }

  private translatePrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiError;
  } {
    // P2002 unique violation, P2025 record not found, P2003 FK violation.
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join('، ');
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            error: {
              code: ApiErrorCode.CONFLICT,
              message: target
                ? `مقدار تکراری برای ${target} ثبت شده است.`
                : 'این مقدار قبلاً ثبت شده است.',
            },
          },
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            success: false,
            error: { code: ApiErrorCode.NOT_FOUND, message: 'مورد درخواستی یافت نشد.' },
          },
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            error: {
              code: ApiErrorCode.CONFLICT,
              message: 'این رکورد به رکوردهای دیگری وابسته است و قابل حذف نیست.',
            },
          },
        };
      default:
        this.logger.error(`Unhandled Prisma error ${error.code}`, error.message);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            success: false,
            error: {
              code: ApiErrorCode.INTERNAL_ERROR,
              message: 'خطا در ارتباط با پایگاه داده.',
            },
          },
        };
    }
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return ApiErrorCode.VALIDATION_FAILED;
    case 401:
      return ApiErrorCode.UNAUTHENTICATED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 409:
      return ApiErrorCode.CONFLICT;
    case 429:
      return ApiErrorCode.RATE_LIMITED;
    default:
      return ApiErrorCode.INTERNAL_ERROR;
  }
}

/** Framework messages are English; swap the common ones for Persian. */
function translateHttpMessage(status: number, message: string): string {
  switch (status) {
    case 401:
      return 'برای ادامه وارد حساب کاربری شوید.';
    case 403:
      return 'شما به این بخش دسترسی ندارید.';
    case 404:
      return 'آدرس درخواستی یافت نشد.';
    case 429:
      return 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.';
    case 413:
      return 'حجم فایل ارسالی بیش از حد مجاز است.';
    default:
      return message;
  }
}
