import type {
  Blueprint,
  ProjectTemplate,
  RequirementsModel,
  ScaffoldContext,
  TemplateMatch,
  VirtualFile,
} from '@calecosystem/contracts';
import { fileFactory } from '../scaffold/shared.ts';
import { scoreTemplate } from './detect.ts';
import { addEndpoints, addPages, ensureEntity, recordTemplateDecision } from './shared.ts';

const TOOL = 'calec.template.saas';
const file = fileFactory(TOOL);

/**
 * Plantilla de SaaS por suscripcion.
 *
 * Lo que distingue a un SaaS de un CRUD con login no son las pantallas: es el
 * limite del inquilino y el estado de la suscripcion. Ambas cosas hay que
 * ponerlas el primer dia, porque anadirlas despues obliga a revisar cada
 * consulta del sistema.
 */
export const saasTemplate: ProjectTemplate = {
  id: 'calec.template.saas',
  name: 'SaaS por suscripcion',
  description: 'Organizaciones, planes, suscripciones, panel y facturacion.',
  kind: 'saas',
  tier: 'community',
  frameworks: ['react'],

  detect(requirements: RequirementsModel): TemplateMatch {
    return scoreTemplate(requirements, {
      signals: [
        'saas', 'suscripcion', 'suscripciones', 'multiempresa', 'multi tenant',
        'multitenant', 'organizaciones', 'workspaces', 'planes', 'cuota',
        'facturacion recurrente', 'panel de control',
      ],
      entities: ['Organization', 'Subscription', 'Plan', 'User'],
      features: ['multiTenant', 'payments', 'analytics'],
      antiSignals: ['carrito', 'catalogo de productos'],
    });
  },

  refine(blueprint: Blueprint): Blueprint {
    let refined = ensureEntity(blueprint, 'Organization');
    refined = ensureEntity(refined, 'Plan');
    refined = ensureEntity(refined, 'Subscription');
    refined = ensureEntity(refined, 'User');

    refined = addPages(refined, [
      { route: '/dashboard', name: 'Dashboard', kind: 'dashboard', entity: null, requiresAuth: true },
      { route: '/pricing', name: 'Pricing', kind: 'static', entity: 'Plan', requiresAuth: false },
      { route: '/settings/billing', name: 'Billing', kind: 'form', entity: 'Subscription', requiresAuth: true },
      { route: '/settings/team', name: 'Team', kind: 'list', entity: 'User', requiresAuth: true },
    ]);

    refined = addEndpoints(refined, [
      {
        method: 'GET',
        path: '/api/me/subscription',
        summary: 'Plan y consumo de la organizacion actual',
        entity: 'Subscription',
        requiresAuth: true,
      },
      {
        method: 'POST',
        path: '/api/billing/checkout',
        summary: 'Inicia el cambio de plan',
        entity: 'Subscription',
        requiresAuth: true,
      },
    ]);

    refined = {
      ...refined,
      risks: [
        ...refined.risks,
        {
          id: 'RISK-TENANT-QUERY',
          title: 'Consulta sin filtro de organizacion',
          impact: 'high',
          mitigation:
            'El identificador de organizacion es obligatorio en la firma del repositorio, no un parametro opcional.',
          owner: 'security',
        },
      ],
    };

    return recordTemplateDecision(
      refined,
      'SaaS por suscripcion',
      'organizaciones, planes, suscripciones y aislamiento por inquilino',
    );
  },

  scaffold({ dependencies }: ScaffoldContext): VirtualFile[] {
    dependencies.contribute({
      workspace: 'api',
      requestedBy: TOOL,
      scripts: { 'db:seed:plans': 'node src/scripts/seed-plans.ts' },
    });

    return [
      file('apps/web/src/features/billing/PlanSelector.tsx', planSelector()),
      file('apps/web/src/pages/PricingPage.tsx', pricingPage()),
      file('apps/web/src/pages/DashboardPage.tsx', dashboardPage()),
      file('apps/api/src/domain/Tenant.ts', tenantDomain()),
      file('apps/api/src/domain/Tenant.test.ts', tenantDomainTest()),
      file('apps/api/src/application/TenantScope.ts', tenantScope()),
    ];
  },
};

