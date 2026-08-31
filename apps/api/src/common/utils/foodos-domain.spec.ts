import {
  MenuTemplate,
  SubscriptionStatus,
  diffFromPreset,
  modesFromServiceMode,
  presetConfig,
  resolveTheme,
  scopeCustomCss,
  serviceModeFromModes,
  tablesEnabled,
} from '@restaurant-os/types';
import { effectiveStatus, isWritable } from '../../modules/plans/plans.service';
import { segmentsForCustomer } from '../../modules/crm/customer-segments';
import { CustomerSegment } from '@restaurant-os/types';

describe('service mode', () => {
  it('reads the stored array as a single choice', () => {
    expect(serviceModeFromModes(['DINE_IN', 'TAKEAWAY'])).toBe('BOTH');
    expect(serviceModeFromModes(['DINE_IN'])).toBe('DINE_IN');
    expect(serviceModeFromModes(['TAKEAWAY'])).toBe('TAKEAWAY');
    // Delivery-only has no tables, so it reads as takeaway for the purpose
    // this value serves.
    expect(serviceModeFromModes(['DELIVERY'])).toBe('TAKEAWAY');
  });

  it('round-trips without losing a delivery mode that was already on', () => {
    expect(modesFromServiceMode('BOTH', ['DELIVERY'])).toEqual([
      'DINE_IN',
      'TAKEAWAY',
      'DELIVERY',
    ]);
    expect(modesFromServiceMode('TAKEAWAY', ['DINE_IN'])).toEqual(['TAKEAWAY']);
  });

  it('enables tables only where guests sit down', () => {
    expect(tablesEnabled(['DINE_IN'])).toBe(true);
    expect(tablesEnabled(['DINE_IN', 'TAKEAWAY'])).toBe(true);
    expect(tablesEnabled(['TAKEAWAY'])).toBe(false);
    expect(tablesEnabled([])).toBe(false);
  });
});

describe('subscription status', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('treats a suspension as outranking every date', () => {
    expect(
      effectiveStatus({
        status: SubscriptionStatus.SUSPENDED,
        expiresAt: future,
        trialEndsAt: null,
        graceUntil: future,
      }),
    ).toBe(SubscriptionStatus.SUSPENDED);
  });

  it('expires on the date without a job having run', () => {
    expect(
      effectiveStatus({
        status: SubscriptionStatus.ACTIVE,
        expiresAt: past,
        trialEndsAt: null,
        graceUntil: null,
      }),
    ).toBe(SubscriptionStatus.EXPIRED);
  });

  it('falls into the grace period rather than expiring', () => {
    expect(
      effectiveStatus({
        status: SubscriptionStatus.ACTIVE,
        expiresAt: past,
        trialEndsAt: null,
        graceUntil: future,
      }),
    ).toBe(SubscriptionStatus.GRACE_PERIOD);
  });

  it('keeps an open-ended subscription active', () => {
    expect(
      effectiveStatus({
        status: SubscriptionStatus.ACTIVE,
        expiresAt: null,
        trialEndsAt: null,
        graceUntil: null,
      }),
    ).toBe(SubscriptionStatus.ACTIVE);
  });

  it('runs a trial out into expiry, or into its grace window', () => {
    expect(
      effectiveStatus({
        status: SubscriptionStatus.TRIAL,
        expiresAt: null,
        trialEndsAt: future,
        graceUntil: null,
      }),
    ).toBe(SubscriptionStatus.TRIAL);
    expect(
      effectiveStatus({
        status: SubscriptionStatus.TRIAL,
        expiresAt: null,
        trialEndsAt: past,
        graceUntil: null,
      }),
    ).toBe(SubscriptionStatus.EXPIRED);
    expect(
      effectiveStatus({
        status: SubscriptionStatus.TRIAL,
        expiresAt: null,
        trialEndsAt: past,
        graceUntil: future,
      }),
    ).toBe(SubscriptionStatus.GRACE_PERIOD);
  });

  it('permits writes everywhere except expiry and suspension', () => {
    expect(isWritable(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isWritable(SubscriptionStatus.TRIAL)).toBe(true);
    expect(isWritable(SubscriptionStatus.GRACE_PERIOD)).toBe(true);
    expect(isWritable(SubscriptionStatus.EXPIRED)).toBe(false);
    expect(isWritable(SubscriptionStatus.SUSPENDED)).toBe(false);
  });
});

