import type { DomainEntity, FrontendAdapter, ScaffoldContext, VirtualFile } from '@calecosystem/contracts';
import { banner, displayField, entityInterface, fileFactory, jsonFile, listColumns } from '../shared.ts';
import { camelCase, kebabCase } from '../../analysis/text.ts';

const TOOL = '@calecosystem/generator (angular)';
const file = fileFactory(TOOL);

/** Adaptador de frontend para Angular (standalone components + signals). */
export const angularAdapter: FrontendAdapter = {
  id: 'calec.frontend.angular',
  displayName: 'Angular 19 (standalone)',
  framework: 'angular',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const root = 'apps/web';
    const files: VirtualFile[] = [];

    files.push(
      file(
        `${root}/package.json`,
        jsonFile({
          name: `${blueprint.slug}-web`,
          private: true,
          scripts: { start: 'ng serve', build: 'ng build', test: 'ng test' },
          dependencies: {
            '@angular/common': '^19.0.0',
            '@angular/compiler': '^19.0.0',
            '@angular/core': '^19.0.0',
            '@angular/platform-browser': '^19.0.0',
            '@angular/router': '^19.0.0',
            rxjs: '^7.8.0',
            'zone.js': '^0.15.0',
          },
          devDependencies: {
            '@angular/cli': '^19.0.0',
            '@angular/compiler-cli': '^19.0.0',
            typescript: '^5.6.0',
          },
        }),
      ),
    );

    files.push(
      file(
        `${root}/src/index.html`,
        [
          '<!doctype html>',
          '<html lang="es">',
          '  <head>',
          '    <meta charset="utf-8" />',
          `    <title>${blueprint.projectName}</title>`,
          '    <base href="/" />',
          '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  </head>',
          '  <body>',
          '    <app-root></app-root>',
          '  </body>',
          '</html>',
        ].join('\n'),
      ),
    );

    files.push(
      file(
        `${root}/src/types.ts`,
        [banner(blueprint, TOOL), '', ...blueprint.entities.map(entityInterface)].join('\n\n'),
      ),
    );
    files.push(file(`${root}/src/main.ts`, mainEntry()));
    files.push(file(`${root}/src/app/app.config.ts`, appConfig()));
    files.push(file(`${root}/src/app/app.component.ts`, appComponent(blueprint.projectName, blueprint.entities)));
    files.push(file(`${root}/src/app/app.routes.ts`, routes(blueprint.entities)));
    files.push(file(`${root}/src/app/core/api.service.ts`, apiService(blueprint.slug)));

    for (const entity of blueprint.entities) {
      files.push(
        file(`${root}/src/app/pages/${kebabCase(entity.name)}-list.component.ts`, listComponent(entity)),
      );
    }
    return files;
  },
};

function mainEntry(): string {
  return [
    "import { bootstrapApplication } from '@angular/platform-browser';",
    "import { AppComponent } from './app/app.component';",
    "import { appConfig } from './app/app.config';",
    '',
    'bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {',
    '  console.error(error);',
    '});',
  ].join('\n');
}

function appConfig(): string {
  return [
    "import { provideHttpClient } from '@angular/common/http';",
    "import type { ApplicationConfig } from '@angular/core';",
    "import { provideRouter } from '@angular/router';",
    "import { routes } from './app.routes';",
    '',
    'export const appConfig: ApplicationConfig = {',
    '  providers: [provideRouter(routes), provideHttpClient()],',
    '};',
  ].join('\n');
}

function routes(entities: readonly DomainEntity[]): string {
  const imports = entities
    .map(
      (entity) =>
        `import { ${entity.name}ListComponent } from './pages/${kebabCase(entity.name)}-list.component';`,
    )
    .join('\n');
  const entries = entities
    .map((entity) => `  { path: '${entity.plural}', component: ${entity.name}ListComponent },`)
    .join('\n');

  return [
    "import type { Routes } from '@angular/router';",
    imports,
    '',
    'export const routes: Routes = [',
    entries,
    `  { path: '**', redirectTo: '${entities[0]?.plural ?? ''}' },`,
    '];',
  ].join('\n');
}

function apiService(slug: string): string {
  return [
    "import { HttpClient, HttpHeaders } from '@angular/common/http';",
    "import { Injectable, inject } from '@angular/core';",
    "import type { Observable } from 'rxjs';",
    '',
    "@Injectable({ providedIn: 'root' })",
    'export class ApiService {',
    '  private readonly http = inject(HttpClient);',
    "  private readonly baseUrl = '/api';",
    '',
    '  list<T>(resource: string): Observable<T[]> {',
    "    return this.http.get<T[]>(this.baseUrl + '/' + resource, { headers: this.headers() });",
    '  }',
    '',
    '  private headers(): HttpHeaders {',
    `    const token = localStorage.getItem('${slug}.token');`,
    "    return new HttpHeaders(token ? { Authorization: 'Bearer ' + token } : {});",
    '  }',
    '}',
  ].join('\n');
}

function appComponent(projectName: string, entities: readonly DomainEntity[]): string {
  const links = entities
    .map((entity) => `      <a routerLink="/${entity.plural}">${entity.name}</a>`)
    .join('\n');
  return [
    "import { Component } from '@angular/core';",
    "import { RouterLink, RouterOutlet } from '@angular/router';",
    '',
    '@Component({',
    "  selector: 'app-root',",
    '  standalone: true,',
    '  imports: [RouterLink, RouterOutlet],',
    '  template: `',
    '    <header>',
    `      <h1>${projectName}</h1>`,
    '    </header>',
    '    <nav>',
    links,
    '    </nav>',
    '    <main>',
    '      <router-outlet />',
    '    </main>',
    '  `,',
    '})',
    'export class AppComponent {}',
  ].join('\n');
}

function listComponent(entity: DomainEntity): string {
  const columns = listColumns(entity);
  const headers = columns.map((column) => `          <th>${column.name}</th>`).join('\n');
  const cells = columns.map((column) => `          <td>{{ item.${column.name} }}</td>`).join('\n');
  const key = displayField(entity);
  const signal = camelCase(entity.plural);

  return [
    "import { Component, inject, signal } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { ApiService } from '../core/api.service';",
    `import type { ${entity.name} } from '../../types';`,
    '',
    '@Component({',
    `  selector: 'app-${kebabCase(entity.name)}-list',`,
    '  standalone: true,',
    '  imports: [CommonModule],',
    '  template: `',
    `    <h2>${entity.name}</h2>`,
    '    <table>',
    '      <thead>',
    '        <tr>',
    headers,
    '        </tr>',
    '      </thead>',
    '      <tbody>',
    `        <tr *ngFor="let item of ${signal}(); trackBy: trackById">`,
    cells,
    '        </tr>',
    '      </tbody>',
    '    </table>',
    '  `,',
    '})',
    `export class ${entity.name}ListComponent {`,
    '  private readonly api = inject(ApiService);',
    `  readonly ${signal} = signal<${entity.name}[]>([]);`,
    '',
    '  constructor() {',
    `    this.api.list<${entity.name}>('${entity.plural}').subscribe((data) => this.${signal}.set(data));`,
    '  }',
    '',
    `  trackById(_index: number, item: ${entity.name}): string {`,
    `    return String(item.${key});`,
    '  }',
    '}',
  ].join('\n');
}
