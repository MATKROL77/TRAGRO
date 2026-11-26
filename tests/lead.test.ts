import { describe, expect, it } from 'vitest';
import { validateLead } from '../src/ui/modals/QuoteModal';

const base = { name: '', company: '', country: '', region: '', hectares: '', phone: '', email: '', message: '' };

describe('validateLead', () => {
  it('por WhatsApp alcanza con el nombre', () => {
    expect(validateLead({ ...base, name: 'Ana' }, 'whatsapp')).toEqual({});
    expect(validateLead(base, 'whatsapp').name).toBeTruthy();
  });
  it('por email pide el email', () => {
    expect(validateLead({ ...base, name: 'Ana' }, 'email').email).toBe('quote.required');
    expect(validateLead({ ...base, name: 'Ana', email: 'ana@campo.com' }, 'email')).toEqual({});
  });
  it('valida teléfono y email si se completan', () => {
    expect(validateLead({ ...base, name: 'Ana', phone: 'abc' }).phone).toBe('quote.invalidPhone');
    expect(validateLead({ ...base, name: 'Ana', email: 'x@' }).email).toBe('quote.invalidEmail');
  });
});