function planSelector(): string {
  return [
    "import { Button } from '../../components/ui/Button.tsx';",
    "import { Card } from '../../components/ui/Card.tsx';",
    '',
    'export interface Plan {',
    '  id: string;',
    '  name: string;',
    '  priceMonthly: number;',
    '  features: readonly string[];',
    '}',
    '',
    'export interface PlanSelectorProps {',
    '  plans: readonly Plan[];',
    '  currentPlanId?: string;',
    '  onSelect(planId: string): void;',
    '}',
    '',
    "const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });",
    '',
    'export function PlanSelector({ plans, currentPlanId, onSelect }: PlanSelectorProps) {',
    '  return (',
    '    <ul className="grid gap-4 md:grid-cols-3">',
    '      {plans.map((plan) => {',
    '        const current = plan.id === currentPlanId;',
    '        return (',
    '          <li key={plan.id}>',
    '            <Card title={plan.name}>',
    '              <p className="mb-3 text-2xl font-semibold">',
    '                {currency.format(plan.priceMonthly)}',
    '                <span className="text-sm font-normal text-slate-500"> /mes</span>',
    '              </p>',
    '              <ul className="mb-4 flex flex-col gap-1 text-sm text-slate-600">',
    '                {plan.features.map((feature) => (',
    '                  <li key={feature}>{feature}</li>',
    '                ))}',
    '              </ul>',
    '              <Button',
    "                variant={current ? 'secondary' : 'primary'}",
    '                disabled={current}',
    '                onClick={() => onSelect(plan.id)}',
    '              >',
    "                {current ? 'Plan actual' : 'Cambiar a este plan'}",
    '              </Button>',
    '            </Card>',
    '          </li>',
    '        );',
    '      })}',
    '    </ul>',
    '  );',
    '}',
  ].join('\n');
}

function pricingPage(): string {
  return [
    "import { useEffect, useState } from 'react';",
    "import { apiFetch } from '../api/client.ts';",
    "import { PlanSelector, type Plan } from '../features/billing/PlanSelector.tsx';",
    "import { Alert } from '../components/ui/Alert.tsx';",
    '',
    'interface CheckoutResponse {',
    '  url: string;',
    '}',
    '',
    'export function PricingPage() {',
    '  const [plans, setPlans] = useState<Plan[]>([]);',
    '  const [error, setError] = useState<string | null>(null);',
    '',
    '  useEffect(() => {',
    "    apiFetch<Plan[]>('/plans').then(setPlans).catch((cause: unknown) => setError(String(cause)));",
    '  }, []);',
    '',
    '  const select = async (planId: string) => {',
    '    try {',
    "      const session = await apiFetch<CheckoutResponse>('/billing/checkout', {",
    "        method: 'POST',",
    '        body: JSON.stringify({ planId }),',
    '      });',
    '      window.location.assign(session.url);',
    '    } catch (cause) {',
    '      setError(cause instanceof Error ? cause.message : String(cause));',
    '    }',
    '  };',
    '',
    '  return (',
    '    <section>',
    '      <h1 className="mb-4 text-xl font-semibold">Planes</h1>',
    '      {error && <Alert tone="error">{error}</Alert>}',
    '      <PlanSelector plans={plans} onSelect={select} />',
    '    </section>',
    '  );',
    '}',
  ].join('\n');
}

function dashboardPage(): string {
  return [
    "import { useEffect, useState } from 'react';",
    "import { apiFetch } from '../api/client.ts';",
    "import { Card } from '../components/ui/Card.tsx';",
    "import { Spinner } from '../components/ui/Spinner.tsx';",
    '',
    'interface SubscriptionSummary {',
    '  planName: string;',
    '  status: string;',
    '  renewsAt: string;',
    '  usage: { used: number; limit: number | null };',
    '}',
    '',
    'export function DashboardPage() {',
    '  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);',
    '',
    '  useEffect(() => {',
    "    apiFetch<SubscriptionSummary>('/me/subscription').then(setSummary).catch(() => setSummary(null));",
    '  }, []);',
    '',
    '  if (!summary) return <Spinner label="Cargando panel" />;',
    '',
    '  const percentage =',
    '    summary.usage.limit === null',
    '      ? 0',
    '      : Math.min(100, Math.round((summary.usage.used / summary.usage.limit) * 100));',
    '',
    '  return (',
    '    <section className="grid gap-4 md:grid-cols-2">',
    '      <Card title="Suscripcion">',
    '        <p className="text-sm text-slate-600">Plan: {summary.planName}</p>',
    '        <p className="text-sm text-slate-600">Estado: {summary.status}</p>',
    '        <p className="text-sm text-slate-600">Renueva: {summary.renewsAt}</p>',
    '      </Card>',
    '      <Card title="Consumo del periodo">',
    '        <p className="mb-2 text-sm text-slate-600">',
    "          {summary.usage.used} de {summary.usage.limit ?? 'sin limite'}",
    '        </p>',
    '        <div className="h-2 w-full rounded bg-slate-100" role="progressbar" aria-valuenow={percentage}>',
    "          <div className=\"h-2 rounded bg-slate-900\" style={{ width: percentage + '%' }} />",
    '        </div>',
    '      </Card>',
    '    </section>',
    '  );',
    '}',
  ].join('\n');
}

