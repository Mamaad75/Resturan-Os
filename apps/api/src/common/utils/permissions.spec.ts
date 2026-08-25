import {
  Permission,
  permissionsForRole,
  ROLE_HOME_ROUTE,
  roleHasPermission,
  UserRole,
} from '@restaurant-os/types';

/**
 * The role matrix is what every `@RequirePermissions` decorator resolves
 * against, so a mistake here silently widens access across the whole API.
 */
describe('role / permission matrix', () => {
  it('gives the owner every permission', () => {
    const all = Object.values(Permission);
    expect(permissionsForRole(UserRole.OWNER)).toHaveLength(all.length);
  });

  it('keeps financial reporting away from operational roles', () => {
    for (const role of [UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER]) {
      expect(roleHasPermission(role, Permission.REPORT_FINANCIAL)).toBe(false);
      expect(roleHasPermission(role, Permission.REPORT_READ)).toBe(false);
    }
  });

  it('keeps staff management to owners and nobody else by default', () => {
    expect(roleHasPermission(UserRole.OWNER, Permission.STAFF_MANAGE)).toBe(true);
    for (const role of [
      UserRole.MANAGER,
      UserRole.CASHIER,
      UserRole.KITCHEN,
      UserRole.WAITER,
      UserRole.ACCOUNTANT,
    ]) {
      expect(roleHasPermission(role, Permission.STAFF_MANAGE)).toBe(false);
    }
  });

  it('lets kitchen staff move tickets but not touch prices or money', () => {
    expect(roleHasPermission(UserRole.KITCHEN, Permission.KITCHEN_UPDATE)).toBe(true);
    expect(roleHasPermission(UserRole.KITCHEN, Permission.ORDER_STATUS_UPDATE)).toBe(true);
    expect(roleHasPermission(UserRole.KITCHEN, Permission.PRODUCT_MANAGE)).toBe(false);
    expect(roleHasPermission(UserRole.KITCHEN, Permission.PAYMENT_CREATE)).toBe(false);
  });

  it('lets cashiers take money but not change settings', () => {
    expect(roleHasPermission(UserRole.CASHIER, Permission.PAYMENT_CREATE)).toBe(true);
    expect(roleHasPermission(UserRole.CASHIER, Permission.SETTINGS_MANAGE)).toBe(false);
    expect(roleHasPermission(UserRole.CASHIER, Permission.STAFF_READ)).toBe(false);
  });

  it('gives the accountant read-only financial access', () => {
    expect(roleHasPermission(UserRole.ACCOUNTANT, Permission.REPORT_FINANCIAL)).toBe(true);
    expect(roleHasPermission(UserRole.ACCOUNTANT, Permission.PAYMENT_READ)).toBe(true);
    expect(roleHasPermission(UserRole.ACCOUNTANT, Permission.PAYMENT_CREATE)).toBe(false);
    expect(roleHasPermission(UserRole.ACCOUNTANT, Permission.PRODUCT_MANAGE)).toBe(false);
  });

  it('does not let waiters cancel orders or take payment', () => {
    expect(roleHasPermission(UserRole.WAITER, Permission.ORDER_CREATE)).toBe(true);
    expect(roleHasPermission(UserRole.WAITER, Permission.ORDER_CANCEL)).toBe(false);
    expect(roleHasPermission(UserRole.WAITER, Permission.PAYMENT_CREATE)).toBe(false);
  });

  it('routes every role to a surface it can actually use', () => {
    expect(ROLE_HOME_ROUTE[UserRole.KITCHEN]).toBe('/kds');
    expect(ROLE_HOME_ROUTE[UserRole.CASHIER]).toBe('/pos');
    expect(ROLE_HOME_ROUTE[UserRole.OWNER]).toBe('/admin');
    for (const role of Object.values(UserRole)) {
      expect(ROLE_HOME_ROUTE[role]).toBeTruthy();
    }
  });
});
