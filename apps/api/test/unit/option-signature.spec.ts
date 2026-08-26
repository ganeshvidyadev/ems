import { computeOptionSignature } from '../../src/modules/product/services/variant.service';

/**
 * `option_signature` is the real duplicate-variant guard (a DB unique key), but the
 * service-level check that produces a clean 409 depends on this hashing being both
 * deterministic and order-independent — otherwise two requests describing the same
 * combination in a different key order would be treated as distinct variants.
 */
describe('computeOptionSignature', () => {
  it('is stable regardless of key order', () => {
    const a = computeOptionSignature({ color: 'Blue', size: 'L' });
    const b = computeOptionSignature({ size: 'L', color: 'Blue' });
    expect(a).toBe(b);
  });

  it('differs for different option values', () => {
    const blue = computeOptionSignature({ color: 'Blue', size: 'L' });
    const red = computeOptionSignature({ color: 'Red', size: 'L' });
    expect(blue).not.toBe(red);
  });

  it('differs for a different number of options', () => {
    const withMaterial = computeOptionSignature({ color: 'Blue', size: 'L', material: 'Cotton' });
    const without = computeOptionSignature({ color: 'Blue', size: 'L' });
    expect(withMaterial).not.toBe(without);
  });

  it('produces a 64-character hex SHA-256 digest', () => {
    const signature = computeOptionSignature({ color: 'Blue' });
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
