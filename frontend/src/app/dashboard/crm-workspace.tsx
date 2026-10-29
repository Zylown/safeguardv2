'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { signOutAndRedirect } from '@/lib/home-entry';

type ModuleKey = 'inquiries' | 'companies' | 'contacts' | 'opportunities' | 'activities';
type CrmRecord = Record<string, unknown> & { id: string };
type ListResult = { items: CrmRecord[]; page: number; pageSize: number; total: number };
type Lookups = {
  companies: CrmRecord[];
  opportunities: CrmRecord[];
  inquiries: CrmRecord[];
  owners: CrmRecord[];
};
type ViewState = 'checking' | 'loading' | 'ready' | 'denied' | 'error';

const modules: Array<{ id: ModuleKey; label: string; description: string }> = [
  {
    id: 'inquiries',
    label: 'Solicitudes',
    description: 'Bandeja de consultas y solicitudes comerciales.',
  },
  {
    id: 'companies',
    label: 'Empresas',
    description: 'Organizaciones con las que trabaja SafeGuard.',
  },
  { id: 'contacts', label: 'Contactos', description: 'Personas relacionadas con una empresa.' },
  {
    id: 'opportunities',
    label: 'Oportunidades',
    description: 'Seguimiento comercial previo a cotizaciones formales.',
  },
  {
    id: 'activities',
    label: 'Actividades',
    description: 'Notas, llamadas, reuniones y tareas de seguimiento.',
  },
];

