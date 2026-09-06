import { renderTemplate } from '../../src/modules/notification/template-renderer.util';

describe('renderTemplate', () => {
  it('substitutes every known variable', () => {
    expect(renderTemplate('Hi {{firstName}}, order {{orderNumber}} shipped', { firstName: 'Asha', orderNumber: 'ORD-1' })).toBe(
      'Hi Asha, order ORD-1 shipped',
    );
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('Hi {{ firstName }}', { firstName: 'Asha' })).toBe('Hi Asha');
  });

  it('renders an unresolved variable as empty string rather than throwing', () => {
    expect(renderTemplate('Hi {{firstName}}, {{missing}}!', { firstName: 'Asha' })).toBe('Hi Asha, !');
  });

  it('leaves a template with no placeholders untouched', () => {
    expect(renderTemplate('Plain text', {})).toBe('Plain text');
  });

  it('substitutes every occurrence of a repeated variable', () => {
    expect(renderTemplate('{{name}} + {{name}}', { name: 'X' })).toBe('X + X');
  });
});
