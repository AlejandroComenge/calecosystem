/**
 * @calecosystem/generator
 *
 * Modulo principal del ecosistema: convierte una descripcion de negocio en
 * lenguaje natural en un proyecto completo (frontend, backend y despliegue),
 * dejando por escrito cada decision de arquitectura.
 */
export { CodeGenerator, type GeneratorOptions } from './generator.ts';
export { RequirementsAnalyzer, type AnalyzerOptions } from './analysis/requirements-analyzer.ts';
export { ArchitecturePlanner, type PlannerOptions } from './planning/architecture-planner.ts';
export {
  Scaffolder,
  type ScaffolderOptions,
  type ScaffoldOutcome,
} from './scaffold/scaffolder.ts';
export {
  generatorPlugin,
  type GeneratorPluginOptions,
  type SupportedFramework,
  type SupportedTemplate,
} from './plugin.ts';

export { reactAdapter } from './scaffold/frontend/react.ts';
export { vueAdapter } from './scaffold/frontend/vue.ts';
export { angularAdapter } from './scaffold/frontend/angular.ts';
export { nodeApiAdapter } from './scaffold/backend/node-api.ts';
export { dockerDeploymentAdapter } from './scaffold/deployment/docker.ts';
export {
  vercelDeploymentAdapter,
  netlifyDeploymentAdapter,
} from './scaffold/deployment/edge.ts';

export { reactComponentRenderer, componentBarrel, propType } from './components/renderer.ts';
export { uiKit } from './components/ui-kit.ts';
export { domainComponents, editableFields } from './components/domain.ts';

export { ecommerceTemplate } from './templates/ecommerce.ts';
export { saasTemplate } from './templates/saas.ts';
export { landingTemplate } from './templates/landing.ts';
export { scoreTemplate, type DetectionRules } from './templates/detect.ts';

export * as text from './analysis/text.ts';
export * from './analysis/lexicon.ts';
