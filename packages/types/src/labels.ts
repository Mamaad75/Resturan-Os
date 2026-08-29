import {
  NotificationType,
  WaiterCallReason,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  ServiceMode,
  TableStatus,
  UserRole,
} from './enums';

/** Persian display labels. The UI is Persian-first; these are the canonical strings. */

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'در انتظار تأیید',
  [OrderStatus.CONFIRMED]: 'تأیید شده',
  [OrderStatus.SENT_TO_KITCHEN]: 'ارسال به آشپزخانه',
  [OrderStatus.PREPARING]: 'در حال آماده‌سازی',
  [OrderStatus.READY]: 'آماده سرو',
  [OrderStatus.READY_FOR_PICKUP]: 'آماده تحویل',
  [OrderStatus.SERVED]: 'سرو شد',
  [OrderStatus.PICKED_UP]: 'تحویل داده شد',
  [OrderStatus.COMPLETED]: 'تکمیل شده',
  [OrderStatus.CANCELLED]: 'لغو شده',
};

/** Second-person messages shown to the customer on the tracking page and SMS. */
export const ORDER_STATUS_CUSTOMER_MESSAGE_FA: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'سفارش شما ثبت شد و در انتظار تأیید رستوران است.',
  [OrderStatus.CONFIRMED]: 'سفارش شما توسط رستوران تأیید شد.',
  [OrderStatus.SENT_TO_KITCHEN]: 'سفارش شما به آشپزخانه ارسال شد.',
  [OrderStatus.PREPARING]: 'سفارش شما در حال آماده‌سازی است.',
  [OrderStatus.READY]: 'سفارش شما آماده است و به‌زودی سرو می‌شود.',
  [OrderStatus.READY_FOR_PICKUP]: 'سفارش شما آماده تحویل است.',
  [OrderStatus.SERVED]: 'سفارش شما سرو شد. نوش جان!',
  [OrderStatus.PICKED_UP]: 'سفارش شما تحویل داده شد. نوش جان!',
  [OrderStatus.COMPLETED]: 'سفارش شما تکمیل شد. از انتخاب شما سپاسگزاریم.',
  [OrderStatus.CANCELLED]: 'سفارش شما لغو شد.',
};

/** Short imperative label for the button that performs the transition. */
export const ORDER_TRANSITION_ACTION_FA: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'بازگشت به انتظار',
  [OrderStatus.CONFIRMED]: 'تأیید سفارش',
  [OrderStatus.SENT_TO_KITCHEN]: 'ارسال به آشپزخانه',
  [OrderStatus.PREPARING]: 'شروع آماده‌سازی',
  [OrderStatus.READY]: 'آماده شد',
  [OrderStatus.READY_FOR_PICKUP]: 'آماده تحویل',
  [OrderStatus.SERVED]: 'سرو شد',
  [OrderStatus.PICKED_UP]: 'تحویل شد',
  [OrderStatus.COMPLETED]: 'تکمیل سفارش',
  [OrderStatus.CANCELLED]: 'لغو سفارش',
};

export const ORDER_TYPE_LABELS_FA: Record<OrderType, string> = {
  [OrderType.DINE_IN]: 'سرو در محل',
  [OrderType.TAKEAWAY]: 'بیرون‌بر',
  [OrderType.DELIVERY]: 'ارسال',
};

export const PAYMENT_STATUS_LABELS_FA: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'پرداخت نشده',
  [PaymentStatus.AUTHORIZED]: 'در انتظار تسویه',
  [PaymentStatus.PAID]: 'پرداخت شده',
  [PaymentStatus.FAILED]: 'ناموفق',
  [PaymentStatus.REFUNDED]: 'مسترد شده',
  [PaymentStatus.CANCELLED]: 'لغو شده',
};

export const PAYMENT_METHOD_LABELS_FA: Record<PaymentMethod, string> = {
  [PaymentMethod.ONLINE]: 'پرداخت آنلاین',
  [PaymentMethod.CASH]: 'نقدی',
  [PaymentMethod.CARD]: 'کارتخوان',
  [PaymentMethod.OTHER]: 'سایر',
};