describe('customer segments', () => {
  const base = {
    ordersCount: 0,
    totalSpent: 0,
    lastOrderAt: null as Date | null,
    dineInCount: 0,
    takeawayCount: 0,
  };

  it('calls a one-order customer new, and a two-order one returning', () => {
    expect(segmentsForCustomer({ ...base, ordersCount: 1 })).toContain(
      CustomerSegment.NEW,
    );
    expect(segmentsForCustomer({ ...base, ordersCount: 2 })).toContain(
      CustomerSegment.RETURNING,
    );
    expect(segmentsForCustomer({ ...base, ordersCount: 2 })).not.toContain(
      CustomerSegment.NEW,
    );
  });

  it('separates loyalty from spend', () => {
    // Five cheap orders is loyal but not high value.
    const loyal = segmentsForCustomer({ ...base, ordersCount: 5, totalSpent: 100_000 });
    expect(loyal).toContain(CustomerSegment.VIP);
    expect(loyal).not.toContain(CustomerSegment.HIGH_VALUE);

    // One large order is high value but not yet loyal.
    const spender = segmentsForCustomer({
      ...base,
      ordersCount: 1,
      totalSpent: 5_000_000,
    });
    expect(spender).toContain(CustomerSegment.HIGH_VALUE);
    expect(spender).not.toContain(CustomerSegment.VIP);
  });

  it('picks the longer inactivity window, not both', () => {
    const idle70 = segmentsForCustomer({
      ...base,
      ordersCount: 3,
      lastOrderAt: new Date(Date.now() - 70 * 86_400_000),
    });
    expect(idle70).toContain(CustomerSegment.INACTIVE_60);
    expect(idle70).not.toContain(CustomerSegment.INACTIVE_30);

    const idle40 = segmentsForCustomer({
      ...base,
      ordersCount: 3,
      lastOrderAt: new Date(Date.now() - 40 * 86_400_000),
    });
    expect(idle40).toContain(CustomerSegment.INACTIVE_30);
  });

  it('labels a habit only when it is exclusive', () => {
    expect(segmentsForCustomer({ ...base, ordersCount: 3, dineInCount: 3 })).toContain(
      CustomerSegment.DINE_IN,
    );
    // Somebody who does both is neither.
    const mixed = segmentsForCustomer({
      ...base,
      ordersCount: 4,
      dineInCount: 2,
      takeawayCount: 2,
    });
    expect(mixed).not.toContain(CustomerSegment.DINE_IN);
    expect(mixed).not.toContain(CustomerSegment.TAKEAWAY);
  });
});

describe('menu theme resolution', () => {
  it('falls back to the preset for anything not overridden', () => {
    const preset = presetConfig(MenuTemplate.CAFE);
    const resolved = resolveTheme(MenuTemplate.CAFE, {
      colors: { primary: '#123456' },
    });

    expect(resolved.colors.primary).toBe('#123456');
    // Untouched keys keep the preset's values rather than becoming undefined.
    expect(resolved.colors.background).toBe(preset.colors.background);
    expect(resolved.layout.productLayout).toBe(preset.layout.productLayout);
  });

  it('ignores an unknown preset rather than throwing', () => {
    expect(resolveTheme('RETIRED_STYLE', null)).toEqual(
      presetConfig(MenuTemplate.CLASSIC),
    );
    expect(resolveTheme(null, null)).toEqual(presetConfig(MenuTemplate.CLASSIC));
  });

  it('stores only what actually differs from the preset', () => {
    const preset = presetConfig(MenuTemplate.MINIMAL);
    const edited = {
      ...preset,
      colors: { ...preset.colors, primary: '#FF0000' },
      showFeaturedRail: !preset.showFeaturedRail,
    };

    const diff = diffFromPreset(MenuTemplate.MINIMAL, edited);
    expect(diff).toEqual({
      colors: { primary: '#FF0000' },
      showFeaturedRail: !preset.showFeaturedRail,
    });
  });

  it('produces an empty diff for an untouched preset', () => {
    expect(diffFromPreset(MenuTemplate.FASTFOOD, presetConfig(MenuTemplate.FASTFOOD))).toEqual(
      {},
    );
  });

  it('survives a preset change by keeping only the deliberate edits', () => {
    // Saved against CAFE, then the owner switches to FASTFOOD: the colour they
    // chose follows, the layout comes from the new preset.
    const overrides = diffFromPreset(MenuTemplate.CAFE, {
      ...presetConfig(MenuTemplate.CAFE),
      colors: { ...presetConfig(MenuTemplate.CAFE).colors, primary: '#00FF00' },
    });

    const switched = resolveTheme(MenuTemplate.FASTFOOD, overrides);
    expect(switched.colors.primary).toBe('#00FF00');
    expect(switched.layout.productLayout).toBe(
      presetConfig(MenuTemplate.FASTFOOD).layout.productLayout,
    );
  });
});

/**
 * CSS scoping.
 *
 * Validation has already rejected script-bearing constructs; this is the
 * containment half. What matters is that no rule a restaurant writes can reach
 * outside its own menu, however the selector is phrased.
 */
describe('scopeCustomCss', () => {
  it('prefixes every selector with the menu container', () => {
    expect(scopeCustomCss('.card { color: red; }')).toBe(
      '#foodos-menu .card { color: red; }',
    );
  });

  it('scopes each selector in a comma-separated list', () => {
    const scoped = scopeCustomCss('.a, .b { margin: 0; }');
    expect(scoped).toContain('#foodos-menu .a');
    expect(scoped).toContain('#foodos-menu .b');
  });

  it('redirects page-level selectors at the menu, not the document', () => {
    // `body { display: none }` from a tenant must not blank the admin.
    for (const selector of ['body', 'html', ':root']) {
      expect(scopeCustomCss(`${selector} { display: none; }`)).toBe(
        '#foodos-menu { display: none; }',
      );
    }
  });

  it('leaves nothing unscoped in a multi-rule sheet', () => {
    const scoped = scopeCustomCss(`
      .one { color: red; }
      .two { color: blue; }
      body { background: black; }
    `);
    for (const rule of scoped.split('\n').filter(Boolean)) {
      expect(rule.startsWith('#foodos-menu')).toBe(true);
    }
  });

  it('strips comments so a commented brace cannot break the split', () => {
    const scoped = scopeCustomCss('/* } evil { */ .safe { color: red; }');
    expect(scoped).toBe('#foodos-menu .safe { color: red; }');
  });

  it('returns nothing for empty input', () => {
    expect(scopeCustomCss(null)).toBe('');
    expect(scopeCustomCss('')).toBe('');
    expect(scopeCustomCss('   ')).toBe('');
  });
});
