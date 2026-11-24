import { describe, expect, it } from 'vitest';
import { jsonLdHtml } from '../../src/lib/utils/json-ld';

describe('JSON-LD in pages', () => {
  it('cannot close the script tag and keeps the data identical', () => {
    const data = { name: 'Mock </script><script>alert(1)</script> & more ' };
    const html = jsonLdHtml(data);
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<');
    expect(JSON.parse(html)).toEqual(data);
  });
});
