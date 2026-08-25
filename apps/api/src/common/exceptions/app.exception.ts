import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@restaurant-os/types';

/**
 * The only exception type the application throws deliberately.
 *
 * It carries a stable machine-readable `code` alongside a Persian message that
 * is safe to show a user. The global filter renders it as
 * `{ success: false, error: { code, message, details } }`.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ApiErrorCode | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity = 'مورد', code: string = ApiErrorCode.NOT_FOUND) {
    return new AppException(code, `${entity} یافت نشد.`, HttpStatus.NOT_FOUND);
  }

  static forbidden(message = 'شما به این بخش دسترسی ندارید.') {
    return new AppException(ApiErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static unauthenticated(message = 'برای ادامه وارد حساب کاربری شوید.') {
    return new AppException(
      ApiErrorCode.UNAUTHENTICATED,
      message,
      HttpStatus.UNAUTHORIZED,
    );
  }

  static conflict(message: string, code: string = ApiErrorCode.CONFLICT) {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static validation(message: string, details?: Record<string, string[]>) {
    return new AppException(
      ApiErrorCode.VALIDATION_FAILED,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  static invalidOrderState(message: string) {
    return new AppException(
      ApiErrorCode.ORDER_INVALID_STATE,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