const inquiryStatuses = ['NEW', 'REVIEWING', 'CONTACTED', 'CLOSED'];
const opportunityStages = ['NEW', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST'];

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function labelFor(record: CrmRecord, module: ModuleKey): string {
  if (module === 'companies') return text(record.name);
  if (module === 'contacts')
    return [text(record.firstName), text(record.lastName)].filter(Boolean).join(' ');
  if (module === 'opportunities') return text(record.name);
  if (module === 'activities') return text(record.description);
  return (
    text(record.companyName) ||
    text(record.contactName) ||
    text(record.email) ||
    'Solicitud sin nombre'
  );
}

function fieldsFor(
  module: ModuleKey,
): Array<{ name: string; label: string; required?: boolean; type?: string; maxLength?: number }> {
  if (module === 'companies')
    return [
      { name: 'name', label: 'Nombre de empresa', required: true, maxLength: 200 },
      { name: 'legalName', label: 'Razón social', maxLength: 240 },
      { name: 'websiteUrl', label: 'Sitio web', type: 'url', maxLength: 2048 },
      { name: 'countryCode', label: 'País (código ISO)', maxLength: 2 },
      { name: 'city', label: 'Ciudad', maxLength: 120 },
      { name: 'industry', label: 'Industria', maxLength: 160 },
      { name: 'notes', label: 'Notas', type: 'textarea', maxLength: 10000 },
    ];
  if (module === 'contacts')
    return [
      { name: 'firstName', label: 'Nombre', required: true, maxLength: 120 },
      { name: 'lastName', label: 'Apellido', maxLength: 120 },
      { name: 'email', label: 'Correo', type: 'email', maxLength: 320 },
      { name: 'phone', label: 'Teléfono', maxLength: 64 },
      { name: 'jobTitle', label: 'Cargo', maxLength: 160 },
      { name: 'notes', label: 'Notas', type: 'textarea', maxLength: 10000 },
    ];
  if (module === 'opportunities')
    return [
      { name: 'name', label: 'Nombre de oportunidad', required: true, maxLength: 200 },
      { name: 'estimatedAmount', label: 'Importe estimado', type: 'number' },
      { name: 'currencyCode', label: 'Moneda ISO (ej. USD)', maxLength: 3 },
      { name: 'followUpAt', label: 'Próximo seguimiento', type: 'datetime-local' },
      { name: 'notes', label: 'Notas', type: 'textarea', maxLength: 10000 },
    ];
  if (module === 'activities')
    return [
      {
        name: 'description',
        label: 'Descripción',
        required: true,
        type: 'textarea',
        maxLength: 4000,
      },
      { name: 'taskDueAt', label: 'Vencimiento (tareas)', type: 'datetime-local' },
    ];
  return [
    { name: 'companyName', label: 'Empresa', maxLength: 200 },
    { name: 'contactName', label: 'Persona de contacto', maxLength: 240 },
    { name: 'email', label: 'Correo', type: 'email', maxLength: 320 },
    { name: 'countryCode', label: 'País (código ISO)', maxLength: 2 },
    { name: 'phone', label: 'Teléfono', maxLength: 64 },
    { name: 'productName', label: 'Producto mencionado', maxLength: 200 },
    { name: 'productReference', label: 'Referencia indicada', maxLength: 160 },
    { name: 'quantity', label: 'Cantidad', type: 'number' },
    {
      name: 'message',
      label: 'Mensaje original',
      required: true,
      type: 'textarea',
      maxLength: 10000,
    },
  ];
}

async function crmRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/crm/${path}`, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  if (response.status === 403) throw new Error('ACCESS_DENIED');
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    const detail = Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : text(payload?.message);
    throw new Error(detail || text(payload?.error) || 'No se pudo completar la solicitud.');
  }
  return payload as T;
}

export function CrmWorkspace() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>('checking');
  const [active, setActive] = useState<ModuleKey>('inquiries');
  const [result, setResult] = useState<ListResult>({ items: [], page: 1, pageSize: 25, total: 0 });
  const [lookups, setLookups] = useState<Lookups>({
    companies: [],
    opportunities: [],
    inquiries: [],
    owners: [],
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyCountryFilter, setCompanyCountryFilter] = useState('');
  const [inquirySort, setInquirySort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [detail, setDetail] = useState<CrmRecord | null>(null);
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [linkCompanyId, setLinkCompanyId] = useState('');
  const [linkContactId, setLinkContactId] = useState('');
  const [linkOpportunityId, setLinkOpportunityId] = useState('');
  const [contactOptions, setContactOptions] = useState<CrmRecord[]>([]);
  const [activityInquiryId, setActivityInquiryId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let activeRequest = true;
    async function checkAuthorization() {
      try {
        const session = await getBetterAuthClient().getSession();
        if (!activeRequest) return;
        if (session.error || !session.data?.session) {
          router.replace('/login');
          return;
        }
        const response = await fetch('/api/backend/me', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!activeRequest) return;
        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (response.status === 403) {
          setState('denied');
          return;
        }
        if (!response.ok) {
          setState('error');
          return;
        }
        const profile = (await response.json()) as { user?: { role?: string } };
        if (profile.user?.role !== 'ADMIN' && profile.user?.role !== 'SUPER_ADMIN') {
          setState('denied');
          return;
        }
        setState('ready');
      } catch {
        if (activeRequest) setState('error');
      }
    }
    void checkAuthorization();
    return () => {
      activeRequest = false;
    };
  }, [router]);

  useEffect(() => {
    if (state !== 'ready') return;
    let activeRequest = true;
    void Promise.all([
      crmRequest<ListResult>('companies?page=1&pageSize=100'),
      crmRequest<ListResult>('opportunities?page=1&pageSize=100'),
      crmRequest<ListResult>('inquiries?page=1&pageSize=100'),
      crmRequest<CrmRecord[]>('owners'),
    ])
      .then(([companies, opportunities, inquiries, owners]) => {
        if (activeRequest)
          setLookups({
            companies: companies.items,
            opportunities: opportunities.items,
            inquiries: inquiries.items,
            owners,
          });
      })
      .catch((cause: unknown) => {
        if (activeRequest) {
          setError(
            cause instanceof Error ? cause.message : 'No se pudieron cargar las referencias CRM.',
          );
          setState('error');
        }
      });
    return () => {
      activeRequest = false;
    };
  }, [state]);

  useEffect(() => {
    if (active !== 'opportunities' || !selectedCompany) return;
    let activeRequest = true;
    void crmRequest<ListResult>(`companies/${selectedCompany}/contacts?page=1&pageSize=100`)
      .then((result) => {
        if (activeRequest) setContactOptions(result.items);
      })
      .catch((cause: unknown) => {
        if (activeRequest) handleFailure(cause);
      });
    return () => {
      activeRequest = false;
    };
  }, [active, selectedCompany]);

  const loadList = useCallback(async () => {
    if (state !== 'ready') return;
    setListLoading(true);
    setError('');
    setDetail(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (search.trim()) query.set('q', search.trim());
    if (active === 'inquiries' && statusFilter) query.set('status', statusFilter);
    if (active === 'companies' && companyCountryFilter.trim()) {
      query.set('countryCode', companyCountryFilter.trim().toUpperCase());
    }
    if (active === 'inquiries') {
      const [sortBy, sortDirection] = inquirySort.split(':');
      query.set('sortBy', sortBy!);
      query.set('sortDirection', sortDirection!);
    }
    if (active === 'contacts' && selectedCompany) {
      try {
        const data = await crmRequest<ListResult>(`companies/${selectedCompany}/contacts?${query}`);
        setResult(data);
      } catch (cause) {
        handleFailure(cause);
      } finally {
        setListLoading(false);
      }
      return;
    }
    const path = active === 'contacts' ? 'companies' : active;
    if (active === 'contacts' && !selectedCompany) {
      try {
        const data = await crmRequest<ListResult>(`companies?${query}`);
        setResult(data);
      } catch (cause) {
        handleFailure(cause);
      } finally {
        setListLoading(false);
      }
      return;
    }
    try {
      const data = await crmRequest<ListResult>(`${path}?${query}`);
      setResult(data);
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setListLoading(false);
    }
  }, [
    active,
    companyCountryFilter,
    inquirySort,
    page,
    search,
    selectedCompany,
    state,
    statusFilter,
  ]);

  function handleFailure(cause: unknown) {
    if (cause instanceof Error && cause.message === 'AUTH_REQUIRED') {
      router.replace('/login');
      return;
    }
    if (cause instanceof Error && cause.message === 'ACCESS_DENIED') {
      setState('denied');
      return;
    }
    setError(cause instanceof Error ? cause.message : 'No se pudo completar la solicitud.');
    setState('error');
  }

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const activeModule = modules.find((item) => item.id === active)!;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function selectModule(module: ModuleKey) {
    setActive(module);
    setPage(1);
    setSearch('');
    setStatusFilter('');
    setCompanyCountryFilter('');
    setDetail(null);
    setFormOpen(false);
    setEditing(null);
    setError('');
    setNotice('');
    setSelectedCompany('');
    setActivityInquiryId('');
  }

  async function openDetail(record: CrmRecord) {
    setError('');
    setNotice('');
    if (active === 'inquiries' || active === 'companies') {
      try {
        const data = await crmRequest<CrmRecord>(`${active}/${record.id}`);
        setDetail(data);
        if (active === 'inquiries') {
          setLinkCompanyId(text(data.companyId));
          setLinkContactId(text(data.contactId));
          setLinkOpportunityId(text(data.opportunityId));
          if (text(data.companyId)) {
            const contacts = await crmRequest<ListResult>(
              `companies/${text(data.companyId)}/contacts?page=1&pageSize=100`,
            );
            setContactOptions(contacts.items);
          } else setContactOptions([]);
        }
      } catch (cause) {
        handleFailure(cause);
      }
    } else setDetail(record);
  }

  async function submitForm(form: HTMLFormElement) {
    setBusy(true);
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, unknown> = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ''),
    );
    if (active === 'opportunities') {
      if (!editing) payload.companyId = selectedCompany;
      if (payload.estimatedAmount) payload.estimatedAmount = Number(payload.estimatedAmount);
      if (payload.followUpAt)
        payload.followUpAt = new Date(String(payload.followUpAt)).toISOString();
    }
    if (active === 'inquiries') {
      payload.quantity = payload.quantity ? Number(payload.quantity) : undefined;
    }
    if (active === 'activities' && !editing) {
      payload.type = text(payload.type) || 'NOTE';
      if (payload.taskDueAt) payload.taskDueAt = new Date(String(payload.taskDueAt)).toISOString();
      if (payload.type === 'TASK') payload.taskStatus = 'OPEN';
      for (const key of ['companyId', 'opportunityId', 'inquiryId'])
        if (!payload[key]) delete payload[key];
    }
    try {
      const path = editing
        ? active === 'contacts'
          ? `contacts/${editing.id}`
          : `${active}/${editing.id}`
        : active === 'contacts'
          ? `companies/${selectedCompany}/contacts`
          : active;
      await crmRequest(path, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setNotice('Registro guardado. No se envió ningún correo.');
      setFormOpen(false);
      setEditing(null);
      await loadList();
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function saveInquiryLinks() {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      await crmRequest(`inquiries/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyId: linkCompanyId || null,
          contactId: linkContactId || null,
          opportunityId: linkOpportunityId || null,
        }),
      });
      await openDetail(detail);
      setNotice('Vínculos actualizados. El snapshot original permanece intacto.');
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function changeLinkCompany(companyId: string) {
    setLinkCompanyId(companyId);
    setLinkContactId('');
    setLinkOpportunityId('');
    if (!companyId) {
      setContactOptions([]);
      return;
    }
    try {
      const contacts = await crmRequest<ListResult>(
        `companies/${companyId}/contacts?page=1&pageSize=100`,
      );
      setContactOptions(contacts.items);
    } catch (cause) {
      handleFailure(cause);
    }
  }

  function startInquiryFollowUp(inquiryId: string) {
    setActive('activities');
    setPage(1);
    setDetail(null);
    setFormOpen(true);
    setEditing(null);
    setActivityInquiryId(inquiryId);
    setError('');
    setNotice('');
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    setError('');
    try {
      await crmRequest(`inquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadList();
      setNotice('Estado actualizado.');
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function archive(record: CrmRecord) {
    if (!window.confirm('¿Archivar este registro? Se conservarán sus relaciones e historial.'))
      return;
    setBusy(true);
    setError('');
    try {
      await crmRequest(`${active}/${record.id}`, { method: 'DELETE' });
      setDetail(null);
      await loadList();
      setNotice('Registro archivado.');
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const signedOut = await signOutAndRedirect(
      () => getBetterAuthClient().signOut(),
      () => {
        router.replace('/login');
        router.refresh();
      },
    );
    if (!signedOut) setError('No se pudo cerrar la sesión. Inténtalo nuevamente.');
  }

  const fields = useMemo(() => fieldsFor(active), [active]);
  const records = active === 'contacts' && !selectedCompany ? [] : result.items;

  if (state === 'checking')
    return (
      <main className="grid min-h-screen place-items-center bg-canvas text-ink">
        <p role="status">Validando autorización…</p>
      </main>
    );
  if (state === 'denied')
    return (
      <main className="mx-auto min-h-screen max-w-xl bg-canvas px-6 py-20 text-ink">
        <h1 className="text-2xl font-semibold">Acceso restringido</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Se requiere una cuenta interna activa con rol ADMIN.
        </p>
        <button
          className="mt-6 rounded-xl border border-line px-4 py-3"
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </main>
    );

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <a href="/dashboard" className="flex h-20 items-center gap-3 border-b border-line px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-brand font-bold text-white">
              S
            </span>
            <span className="font-semibold">SafeGuard</span>
          </a>
          <nav aria-label="CRM" className="flex-1 space-y-1 p-4">
            <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Comercial interno
            </p>
            {modules.map((item) => (
              <button
                key={item.id}
                aria-current={active === item.id ? 'page' : undefined}
                onClick={() => selectModule(item.id)}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm ${active === item.id ? 'bg-accent font-semibold text-brand-strong dark:text-brand' : 'text-ink-muted hover:bg-surface-muted'}`}
              >
                {item.label}
              </button>
            ))}
            <a
              href="/dashboard"
              className="mt-5 flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-muted hover:bg-surface-muted"
            >
              Resumen
            </a>
            <a
              href="/dashboard/settings/security"
              className="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-muted hover:bg-surface-muted"
            >
              Ajustes · Seguridad
            </a>
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-7">
            <div className="flex items-center gap-3">
              <button
                aria-expanded={menuOpen}
                aria-label="Abrir menú"
                className="rounded-lg border border-line px-3 py-2 lg:hidden"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                ☰
              </button>
              <div>
                <p className="text-xs text-ink-muted">SafeGuard · CRM interno</p>
                <h1 className="text-lg font-semibold">{activeModule.label}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold"
                onClick={() => void signOut()}
              >
                Cerrar sesión
              </button>
            </div>
          </header>
          {menuOpen ? (
            <nav className="grid gap-1 border-b border-line bg-surface p-3 lg:hidden">
              {modules.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    selectModule(item.id);
                    setMenuOpen(false);
                  }}
                  className="rounded-lg px-3 py-3 text-left text-sm"
                >
                  {item.label}
                </button>
              ))}
              <a className="rounded-lg px-3 py-3 text-sm" href="/dashboard/settings/security">
                Ajustes · Seguridad
              </a>
            </nav>
          ) : null}
          <div className="p-4 sm:p-7 lg:p-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand">Operaciones comerciales</p>
                <h2 className="mt-1 text-2xl font-semibold">{activeModule.label}</h2>
                <p className="mt-2 text-sm text-ink-muted">{activeModule.description}</p>
              </div>
              <button
                onClick={() => {
                  setFormOpen(!formOpen);
                  setDetail(null);
                  setEditing(null);
                  setError('');
                }}
                className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white"
              >
                Nuevo registro
              </button>
            </div>
            {error ? (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
              >
                {error}{' '}
                {state === 'error' ? (
                  <button
                    className="ml-2 underline"
                    onClick={() => {
                      setState('ready');
                      void loadList();
                    }}
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            ) : null}
            {notice ? (
              <p
                role="status"
                className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm"
              >
                {notice}
              </p>
            ) : null}
            {active === 'contacts' ? (
              <label className="mb-4 block max-w-md text-sm">
                Empresa
                <select
                  className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
                  value={selectedCompany}
                  onChange={(event) => {
                    setSelectedCompany(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Selecciona una empresa para ver sus contactos</option>
                  {lookups.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {text(company.name)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {formOpen ? (
              <form
                className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitForm(event.currentTarget);
                }}
              >
                {active === 'contacts' && !selectedCompany ? (
                  <p className="sm:col-span-2 text-sm text-ink-muted">
                    Selecciona una empresa antes de crear un contacto.
                  </p>
                ) : null}
                {active === 'opportunities' && !editing ? (
                  <label className="text-sm">
                    Empresa
                    <select
                      name="companyId"
                      required
                      value={selectedCompany}
                      onChange={(event) => setSelectedCompany(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      <option value="">Seleccionar empresa</option>
                      {lookups.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {text(company.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {active === 'opportunities' ? (
                  <label className="text-sm">
                    Etapa
                    <select
                      name="stage"
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      {opportunityStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {active === 'activities' ? (
                  <label className="text-sm">
                    Tipo
                    <select
                      name="type"
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      <option value="NOTE">Nota</option>
                      <option value="CALL">Llamada</option>
                      <option value="MEETING">Reunión</option>
                      <option value="TASK">Tarea</option>
                    </select>
                  </label>
                ) : null}
                {active === 'activities' ? (
                  <>
                    <label className="text-sm">
                      Empresa (opcional)
                      <select
                        name="companyId"
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.companies.map((item) => (
                          <option key={item.id} value={item.id}>
                            {text(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Oportunidad (opcional)
                      <select
                        name="opportunityId"
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.opportunities.map((item) => (
                          <option key={item.id} value={item.id}>
                            {text(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Solicitud (opcional)
                      <select
                        name="inquiryId"
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.inquiries.map((item) => (
                          <option key={item.id} value={item.id}>
                            {labelFor(item, 'inquiries')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {active === 'inquiries' && !editing ? (
                  <label className="text-sm">
                    Idioma de la solicitud
                    <select
                      name="locale"
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      <option value="EN">English</option>
                      <option value="ES">Español</option>
                    </select>
                  </label>
                ) : null}
                {active === 'opportunities' ? (
                  <label className="text-sm">
                    Contacto (opcional)
                    <select
                      name="contactId"
                      defaultValue={text(editing?.contactId)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      <option value="">Sin contacto</option>
                      {contactOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {[text(item.firstName), text(item.lastName)].filter(Boolean).join(' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {active === 'opportunities' ? (
                  <label className="text-sm">
                    Responsable (opcional)
                    <select
                      name="ownerId"
                      defaultValue={text(editing?.ownerId)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                    >
                      <option value="">Sin responsable</option>
                      {lookups.owners.map((item) => (
                        <option key={item.id} value={item.id}>
                          {text(item.fullName) || text(item.email)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {active === 'activities' && !editing ? (
                  <>
                    <label className="text-sm">
                      Empresa (opcional)
                      <select
                        name="companyId"
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.companies.map((item) => (
                          <option key={item.id} value={item.id}>
                            {text(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Oportunidad (opcional)
                      <select
                        name="opportunityId"
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.opportunities.map((item) => (
                          <option key={item.id} value={item.id}>
                            {text(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Solicitud (opcional)
                      <select
                        name="inquiryId"
                        defaultValue={activityInquiryId}
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      >
                        <option value="">Sin vínculo</option>
                        {lookups.inquiries.map((item) => (
                          <option key={item.id} value={item.id}>
                            {labelFor(item, 'inquiries')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {fields.map((field) => (
                  <label
                    key={field.name}
                    className={`text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
                  >
                    {field.label}
                    {field.type === 'textarea' ? (
                      <textarea
                        name={field.name}
                        required={field.required}
                        maxLength={field.maxLength}
                        defaultValue={text(editing?.[field.name])}
                        className="mt-1 min-h-28 w-full rounded-lg border border-line bg-canvas p-3"
                      />
                    ) : (
                      <input
                        name={field.name}
                        type={field.type ?? 'text'}
                        required={field.required}
                        maxLength={field.maxLength}
                        step={field.type === 'number' ? 'any' : undefined}
                        defaultValue={text(editing?.[field.name])}
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                      />
                    )}
                  </label>
                ))}
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    disabled={
                      busy ||
                      (active === 'contacts' && !selectedCompany && !editing) ||
                      (active === 'opportunities' && !selectedCompany && !editing)
                    }
                    className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormOpen(false);
                      setEditing(null);
                    }}
                    className="min-h-11 rounded-lg border border-line px-4 text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
            <section className="rounded-2xl border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
                <label className="sr-only" htmlFor="crm-search">
                  Buscar registros
                </label>
                <input
                  id="crm-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar…"
                  className="min-h-11 w-full max-w-md rounded-lg border border-line bg-canvas px-3 text-sm"
                />
                {active === 'companies' ? (
                  <>
                    <label className="sr-only" htmlFor="company-country-filter">
                      Filtrar por país (código ISO de dos letras)
                    </label>
                    <input
                      id="company-country-filter"
                      value={companyCountryFilter}
                      onChange={(event) => {
                        setCompanyCountryFilter(event.target.value.slice(0, 2).toUpperCase());
                        setPage(1);
                      }}
                      placeholder="País (ej. US)"
                      maxLength={2}
                      pattern="[A-Za-z]{2}"
                      className="min-h-11 w-full max-w-40 rounded-lg border border-line bg-canvas px-3 text-sm"
                    />
                  </>
                ) : null}
                {active === 'inquiries' ? (
                  <>
                    <label className="sr-only" htmlFor="inquiry-filter">
                      Filtrar por estado
                    </label>
                    <select
                      id="inquiry-filter"
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value);
                        setPage(1);
                      }}
                      className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm"
                    >
                      <option value="">Todos los estados</option>
                      {inquiryStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="inquiry-sort">
                      Ordenar solicitudes
                    </label>
                    <select
                      id="inquiry-sort"
                      value={inquirySort}
                      onChange={(event) => {
                        setInquirySort(event.target.value);
                        setPage(1);
                      }}
                      className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm"
                    >
                      <option value="createdAt:desc">Más recientes</option>
                      <option value="createdAt:asc">Más antiguas</option>
                      <option value="companyName:asc">Empresa A–Z</option>
                      <option value="contactName:asc">Contacto A–Z</option>
                      <option value="status:asc">Estado A–Z</option>
                    </select>
                  </>
                ) : null}
                <span className="text-xs text-ink-muted">{result.total} registros</span>
              </div>
              {listLoading ? (
                <p role="status" className="p-4 text-sm text-ink-muted">
                  Cargando registros…
                </p>
              ) : active === 'contacts' && !selectedCompany ? (
                <div className="p-8 text-sm text-ink-muted">
                  Selecciona una empresa para consultar contactos.
                </div>
              ) : records.length === 0 ? (
                <div className="p-10 text-center">
                  <h3 className="font-semibold">Sin registros</h3>
                  <p className="mt-2 text-sm text-ink-muted">
                    No hay datos que mostrar. Crea el primer registro cuando el almacenamiento CRM
                    esté habilitado.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-4 py-3">Registro</th>
                        <th className="px-4 py-3">Estado / etapa</th>
                        <th className="px-4 py-3">Actualizado</th>
                        <th className="px-4 py-3">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {records.map((record) => (
                        <tr key={record.id}>
                          <td className="px-4 py-4">
                            <button
                              className="font-semibold text-brand underline-offset-2 hover:underline"
                              onClick={() => void openDetail(record)}
                            >
                              {labelFor(record, active)}
                            </button>
                            <p className="mt-1 max-w-xl truncate text-xs text-ink-muted">
                              {text(record.email) || text(record.message) || text(record.industry)}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            {active === 'inquiries' ? (
                              <select
                                aria-label="Estado de solicitud"
                                disabled={busy}
                                value={text(record.status)}
                                onChange={(event) =>
                                  void updateStatus(record.id, event.target.value)
                                }
                                className="rounded-lg border border-line bg-canvas px-2 py-2"
                              >
                                {inquiryStatuses.map((status) => (
                                  <option key={status}>{status}</option>
                                ))}
                              </select>
                            ) : active === 'opportunities' ? (
                              <select
                                aria-label="Etapa de oportunidad"
                                value={text(record.stage)}
                                onChange={(event) =>
                                  void crmRequest(`opportunities/${record.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ stage: event.target.value }),
                                  })
                                    .then(() => loadList())
                                    .catch(handleFailure)
                                }
                                className="rounded-lg border border-line bg-canvas px-2 py-2"
                              >
                                {opportunityStages.map((stage) => (
                                  <option key={stage}>{stage}</option>
                                ))}
                              </select>
                            ) : active === 'activities' && record.type === 'TASK' ? (
                              <select
                                aria-label="Estado de tarea"
                                value={text(record.taskStatus)}
                                onChange={(event) =>
                                  void crmRequest(`activities/${record.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ taskStatus: event.target.value }),
                                  })
                                    .then(() => loadList())
                                    .catch(handleFailure)
                                }
                                className="rounded-lg border border-line bg-canvas px-2 py-2"
                              >
                                <option>OPEN</option>
                                <option>COMPLETED</option>
                                <option>CANCELED</option>
                              </select>
                            ) : (
                              <span>
                                {text(record.stage) ||
                                  text(record.type) ||
                                  text(record.countryCode) ||
                                  '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-ink-muted">
                            {text(record.updatedAt)
                              ? new Date(text(record.updatedAt)).toLocaleDateString()
                              : text(record.createdAt)
                                ? new Date(text(record.createdAt)).toLocaleDateString()
                                : '—'}
                          </td>
                          <td className="px-4 py-4">
                            {['companies', 'contacts', 'opportunities'].includes(active) ? (
                              <button
                                onClick={() => void archive(record)}
                                disabled={busy}
                                className="text-xs text-danger underline"
                              >
                                Archivar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.total > result.pageSize ? (
                <div className="flex items-center justify-between border-t border-line p-4 text-sm">
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-line px-3 py-2 disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-line px-3 py-2 disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
            {detail ? (
              <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                      Detalle
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">{labelFor(detail, active)}</h3>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    aria-label="Cerrar detalle"
                    className="rounded-lg border border-line px-3 py-2"
                  >
                    ×
                  </button>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {Object.entries(detail)
                    .filter(
                      ([key, value]) =>
                        ![
                          'id',
                          'company',
                          'contact',
                          'opportunity',
                          'activities',
                          'createdBy',
                          'author',
                          'updatedAt',
                        ].includes(key) &&
                        (typeof value === 'string' || typeof value === 'number'),
                    )
                    .map(([key, value]) => (
                      <div key={key} className="rounded-lg bg-canvas p-3">
                        <dt className="text-xs text-ink-muted">{key}</dt>
                        <dd className="mt-1 break-words text-sm">
                          {key === 'email' && typeof value === 'string' ? (
                            <a
                              href={`mailto:${encodeURIComponent(value)}`}
                              className="text-brand underline"
                            >
                              {value}
                            </a>
                          ) : (
                            text(value)
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
                {active === 'inquiries' ? (
                  <>
                    <p className="mt-3 text-sm text-ink-muted">
                      Vincular registros conserva intacto el snapshot original de la solicitud.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="text-sm">
                        Empresa
                        <select
                          value={linkCompanyId}
                          onChange={(event) => void changeLinkCompany(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                        >
                          <option value="">Sin vincular</option>
                          {lookups.companies.map((item) => (
                            <option key={item.id} value={item.id}>
                              {text(item.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Contacto
                        <select
                          value={linkContactId}
                          onChange={(event) => setLinkContactId(event.target.value)}
                          disabled={!linkCompanyId}
                          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                        >
                          <option value="">Sin vincular</option>
                          {contactOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {[text(item.firstName), text(item.lastName)]
                                .filter(Boolean)
                                .join(' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Oportunidad
                        <select
                          value={linkOpportunityId}
                          onChange={(event) => setLinkOpportunityId(event.target.value)}
                          disabled={!linkCompanyId}
                          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
                        >
                          <option value="">Sin vincular</option>
                          {lookups.opportunities
                            .filter(
                              (item) =>
                                (item.company as { id?: string } | undefined)?.id ===
                                  linkCompanyId || item.companyId === linkCompanyId,
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {text(item.name)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={busy}
                        onClick={() => void saveInquiryLinks()}
                        className="min-h-10 rounded-lg border border-line px-3 text-sm"
                      >
                        Guardar vínculos
                      </button>
                      <button
                        onClick={() => startInquiryFollowUp(detail.id)}
                        className="min-h-10 rounded-lg border border-line px-3 text-sm"
                      >
                        Registrar seguimiento
                      </button>
                    </div>
                  </>
                ) : null}
                {active === 'companies' && Array.isArray(detail.contacts) ? (
                  <div className="mt-5">
                    <h4 className="font-semibold">Contactos</h4>
                    <ul className="mt-2 space-y-1 text-sm">
                      {(detail.contacts as CrmRecord[]).map((contact) => (
                        <li key={contact.id}>
                          {[text(contact.firstName), text(contact.lastName)]
                            .filter(Boolean)
                            .join(' ')}{' '}
                          · {text(contact.email)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {active === 'companies' || active === 'contacts' || active === 'opportunities' ? (
                  <button
                    onClick={() => {
                      setEditing(detail);
                      setFormOpen(true);
                      setSelectedCompany(text(detail.companyId));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="mt-5 min-h-10 rounded-lg border border-line px-3 text-sm"
                  >
                    Editar
                  </button>
                ) : null}
                {text(detail.email) ? (
                  <p className="mt-4 text-xs text-ink-muted">
                    El correo abre tu aplicación mediante mailto. SafeGuard no envía ni registra el
                    envío.
                  </p>
                ) : null}
              </section>
            ) : null}
            <footer className="mt-8 border-t border-line pt-5 text-xs text-ink-muted">
              CRM interno SafeGuard · almacenamiento sujeto a migración aditiva pendiente de
              aprobación. Sin actividad ficticia ni datos de demostración.
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
