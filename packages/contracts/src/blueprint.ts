/**
 * Blueprint: la arquitectura decidida, antes de escribir un solo fichero.
 *
 * Separar "decidir" de "escribir" es lo que permite que el optimizador y el
 * auditor de seguridad intervengan sobre las decisiones (baratas de cambiar)
 * en lugar de sobre el codigo ya emitido (caro de cambiar).
 */
import type { DomainEntity, RequirementsModel } from './requirements.ts';

export type FrontendFramework = 'react' | 'vue' | 'angular';
export type BackendRuntime = 'node-fastify' | 'node-express' | 'node-nest';
export type DatabaseEngine = 'postgres' | 'mysql' | 'mongodb' | 'sqlite';
export type StylingSolution = 'tailwind' | 'css-modules' | 'styled-components';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface StackDecision {
  readonly frontend: FrontendFramework;
  readonly backend: BackendRuntime;
  readonly database: DatabaseEngine;
  readonly styling: StylingSolution;
  readonly packageManager: PackageManager;
  readonly language: 'typescript';
}

export interface ArchitectureDecision {
  /** Identificador estable tipo ADR, p.ej. `ADR-FRONTEND`. */
  readonly id: string;
  readonly title: string;
  readonly choice: string;
  readonly rationale: string;
  readonly alternatives: readonly string[];
}

export interface LayerPlan {
  readonly name: string;
  readonly description: string;
  readonly directories: readonly string[];
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiEndpoint {
  readonly method: HttpMethod;
  readonly path: string;
  readonly summary: string;
  readonly entity: string;
  readonly requiresAuth: boolean;
}

export interface PagePlan {
  readonly route: string;
  readonly name: string;
  readonly kind: 'list' | 'detail' | 'form' | 'auth' | 'dashboard' | 'static';
  readonly entity: string | null;
  readonly requiresAuth: boolean;
}

export type DeploymentTarget = 'docker-compose' | 'vercel' | 'aws-ecs' | 'kubernetes';

export interface DeploymentPlan {
  readonly target: DeploymentTarget;
  readonly containerized: boolean;
  readonly ci: 'github-actions';
  readonly environments: readonly string[];
  readonly services: readonly string[];
  readonly secrets: readonly string[];
}

export interface Risk {
  readonly id: string;
  readonly title: string;
  readonly impact: 'low' | 'medium' | 'high';
  readonly mitigation: string;
  /** Modulo del ecosistema que deberia hacerse cargo del riesgo. */
  readonly owner: 'generator' | 'optimizer' | 'security' | 'tester' | 'documenter';
}

export interface Blueprint {
  readonly projectName: string;
  readonly slug: string;
  readonly stack: StackDecision;
  readonly layers: readonly LayerPlan[];
  readonly entities: readonly DomainEntity[];
  readonly endpoints: readonly ApiEndpoint[];
  readonly pages: readonly PagePlan[];
  readonly deployment: DeploymentPlan;
  readonly decisions: readonly ArchitectureDecision[];
  readonly risks: readonly Risk[];
  /** Instantanea de los requisitos que originaron este blueprint. */
  readonly requirements: RequirementsModel;
}
