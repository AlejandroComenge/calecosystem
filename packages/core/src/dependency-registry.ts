import type {
  DependencyCollector,
  DependencyConflict,
  DependencySpec,
  ManifestContribution,
  WorkspaceId,
} from '@calecosystem/contracts';

export interface ManifestOptions {
  readonly name: string;
  readonly version?: string;
  readonly private?: boolean;
}

export interface BuiltManifest {
  readonly json: string;
  readonly dependencyCount: number;
}

/**
 * Recoge las dependencias que declaran adaptadores, plantillas y componentes,
 * y construye un `package.json` por workspace.
 *
 * Reglas de resolución, deliberadamente simples y predecibles:
 *  - Gana la primera version declarada. Quien llega después no pisa a quien
 *    ya estaba.
 *  - Una version distinta para el mismo paquete se registra como conflicto
 *    con el nombre de ambos solicitantes. No se resuelve automáticamente
 *    porque adivinar la version correcta es exactamente el tipo de magia que
 *    luego nadie sabe depurar.
 *  - La salida está ordenada alfabéticamente: dos generaciones identicas
 *    producen el mismo fichero byte a byte.
 */
export class DependencyRegistry implements DependencyCollector {
  readonly #specs = new Map<string, DependencySpec[]>();
  readonly #contributions: ManifestContribution[] = [];

  require(spec: DependencySpec): void {
    const key = `${spec.workspace}::${spec.name}`;
    const existing = this.#specs.get(key) ?? [];
    existing.push(spec);
    this.#specs.set(key, existing);
  }

  requireAll(specs: readonly DependencySpec[]): void {
    for (const spec of specs) this.require(spec);
  }

  contribute(contribution: ManifestContribution): void {
    this.#contributions.push(contribution);
  }

  has(name: string, workspace: WorkspaceId): boolean {
    return this.#specs.has(`${workspace}::${name}`);
  }

  /** Dependencias resueltas de un workspace, ordenadas por nombre. */
  resolved(workspace: WorkspaceId): DependencySpec[] {
    return [...this.#specs.values()]
      .map((group) => group[0] as DependencySpec)
      .filter((spec) => spec.workspace === workspace)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Paquetes con versiones incompatibles declaradas por productores distintos. */
  conflicts(): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];
    for (const group of this.#specs.values()) {
      const versions = new Set(group.map((spec) => spec.version));
      if (versions.size <= 1) continue;
      const first = group[0] as DependencySpec;
      conflicts.push({
        name: first.name,
        workspace: first.workspace,
        resolved: first.version,
        requests: group.map((spec) => ({
          version: spec.version,
          requestedBy: spec.requestedBy,
          reason: spec.reason,
        })),
      });
    }
    return conflicts.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Workspaces con al menos una dependencia o aportación. */
  workspaces(): WorkspaceId[] {
    const ids = new Set<WorkspaceId>();
    for (const group of this.#specs.values()) {
      if (group[0]) ids.add(group[0].workspace);
    }
    for (const contribution of this.#contributions) ids.add(contribution.workspace);
    return [...ids].sort();
  }

  /** Construye el `package.json` de un workspace. */
  buildManifest(workspace: WorkspaceId, options: ManifestOptions): BuiltManifest {
    const specs = this.resolved(workspace);
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};

    for (const spec of specs) {
      const target = spec.dev ? devDependencies : dependencies;
      target[spec.name] = spec.version;
    }

    const scripts: Record<string, string> = {};
    let fields: Record<string, unknown> = {};
    for (const contribution of this.#contributions) {
      if (contribution.workspace !== workspace) continue;
      Object.assign(scripts, contribution.scripts ?? {});
      fields = { ...fields, ...(contribution.fields ?? {}) };
    }

    const manifest: Record<string, unknown> = {
      name: options.name,
      version: options.version ?? '0.1.0',
      private: options.private ?? true,
      ...fields,
    };
    if (Object.keys(scripts).length > 0) manifest['scripts'] = sortKeys(scripts);
    if (Object.keys(dependencies).length > 0) manifest['dependencies'] = sortKeys(dependencies);
    if (Object.keys(devDependencies).length > 0) {
      manifest['devDependencies'] = sortKeys(devDependencies);
    }

    return {
      json: `${JSON.stringify(manifest, null, 2)}\n`,
      dependencyCount: specs.length,
    };
  }

  /** Inventario legible: que dependencia entro, quien la pidio y por qué. */
  explain(workspace: WorkspaceId): string[] {
    return this.resolved(workspace).map(
      (spec) =>
        `${spec.name}@${spec.version}${spec.dev ? ' (dev)' : ''} - ${spec.reason} [${spec.requestedBy}]`,
    );
  }
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
