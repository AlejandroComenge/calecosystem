import type {
  Blueprint,
  ProjectTemplate,
  RequirementsModel,
  ScaffoldContext,
  TemplateMatch,
  VirtualFile,
} from '@calecosystem/contracts';
import { fileFactory } from '../scaffold/shared.ts';
import { scoreTemplate, type DetectionRules } from './detect.ts';
import { addEndpoints, addPages, ensureEntity, recordTemplateDecision } from './shared.ts';

const TOOL = 'calec.template.landing';
const file = fileFactory(TOOL);

/**
 * Plantilla de página de captación.
 *
 * Aquí el trabajo no es generar mucho, es generar poco y rápido. Una landing
 * se mide en conversion y tiempo de carga, así que la plantilla evita estado
 * global, enrutado innecesario y cualquier dependencia que no se vea en
 * pantalla.
 */
/**
 * Reglas de deteccion, expuestas para poder inspeccionarlas y probarlas.
 *
 * Los terminos se comparan contra el resumen NORMALIZADO, asi que no
 * pueden llevar tildes: una senal acentuada no casaria nunca y el fallo
 * seria silencioso. Hay una prueba que lo verifica.
 */
export const LANDING_RULES: DetectionRules = {
  signals: [
    'landing', 'pagina de aterrizaje', 'captacion', 'leads', 'lead',
    'formulario de contacto', 'pagina promocional', 'micrositio',
    'campana', 'lanzamiento', 'lista de espera',
  ],
  entities: ['Lead', 'Campaign'],
  features: ['seo'],
  antiSignals: ['carrito', 'panel de administracion', 'suscripcion', 'multiempresa'],
  };

export const landingTemplate: ProjectTemplate = {
  id: 'calec.template.landing',
  name: 'Landing de captación',
  description: 'Página única con secciones de venta y formulario de contacto.',
  kind: 'landing',
  tier: 'community',
  frameworks: ['react'],

  detect(requirements: RequirementsModel): TemplateMatch {
    return scoreTemplate(requirements, LANDING_RULES);
  },

  refine(blueprint: Blueprint): Blueprint {
    let refined = ensureEntity(blueprint, 'Lead', [
      { name: 'id', type: 'uuid', required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'name', type: 'string', required: false },
      { name: 'message', type: 'text', required: false },
      { name: 'source', type: 'string', required: false, description: 'Campaña o medio de origen' },
      { name: 'createdAt', type: 'datetime', required: true },
      { name: 'updatedAt', type: 'datetime', required: true },
    ]);

    refined = addPages(refined, [
      { route: '/', name: 'Landing', kind: 'static', entity: null, requiresAuth: false },
      { route: '/gracias', name: 'ThankYou', kind: 'static', entity: null, requiresAuth: false },
    ]);

    refined = addEndpoints(refined, [
      {
        method: 'POST',
        path: '/api/leads',
        summary: 'Registra un contacto del formulario',
        entity: 'Lead',
        requiresAuth: false,
      },
    ]);

    // Un formulario público sin protección se llena de spam en días.
    refined = {
      ...refined,
      risks: [
        ...refined.risks,
        {
          id: 'RISK-LEAD-SPAM',
          title: 'Formulario público sin protección frente a envios automatizados',
          impact: 'medium',
          mitigation:
            'Limitar por IP, añadir campo trampa y verificar el correo antes de dar el contacto por bueno.',
          owner: 'security',
        },
      ],
    };

    return recordTemplateDecision(
      refined,
      'Landing de captación',
      'secciones de venta, formulario de contacto y metadatos para buscadores',
    );
  },

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const root = 'apps/web/src';
    return [
      file(`${root}/features/landing/Hero.tsx`, hero(blueprint.projectName)),
      file(`${root}/features/landing/FeatureList.tsx`, featureList()),
      file(`${root}/features/landing/LeadForm.tsx`, leadForm()),
      file(`${root}/pages/LandingPage.tsx`, landingPage(blueprint.projectName)),
      file('apps/api/src/domain/Lead.validation.ts', leadValidation()),
      file('apps/api/src/domain/Lead.validation.test.ts', leadValidationTest()),
    ];
  },
};

function hero(projectName: string): string {
  return [
    "import type { ReactNode } from 'react';",
    '',
    'export interface HeroProps {',
    '  headline?: string;',
    '  subheadline?: string;',
    '  action?: ReactNode;',
    '}',
    '',
    '/** Primera pantalla. Un solo mensaje y una sola acción. */',
    'export function Hero({',
    `  headline = '${projectName}',`,
    "  subheadline = 'Explica en una frase que problema resuelves y para quien.',",
    '  action,',
    '}: HeroProps) {',
    '  return (',
    '    <header className="flex flex-col items-center gap-4 px-4 py-20 text-center">',
    '      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">{headline}</h1>',
    '      <p className="max-w-xl text-lg text-slate-600">{subheadline}</p>',
    '      {action}',
    '    </header>',
    '  );',
    '}',
  ].join('\n');
}

function featureList(): string {
  return [
    'export interface Feature {',
    '  title: string;',
    '  description: string;',
    '}',
    '',
    'export interface FeatureListProps {',
    '  features: readonly Feature[];',
    '}',
    '',
    '/** Tres beneficios. Más de tres y no se lee ninguno. */',
    'export function FeatureList({ features }: FeatureListProps) {',
    '  return (',
    '    <section className="mx-auto grid max-w-4xl gap-6 px-4 py-12 sm:grid-cols-3">',
    '      {features.map((feature) => (',
    '        <article key={feature.title}>',
    '          <h2 className="mb-1 text-base font-semibold">{feature.title}</h2>',
    '          <p className="text-sm text-slate-600">{feature.description}</p>',
    '        </article>',
    '      ))}',
    '    </section>',
    '  );',
    '}',
  ].join('\n');
}

