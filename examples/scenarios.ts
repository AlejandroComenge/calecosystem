/**
 * Catálogo de ejemplos: un enunciado realista por tipo de web.
 *
 * Fuente única de verdad. Lo usan el validador (`npm run validate`), la guía
 * de pruebas, el comando `calec examples` y la demo comercial. Si un ejemplo
 * deja de funcionar, el validador lo detecta antes que un cliente.
 *
 * Los enunciados están escritos como los escribiría un responsable de
 * producto, no como una especificación técnica: es el caso de uso real.
 */
import type { FrontendFramework, TemplateKind } from '@calecosystem/contracts';

export interface Scenario {
  /** Identificador corto para la línea de comandos. */
  readonly id: string;
  readonly title: string;
  /** Para quien es este tipo de web. */
  readonly audience: string;
  readonly brief: string;
  /** Plantilla que debería detectarse. `null` = ninguna (CRUD deducido). */
  readonly expectTemplate: TemplateKind | null;
  /** Capacidades que el analizador debería detectar. */
  readonly expectFeatures: readonly string[];
  /** Ficheros que deben existir en el resultado. Son el contrato del ejemplo. */
  readonly expectFiles: readonly string[];
  readonly framework?: FrontendFramework;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'tienda',
    title: 'Tienda online (e-commerce)',
    audience: 'Comercios que venden productos por internet',
    brief:
      'Tienda online de cerámica artesanal. Los clientes navegan el catálogo, añaden ' +
      'productos al carrito y pagan con Stripe en el checkout. Hay valoraciones de ' +
      'productos, login de usuarios con roles y un panel de administración para ' +
      'gestionar pedidos, productos y clientes. Esperamos 20.000 usuarios y cumplimos el RGPD.',
    expectTemplate: 'ecommerce',
    expectFeatures: ['auth', 'payments', 'adminPanel'],
    expectFiles: [
      'apps/web/src/features/cart/CartContext.tsx',
      'apps/web/src/pages/CheckoutPage.tsx',
      'apps/web/src/pages/AdminOrdersPage.tsx',
      'apps/api/src/domain/CartPricing.ts',
      'apps/api/src/application/CheckoutService.ts',
    ],
  },
  {
    id: 'saas',
    title: 'Aplicación SaaS por suscripción',
    audience: 'Productos que se venden como servicio mensual',
    brief:
      'Plataforma SaaS multiempresa para gestión de proyectos. Cada organización tiene ' +
      'su espacio de trabajo con usuarios y roles, proyectos y tareas. Hay suscripciones ' +
      'mensuales con planes de distinta cuota, facturación y un panel con métricas de uso.',
    expectTemplate: 'saas',
    expectFeatures: ['auth', 'multiTenant', 'payments'],
    expectFiles: [
      'apps/web/src/features/billing/PlanSelector.tsx',
      'apps/web/src/pages/PricingPage.tsx',
      'apps/api/src/domain/Tenant.ts',
      'apps/api/src/application/TenantScope.ts',
    ],
  },
  {
    id: 'landing',
    title: 'Landing de captación',
    audience: 'Lanzamientos de producto y campañas de marketing',
    brief:
      'Landing de captación para el lanzamiento de una app de fitness. Página única con ' +
      'secciones de venta, formulario de contacto para recoger leads y buen posicionamiento ' +
      'SEO. Queremos medir la conversión de la campaña.',
    expectTemplate: 'landing',
    expectFeatures: ['seo'],
    expectFiles: [
      'apps/web/src/features/landing/Hero.tsx',
      'apps/web/src/features/landing/LeadForm.tsx',
      'apps/api/src/domain/Lead.validation.ts',
    ],
  },
  {
    id: 'panel',
    title: 'Panel interno de gestión',
    audience: 'Equipos que gestionan datos de negocio a diario',
    brief:
      'Panel interno para gestionar pedidos, productos, clientes y facturas. Los empleados ' +
      'entran con usuario y contraseña, hay roles de administrador y operador, busqueda con ' +
      'filtros y exportación de informes.',
    expectTemplate: null,
    expectFeatures: ['auth', 'roles', 'search'],
    expectFiles: [
      'apps/api/src/domain/Order.ts',
      'apps/api/src/routes/orders.routes.ts',
      'apps/web/src/components/domain/OrderTable.tsx',
      'apps/web/src/components/ui/DataTable.tsx',
    ],
  },
  {
    id: 'reservas',
    title: 'Sistema de reservas',
    audience: 'Clínicas, restaurantes, hoteles y centros deportivos',
    brief:
      'Plataforma de reservas para clínicas dentales. Los pacientes piden citas con los ' +
      'médicos desde la web, con login de usuarios y roles. Hay pagos online, recordatorios ' +
      'por email y un panel de administración para gestionar citas y pacientes.',
    expectTemplate: null,
    expectFeatures: ['auth', 'payments', 'notifications'],
    expectFiles: [
      'apps/api/src/domain/Appointment.ts',
      'apps/api/src/routes/appointments.routes.ts',
      'apps/api/src/routes/auth.routes.ts',
    ],
  },
  {
    id: 'blog',
    title: 'Blog o portal de contenidos',
    audience: 'Medios, marcas con estrategia de contenidos',
    brief:
      'Portal de contenidos con publicaciones, categorías y comentarios. Hay autores con ' +
      'roles, buscador de artículos, panel de administración para publicar y buen SEO para ' +
      'posicionar en Google.',
    expectTemplate: null,
    expectFeatures: ['auth', 'search', 'seo', 'adminPanel'],
    expectFiles: [
      'apps/api/src/domain/Post.ts',
      'apps/api/src/domain/Comment.ts',
      'apps/web/src/components/domain/PostTable.tsx',
    ],
  },
  {
    id: 'tienda-vue',
    title: 'Tienda online generada en Vue',
    audience: 'Equipos que ya trabajan con Vue',
    brief:
      'Tienda online de productos artesanales con catálogo, pedidos, clientes, login de ' +
      'usuarios y pagos. El frontend debe hacerse en vue.',
    // Las plantillas solo generan React hoy: con Vue se obtiene el CRUD
    // deducido. Esta limitación está declarada, no escondida.
    expectTemplate: null,
    expectFeatures: ['auth', 'payments'],
    expectFiles: ['apps/web/src/App.vue', 'apps/web/src/router/index.ts'],
    framework: 'vue',
  },
  {
    id: 'panel-angular',
    title: 'Panel de gestión generado en Angular',
    audience: 'Equipos corporativos que estandarizan en Angular',
    brief:
      'Panel interno para gestionar pedidos, productos y clientes con login de usuarios y ' +
      'roles. El frontend debe hacerse en angular.',
    expectTemplate: null,
    expectFeatures: ['auth', 'roles'],
    expectFiles: ['apps/web/src/app/app.routes.ts', 'apps/web/src/app/core/api.service.ts'],
    framework: 'angular',
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

/** Comando de la CLI listo para copiar y pegar. */
export function commandFor(scenario: Scenario): string {
  const framework = scenario.framework ? ` --framework ${scenario.framework}` : '';
  return `npm run calec -- generate "${scenario.brief.slice(0, 70)}..."${framework} --out ./pruebas/${scenario.id}`;
}
