export const CRM_LIST_PAGE_SIZE = 25;

export type CrmListOptions = {
  page: number;
  module: string;
  search?: string;
  status?: string;
  countryCode?: string;
  sort?: string;
};

export function buildCrmListQuery(options: CrmListOptions): URLSearchParams {
  const requestedPage = Math.trunc(options.page);
  const query = new URLSearchParams({
    page: String(
      Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1,
    ),
    pageSize: String(CRM_LIST_PAGE_SIZE),
  });
  const search = options.search?.trim().slice(0, 120);
  if (search) query.set('q', search);
  if (
    options.module === 'inquiries' &&
    ['NEW', 'REVIEWING', 'CONTACTED', 'CLOSED'].includes(options.status ?? '')
  )
      query.set('status', options.status!);
  if (options.module === 'companies' && options.countryCode) {
    const countryCode = options.countryCode.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(countryCode)) query.set('countryCode', countryCode);
  }
  if (options.module === 'inquiries') {
    const [sortBy, sortDirection] = (options.sort ?? 'createdAt:desc').split(
      ':',
    );
    const allowedSorts = new Set([
      'createdAt',
      'companyName',
      'contactName',
      'email',
      'status',
    ]);
    if (
      allowedSorts.has(sortBy ?? '') &&
      ['asc', 'desc'].includes(sortDirection ?? '')
    ) {
      query.set('sortBy', sortBy!);
      query.set('sortDirection', sortDirection!);
    }
  }
  return query;
}

export type CrmRequestKind = 'list' | 'write' | 'other';

export function crmApiErrorMessage(
  status: number,
  kind: CrmRequestKind = 'other',
  invalidFields: string[] = [],
): string {
  if (status === 503)
    return 'El almacenamiento del CRM aún no está habilitado.';
  if (status === 400 || status === 422) {
    const fieldLabels: Record<string, string> = {
      page: 'página',
      pageSize: 'tamaño de página',
      q: 'búsqueda',
      status: 'estado',
      locale: 'idioma',
      sortBy: 'campo de orden',
      sortDirection: 'dirección de orden',
      countryCode: 'país',
      stage: 'etapa',
      type: 'tipo',
      companyId: 'empresa',
      opportunityId: 'oportunidad',
      inquiryId: 'solicitud',
    };
    const labels = [...new Set(invalidFields)]
      .map((field) => fieldLabels[field])
      .filter(Boolean);
    if (labels.length)
      return `Revisa estos filtros: ${labels.join(', ')}.`;
    return kind === 'list'
      ? 'Los filtros o las opciones de orden de la lista no son válidos.'
      : 'Los datos enviados no cumplen el formato requerido.';
  }
  if (status === 404) return 'No se encontró el registro solicitado.';
  return 'No se pudo completar la solicitud. Inténtalo más tarde.';
}
