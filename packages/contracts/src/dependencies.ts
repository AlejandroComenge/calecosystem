/**
 * Declaracion de dependencias.
 *
 * Antes, cada adaptador escribia su propio `package.json` a mano. Eso
 * funcionaba con un adaptador por proyecto y se rompe en cuanto una plantilla
 * o un componente necesitan anadir un paquete: acabas con dos productores
 * peleando por el mismo fichero.
 *
 * Ahora cada productor **declara** lo que necesita y el generador construye
 * un unico manifiesto por workspace. El efecto secundario util es que el
 * `package.json` resultante puede explicar por que esta cada dependencia.
 */

/** Workspace del proyecto generado al que pertenece una dependencia. */
export type WorkspaceId = 'root' | 'web' | 'api' | (string & {});

export interface DependencySpec {
  readonly name: string;
  /** Rango semver, p.ej. `^19.0.0`. */
  readonly version: string;
  readonly workspace: WorkspaceId;
  /** `true` para `devDependencies`. */
  readonly dev?: boolean;
  /** Por que hace falta. Acaba en la documentacion del proyecto generado. */
  readonly reason: string;
  /** Quien la pidio: adaptador, plantilla o componente. */
  readonly requestedBy: string;
}

/**
 * Dos productores piden versiones incompatibles del mismo paquete. No es un
 * error fatal (se resuelve tomando la primera declarada), pero si algo que
 * el equipo debe saber antes de instalar.
 */
export interface DependencyConflict {
  readonly name: string;
  readonly workspace: WorkspaceId;
  readonly resolved: string;
  readonly requests: readonly { version: string; requestedBy: string; reason: string }[];
}

/** Aportacion a un `package.json`: scripts y campos sueltos. */
export interface ManifestContribution {
  readonly workspace: WorkspaceId;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly requestedBy: string;
}

/**
 * Lo que ve un adaptador o una plantilla. Solo escribe; la construccion del
 * manifiesto es responsabilidad del generador.
 */
export interface DependencyCollector {
  require(spec: DependencySpec): void;
  requireAll(specs: readonly DependencySpec[]): void;
  contribute(contribution: ManifestContribution): void;
  /** Consulta: util para que una plantilla no repita lo que ya pidio el adaptador. */
  has(name: string, workspace: WorkspaceId): boolean;
}
