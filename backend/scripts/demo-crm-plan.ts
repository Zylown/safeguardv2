export const DEMO_COMPANIES = [
  { name: '[DEMO] Empresa de prueba Andina', countryCode: 'PE', city: 'Lima' },
  { name: '[DEMO] Empresa de prueba Norte', countryCode: 'MX', city: 'Monterrey' },
  { name: '[DEMO] Empresa de prueba Atlántica', countryCode: 'US', city: 'Miami' },
] as const;

export const DEMO_CONTACTS = [
  { firstName: 'Contacto', lastName: 'Andino Uno', email: 'crm-demo-contact-01@example.test', phone: '+51000000001', company: 0 },
  { firstName: 'Contacto', lastName: 'Norte Dos', email: 'crm-demo-contact-02@example.test', phone: '+52000000002', company: 1 },
  { firstName: 'Contacto', lastName: 'Atlántico Tres', email: 'crm-demo-contact-03@example.test', phone: '+10000000003', company: 2 },
  { firstName: 'Contacto', lastName: 'Andino Cuatro', email: 'crm-demo-contact-04@example.test', phone: '+51000000004', company: 0 },
] as const;

export const DEMO_INQUIRIES = [
  { marker: '[DEMO-CRM:INQUIRY-01]', company: 0, contact: 0, status: 'NEW' },
  { marker: '[DEMO-CRM:INQUIRY-02]', company: 1, contact: 1, status: 'REVIEWING' },
  { marker: '[DEMO-CRM:INQUIRY-03]', company: 2, contact: 2, status: 'CONTACTED' },
] as const;

export const DEMO_OPPORTUNITIES = [
  { name: '[DEMO] Oportunidad de prueba Andina', company: 0, contact: 0, stage: 'QUALIFIED' },
  { name: '[DEMO] Oportunidad de prueba Norte', company: 1, contact: 1, stage: 'QUOTATION' },
  { name: '[DEMO] Oportunidad de prueba Atlántica', company: 2, contact: 2, stage: 'NEGOTIATION' },
] as const;

export const DEMO_ACTIVITIES = [
  { marker: '[DEMO-CRM:ACTIVITY-01]', type: 'NOTE', company: 0, opportunity: 0 },
  { marker: '[DEMO-CRM:ACTIVITY-02]', type: 'CALL', company: 1, opportunity: 1 },
  { marker: '[DEMO-CRM:ACTIVITY-03]', type: 'MEETING', company: 2, opportunity: 2 },
  { marker: '[DEMO-CRM:ACTIVITY-04]', type: 'TASK', company: 0, opportunity: 0 },
] as const;

export const DEMO_COUNTS = {
  companies: DEMO_COMPANIES.length,
  contacts: DEMO_CONTACTS.length,
  inquiries: DEMO_INQUIRIES.length,
  opportunities: DEMO_OPPORTUNITIES.length,
  activities: DEMO_ACTIVITIES.length,
} as const;

export type DemoCounts = Record<keyof typeof DEMO_COUNTS, number>;

export const DEMO_INQUIRY_MESSAGES = DEMO_INQUIRIES.map(
  ({ marker }) => `${marker} Solicitud de prueba sobre artículos de protección industrial.`,
);

export const DEMO_ACTIVITY_DESCRIPTIONS = DEMO_ACTIVITIES.map(
  ({ marker }) => `${marker} Seguimiento de prueba.`,
);

export function requireExactlyOneActiveSuperAdmin(count: number): void {
  if (count !== 1)
    throw new Error('La operación requiere exactamente un SUPER_ADMIN activo.');
}

export function getSeedState(counts: DemoCounts): 'empty' | 'complete' {
  const values = Object.keys(DEMO_COUNTS) as Array<keyof DemoCounts>;
  if (values.every((key) => counts[key] === 0)) return 'empty';
  if (values.every((key) => counts[key] === DEMO_COUNTS[key])) return 'complete';
  throw new Error('Se encontraron datos DEMO parciales o duplicados; se aborta sin cambios.');
}

export function parseApplyFlag(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--apply') return true;
  throw new Error('Argumento no válido. Use únicamente --apply para aplicar cambios.');
}

export function requireDevelopmentEnvironment(nodeEnv: string | undefined): void {
  if (nodeEnv !== 'development')
    throw new Error('La operación solo está permitida con NODE_ENV=development.');
}
