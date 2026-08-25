import { UserRole } from './enums';

/**
 * Fine-grained permissions. Roles are shorthand for a permission set; every
 * privileged API endpoint declares the permission it needs via
 * `@RequirePermissions(...)` rather than naming roles directly, so the matrix
 * below is the only place role capabilities are defined.
 */
export const Permission = {
  // Menu & catalogue
  MENU_READ: 'menu:read',
  MENU_MANAGE: 'menu:manage',
  PRODUCT_READ: 'product:read',
  PRODUCT_MANAGE: 'product:manage',
  CATEGORY_MANAGE: 'category:manage',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_STATUS_UPDATE: 'order:status_update',
  ORDER_CANCEL: 'order:cancel',

  // Kitchen
  KITCHEN_READ: 'kitchen:read',
  KITCHEN_UPDATE: 'kitchen:update',

  // Tables
  TABLE_READ: 'table:read',
  TABLE_MANAGE: 'table:manage',

  // Payments
  PAYMENT_READ: 'payment:read',
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_REFUND: 'payment:refund',

  // Reports
  REPORT_READ: 'report:read',
  REPORT_FINANCIAL: 'report:financial',

  // Administration
  STAFF_READ: 'staff:read',
  STAFF_MANAGE: 'staff:manage',
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
  BRANDING_MANAGE: 'branding:manage',
  BRANCH_MANAGE: 'branch:manage',
  QR_MANAGE: 'qr:manage',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

/**
 * Role -> permission matrix.
 *
 * OWNER holds every permission. Everyone else is explicitly enumerated so that
 * adding a new permission never silently widens a restricted role.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: ALL_PERMISSIONS,

  [UserRole.MANAGER]: [
    Permission.MENU_READ,
    Permission.MENU_MANAGE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MANAGE,
    Permission.CATEGORY_MANAGE,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_UPDATE,
    Permission.ORDER_STATUS_UPDATE,
    Permission.ORDER_CANCEL,
    Permission.KITCHEN_READ,
    Permission.KITCHEN_UPDATE,
    Permission.TABLE_READ,
    Permission.TABLE_MANAGE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_CREATE,
    Permission.REPORT_READ,
    Permission.REPORT_FINANCIAL,
    Permission.STAFF_READ,
    Permission.SETTINGS_READ,
    Permission.QR_MANAGE,
  ],

  [UserRole.CASHIER]: [
    Permission.MENU_READ,
    Permission.PRODUCT_READ,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_UPDATE,
    Permission.ORDER_STATUS_UPDATE,
    Permission.ORDER_CANCEL,
    Permission.KITCHEN_READ,
    Permission.TABLE_READ,
    Permission.TABLE_MANAGE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_CREATE,
  ],

  [UserRole.KITCHEN]: [
    Permission.MENU_READ,
    Permission.PRODUCT_READ,
    Permission.ORDER_READ,
    Permission.KITCHEN_READ,
    Permission.KITCHEN_UPDATE,
    Permission.ORDER_STATUS_UPDATE,
  ],

  [UserRole.WAITER]: [
    Permission.MENU_READ,
    Permission.PRODUCT_READ,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_UPDATE,
    Permission.TABLE_READ,
    Permission.TABLE_MANAGE,
  ],

  [UserRole.ACCOUNTANT]: [
    Permission.MENU_READ,
    Permission.PRODUCT_READ,
    Permission.ORDER_READ,
    Permission.PAYMENT_READ,
    Permission.REPORT_READ,
    Permission.REPORT_FINANCIAL,
  ],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return permissionsForRole(role).includes(permission);
}

export function roleHasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  if (permissions.length === 0) return true;
  const granted = permissionsForRole(role);
  return permissions.some((p) => granted.includes(p));
}

/**
 * Which app surface each role lands on after logging in. Kitchen staff should
 * never be dropped into the admin dashboard they cannot use.
 */
export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  [UserRole.OWNER]: '/admin',
  [UserRole.MANAGER]: '/admin',
  [UserRole.CASHIER]: '/pos',
  [UserRole.KITCHEN]: '/kds',
  [UserRole.WAITER]: '/pos',
  [UserRole.ACCOUNTANT]: '/admin/reports',
};
