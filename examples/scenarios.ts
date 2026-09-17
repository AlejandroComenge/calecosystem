/**
 * Catalogo de ejemplos: un enunciado realista por tipo de web.
 *
 * Fuente unica de verdad. Lo usan el validador (`npm run validate`), la guia
 * de pruebas, el comando `calec examples` y la demo comercial. Si un ejemplo
 * deja de funcionar, el validador lo detecta antes que un cliente.
 *
 * Los enunciados estan escritos como los escribiria un responsable de
 * producto, no como una especificacion tecnica: es el caso de uso real.
 */
import type { FrontendFramework, TemplateKind } from '@calecosystem/contracts';

export interface Scenario {
  /** Identificador corto para la linea de comandos. */
  readonly id: string;
  readonly title: string;
  /** Para quien es este tipo de web. */
  readonly audience: string;
  readonly brief: string;
  /** Plantilla que deberia detectarse. `null` = ninguna (CRUD deducido). */
  readonly expectTemplate: TemplateKind | null;
  /** Capacidades que el analizador deberia detectar. */
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
      'Tienda online de ceramica artesanal. Los clientes navegan el catalogo, anaden ' +
      'productos al carrito y pagan con Stripe en el checkout. Hay valoraciones de ' +
      'productos, login de usuarios con roles y un panel de administracion para ' +
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
    title: 'Aplicacion SaaS por suscripcion',
    audience: 'Productos que se venden como servicio mensual',
    brief:
      'Plataforma SaaS multiempresa para gestion de proyectos. Cada organizacion tiene ' +
      'su espacio de trabajo con usuarios y roles, proyectos y tareas. Hay suscripciones ' +
      'mensuales con planes de distinta cuota, facturacion y un panel con metricas de uso.',
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
    title: 'Landing de captacion',
    audience: 'Lanzamientos de producto y campanas de marketing',
    brief:
      'Landing de captacion para el lanzamiento de una app de fitness. Pagina unica con ' +
      'secciones de venta, formulario de contacto para recoger leads y buen posicionamiento ' +
      'SEO. Queremos medir la conversion de la campana.',
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
    title: 'Panel interno de gestion',
    audience: 'Equipos que gestionan datos de negocio a diario',
    brief:
      'Panel interno para gestionar pedidos, productos, clientes y facturas. Los empleados ' +
      'entran con usuario y contrasena, hay roles de administrador y operador, busqueda con ' +
      'filtros y exportacion de informes.',
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
    audience: 'Clinicas, restaurantes, hoteles y centros deportivos',
    brief:
      'Plataforma de reservas para clinicas dentales. Los pacientes piden citas con los ' +
      'medicos desde la web, con login de usuarios y roles. Hay pagos online, recordatorios ' +
      'por email y un panel de administracion para gestionar citas y pacientes.',
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
      'Portal de contenidos con publicaciones, categorias y comentarios. Hay autores con ' +
      'roles, buscador de articulos, panel de administracion para publicar y buen SEO para ' +
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
      'Tienda online de productos artesanales con catalogo, pedidos, clientes, login de ' +
      'usuarios y pagos. El frontend debe hacerse en vue.',
    // Las plantillas solo generan React hoy: con Vue se obtiene el CRUD
    // deducido. Esta limitacion esta declarada, no escondida.
    expectTemplate: null,
    expectFeatures: ['auth', 'payments'],
    expectFiles: ['apps/web/src/App.vue', 'apps/web/src/router/index.ts'],
    framework: 'vue',
  },
  {
    id: 'panel-angular',
    title: 'Panel de gestion generado en Angular',
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