function tenantDomain(): string {
  return [
    '/**',
    ' * Limite del inquilino.',
    ' *',
    ' * Un SaaS multiempresa tiene un unico fallo catastrofico: devolver datos de',
    ' * otra organizacion. Estas funciones existen para que ese fallo sea',
    ' * imposible de cometer por descuido y facil de detectar en una prueba.',
    ' */',
    '',
    'export interface TenantOwned {',
    '  organizationId: string;',
    '}',
    '',
    'export class TenantIsolationError extends Error {',
    '  constructor(expected: string, actual: string) {',
    "    super('Acceso cruzado entre organizaciones: se esperaba ' + expected + ' y llego ' + actual);",
    "    this.name = 'TenantIsolationError';",
    '  }',
    '}',
    '',
    '/** Falla en vez de devolver el recurso de otra organizacion. */',
    'export function assertSameTenant<T extends TenantOwned>(resource: T, organizationId: string): T {',
    '  if (resource.organizationId !== organizationId) {',
    '    throw new TenantIsolationError(organizationId, resource.organizationId);',
    '  }',
    '  return resource;',
    '}',
    '',
    '/** Filtra una coleccion dejando solo lo que pertenece a la organizacion. */',
    'export function onlyTenant<T extends TenantOwned>(',
    '  resources: readonly T[],',
    '  organizationId: string,',
    '): T[] {',
    '  return resources.filter((resource) => resource.organizationId === organizationId);',
    '}',
  ].join('\n');
}

function tenantDomainTest(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { TenantIsolationError, assertSameTenant, onlyTenant } from './Tenant.ts';",
    '',
    "test('deja pasar un recurso de la misma organizacion', () => {",
    "  const resource = { organizationId: 'org-1' };",
    "  assert.equal(assertSameTenant(resource, 'org-1'), resource);",
    '});',
    '',
    "test('rechaza un recurso de otra organizacion', () => {",
    "  assert.throws(() => assertSameTenant({ organizationId: 'org-2' }, 'org-1'), TenantIsolationError);",
    '});',
    '',
    "test('el filtro no deja pasar datos ajenos', () => {",
    "  const rows = [{ organizationId: 'org-1' }, { organizationId: 'org-2' }];",
    "  assert.deepEqual(onlyTenant(rows, 'org-1'), [{ organizationId: 'org-1' }]);",
    '});',
  ].join('\n');
}

function tenantScope(): string {
  return [
    "import { assertSameTenant, type TenantOwned } from '../domain/Tenant.ts';",
    '',
    '/**',
    ' * Envoltura de repositorio con el inquilino ya fijado.',
    ' *',
    ' * El identificador de organizacion se pasa en el constructor, no en cada',
    ' * llamada: asi olvidarlo es un error de compilacion y no una fuga de datos.',
    ' */',
    'export class TenantScope {',
    '  readonly #organizationId: string;',
    '',
    '  constructor(organizationId: string) {',
    '    if (!organizationId) {',
    "      throw new Error('TenantScope requiere un identificador de organizacion.');",
    '    }',
    '    this.#organizationId = organizationId;',
    '  }',
    '',
    '  get organizationId(): string {',
    '    return this.#organizationId;',
    '  }',
    '',
    '  guard<T extends TenantOwned>(resource: T): T {',
    '    return assertSameTenant(resource, this.#organizationId);',
    '  }',
    '',
    '  filter<T extends TenantOwned>(resources: readonly T[]): T[] {',
    '    return resources.filter((resource) => resource.organizationId === this.#organizationId);',
    '  }',
    '}',
  ].join('\n');
}