export const TABLE_STATUS_LABELS_FA: Record<TableStatus, string> = {
  [TableStatus.AVAILABLE]: 'آزاد',
  [TableStatus.OCCUPIED]: 'اشغال',
  [TableStatus.WAITING_PAYMENT]: 'در انتظار پرداخت',
  [TableStatus.RESERVED]: 'رزرو شده',
  [TableStatus.DISABLED]: 'غیرفعال',
};

export const USER_ROLE_LABELS_FA: Record<UserRole, string> = {
  [UserRole.OWNER]: 'مالک',
  [UserRole.MANAGER]: 'مدیر',
  [UserRole.CASHIER]: 'صندوق‌دار',
  [UserRole.KITCHEN]: 'آشپزخانه',
  [UserRole.WAITER]: 'گارسون',
  [UserRole.ACCOUNTANT]: 'حسابدار',
};

export const SERVICE_MODE_LABELS_FA: Record<ServiceMode, string> = {
  [ServiceMode.DINE_IN]: 'سرو در محل',
  [ServiceMode.TAKEAWAY]: 'بیرون‌بر',
  [ServiceMode.DELIVERY]: 'ارسال',
};

export const NOTIFICATION_TITLE_FA: Record<NotificationType, string> = {
  [NotificationType.ORDER_CREATED]: 'سفارش ثبت شد',
  [NotificationType.ORDER_CONFIRMED]: 'سفارش تأیید شد',
  [NotificationType.ORDER_SENT_TO_KITCHEN]: 'ارسال به آشپزخانه',
  [NotificationType.ORDER_PREPARING]: 'در حال آماده‌سازی',
  [NotificationType.ORDER_READY]: 'سفارش آماده است',
  [NotificationType.ORDER_SERVED]: 'سفارش سرو شد',
  [NotificationType.ORDER_COMPLETED]: 'سفارش تکمیل شد',
  [NotificationType.ORDER_CANCELLED]: 'سفارش لغو شد',
  [NotificationType.PAYMENT_RECEIVED]: 'پرداخت ثبت شد',
  [NotificationType.SYSTEM]: 'اطلاع‌رسانی سیستم',
};

/** Maps a status change to the notification type it should raise. */
export const STATUS_NOTIFICATION_TYPE: Record<OrderStatus, NotificationType> = {
  [OrderStatus.PENDING]: NotificationType.ORDER_CREATED,
  [OrderStatus.CONFIRMED]: NotificationType.ORDER_CONFIRMED,
  [OrderStatus.SENT_TO_KITCHEN]: NotificationType.ORDER_SENT_TO_KITCHEN,
  [OrderStatus.PREPARING]: NotificationType.ORDER_PREPARING,
  [OrderStatus.READY]: NotificationType.ORDER_READY,
  [OrderStatus.READY_FOR_PICKUP]: NotificationType.ORDER_READY,
  [OrderStatus.SERVED]: NotificationType.ORDER_SERVED,
  [OrderStatus.PICKED_UP]: NotificationType.ORDER_SERVED,
  [OrderStatus.COMPLETED]: NotificationType.ORDER_COMPLETED,
  [OrderStatus.CANCELLED]: NotificationType.ORDER_CANCELLED,
};

/** Status changes worth an SMS. Every change still creates an in-app record. */
export const SMS_WORTHY_STATUSES: OrderStatus[] = [
  OrderStatus.SENT_TO_KITCHEN,
  OrderStatus.READY,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.CANCELLED,
];

export const WAITER_CALL_REASON_LABELS_FA: Record<WaiterCallReason, string> = {
  [WaiterCallReason.ASSISTANCE]: 'درخواست کمک',
  [WaiterCallReason.BILL]: 'درخواست صورتحساب',
  [WaiterCallReason.SUPPLIES]: 'درخواست لوازم',
};

/** Short label for the guest-facing buttons. */
export const WAITER_CALL_REASON_SHORT_FA: Record<WaiterCallReason, string> = {
  [WaiterCallReason.ASSISTANCE]: 'صدا زدن گارسون',
  [WaiterCallReason.BILL]: 'صورتحساب',
  [WaiterCallReason.SUPPLIES]: 'آب و لوازم',
};
