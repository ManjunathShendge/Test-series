import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: <T,>(s: T) => s } }));
vi.mock('@/ui/tokens', () => ({ colors: {}, radius: {}, space: {} }));

const { texToText } = await import('@/features/attempt/RichText');

describe('texToText', () => {
  it('reads fractions, roots, powers and symbols', () => {
    expect(texToText(String.raw`\frac{3}{4} \times x^{2}`)).toBe('(3)/(4) × x²');
    expect(texToText(String.raw`\sqrt{16} \le 5`)).toBe('√(16) ≤ 5');
    expect(texToText('H_2O')).toBe('H₂O');
  });
});