function leadForm(): string {
  return [
    "import { useState } from 'react';",
    "import { apiFetch } from '../../api/client.ts';",
    "import { Alert } from '../../components/ui/Alert.tsx';",
    "import { Button } from '../../components/ui/Button.tsx';",
    "import { Input } from '../../components/ui/Input.tsx';",
    '',
    'export interface LeadFormProps {',
    '  source?: string;',
    '  onSuccess?(): void;',
    '}',
    '',
    "export function LeadForm({ source = 'landing', onSuccess }: LeadFormProps) {",
    "  const [email, setEmail] = useState('');",
    "  const [name, setName] = useState('');",
    "  const [website, setWebsite] = useState('');",
    '  const [state, setState] = useState<\'idle\' | \'sending\' | \'sent\' | \'error\'>(\'idle\');',
    '',
    '  const submit = async (event: React.FormEvent) => {',
    '    event.preventDefault();',
    '',
    '    // Campo trampa: invisible para una persona, irresistible para un bot.',
    "    if (website !== '') {",
    "      setState('sent');",
    '      return;',
    '    }',
    '',
    "    setState('sending');",
    '    try {',
    "      await apiFetch('/leads', {",
    "        method: 'POST',",
    '        body: JSON.stringify({ email, name, source }),',
    '      });',
    "      setState('sent');",
    '      onSuccess?.();',
    '    } catch {',
    "      setState('error');",
    '    }',
    '  };',
    '',
    "  if (state === 'sent') {",
    '    return <Alert tone="success">Gracias. Te escribiremos en breve.</Alert>;',
    '  }',
    '',
    '  return (',
    '    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-3">',
    "      {state === 'error' && <Alert tone=\"error\">No se pudo enviar. Intentalo de nuevo.</Alert>}",
    '      <Input id="lead-name" label="Nombre" value={name} onChange={setName} />',
    '      <Input id="lead-email" label="Email" type="email" required value={email} onChange={setEmail} />',
    '      <div aria-hidden="true" className="hidden">',
    '        <label htmlFor="lead-website">No rellenar</label>',
    '        <input',
    '          id="lead-website"',
    '          tabIndex={-1}',
    '          autoComplete="off"',
    '          value={website}',
    '          onChange={(event) => setWebsite(event.target.value)}',
    '        />',
    '      </div>',
    "      <Button type=\"submit\" loading={state === 'sending'}>",
    '        Quiero saber más',
    '      </Button>',
    '    </form>',
    '  );',
    '}',
  ].join('\n');
}

function landingPage(projectName: string): string {
  return [
    "import { useEffect } from 'react';",
    "import { Hero } from '../features/landing/Hero.tsx';",
    "import { FeatureList } from '../features/landing/FeatureList.tsx';",
    "import { LeadForm } from '../features/landing/LeadForm.tsx';",
    '',
    'const features = [',
    "  { title: 'Beneficio uno', description: 'Sustituye por el problema real que resuelves.' },",
    "  { title: 'Beneficio dos', description: 'Habla de resultados, no de caracteristicas.' },",
    "  { title: 'Beneficio tres', description: 'Añade una prueba: un número o un cliente.' },",
    '];',
    '',
    'export function LandingPage() {',
    '  useEffect(() => {',
    '    // Metadatos mínimos para buscadores y para compartir en redes.',
    `    document.title = '${projectName}';`,
    "    const description = document.querySelector('meta[name=\"description\"]');",
    "    description?.setAttribute('content', 'Sustituye por tu propuesta de valor en una frase.');",
    '  }, []);',
    '',
    '  return (',
    '    <main>',
    '      <Hero action={<LeadForm />} />',
    '      <FeatureList features={features} />',
    '    </main>',
    '  );',
    '}',
  ].join('\n');
}

function leadValidation(): string {
  return [
    '/** Validación de contactos entrantes. Pública y por tanto hostil por defecto. */',
    '',
    'export interface LeadInput {',
    '  email?: string;',
    '  name?: string;',
    '  source?: string;',
    '}',
    '',
    '// Deliberadamente permisiva: rechazar correos válidos cuesta clientes.',
    '// La verificación real es el correo de confirmación, no la expresión regular.',
    'const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/;',
    '',
    'export const MAX_NAME_LENGTH = 120;',
    '',
    'export function validateLead(input: LeadInput): string[] {',
    '  const errors: string[] = [];',
    '',
    '  if (!input.email || !EMAIL_PATTERN.test(input.email)) {',
    "    errors.push('email no válido');",
    '  }',
    '  if (input.name && input.name.length > MAX_NAME_LENGTH) {',
    "    errors.push('name demasiado largo');",
    '  }',
    '  return errors;',
    '}',
  ].join('\n');
}

function leadValidationTest(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { MAX_NAME_LENGTH, validateLead } from './Lead.validation.ts';",
    '',
    "test('acepta un contacto válido', () => {",
    "  assert.deepEqual(validateLead({ email: 'ana@example.com', name: 'Ana' }), []);",
    '});',
    '',
    "test('rechaza correos mal formados', () => {",
    "  assert.ok(validateLead({ email: 'sin-arroba' }).length > 0);",
    '  assert.ok(validateLead({}).length > 0);',
    '});',
    '',
    "test('rechaza nombres desmesurados', () => {",
    "  const errors = validateLead({ email: 'ana@example.com', name: 'a'.repeat(MAX_NAME_LENGTH + 1) });",
    "  assert.ok(errors.some((error) => error.includes('name')));",
    '});',
  ].join('\n');
}
