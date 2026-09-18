/* CalEcosystem Studio — interfaz.
 *
 * Sin framework ni paso de compilacion, igual que el resto del ecosistema:
 * el navegador carga este fichero tal cual. Son ~300 lineas; meter React y un
 * empaquetador para esto seria anadir mantenimiento a cambio de nada.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var enunciado = $('enunciado');
  var nombre = $('nombre');
  var framework = $('framework');
  var deployment = $('deployment');
  var botonAnalizar = $('boton-analizar');
  var botonGenerar = $('boton-generar');
  var botonEjemplos = $('boton-ejemplos');
  var ejemplos = $('ejemplos');
  var estado = $('estado');
  var error = $('error');

  var IDENTIFICADOR = 'calec.studio.user';

  /** Identificador local para separar consumos. No es una cuenta. */
  function usuario() {
    try {
      var guardado = localStorage.getItem(IDENTIFICADOR);
      if (guardado) return guardado;
      var nuevo = 'studio-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(IDENTIFICADOR, nuevo);
      return nuevo;
    } catch (e) {
      // Modo privado o almacenamiento bloqueado: se sigue sin identificador.
      return 'anonimo';
    }
  }

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  function limpiarError() {
    error.hidden = true;
    error.textContent = '';
  }

  function ocupado(activo, texto) {
    botonAnalizar.disabled = activo;
    botonGenerar.disabled = activo || !botonGenerar.dataset.listo;
    estado.textContent = texto || '';
  }

  function cuerpoPeticion() {
    return {
      text: enunciado.value.trim(),
      name: nombre.value.trim(),
      framework: framework.value,
      deployment: deployment.value
    };
  }

  async function pedir(ruta, opciones) {
    var respuesta = await fetch(ruta, Object.assign({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Calec-User': usuario() },
      body: JSON.stringify(cuerpoPeticion())
    }, opciones || {}));

    if (!respuesta.ok) {
      var detalle = await respuesta.json().catch(function () { return null; });
      var mensaje = detalle && detalle.error ? detalle.error.message : 'Error ' + respuesta.status;
      if (detalle && detalle.error && detalle.error.upgradeTo) {
        mensaje += ' El plan "' + detalle.error.upgradeTo + '" amplia este limite.';
      }
      throw new Error(mensaje);
    }
    return respuesta;
  }

  /* --- Paso 1: ejemplos ------------------------------------------------ */

  botonEjemplos.addEventListener('click', async function () {
    if (!ejemplos.hidden) { ejemplos.hidden = true; return; }

    if (!ejemplos.dataset.cargado) {
      try {
        var respuesta = await fetch('/api/examples');
        var datos = await respuesta.json();
        datos.examples.forEach(function (ejemplo) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'chip';
          chip.textContent = ejemplo.title;
          chip.title = ejemplo.audience;
          chip.addEventListener('click', function () {
            enunciado.value = ejemplo.brief;
            framework.value = ejemplo.framework || '';
            enunciado.focus();
          });
          ejemplos.appendChild(chip);
        });
        ejemplos.dataset.cargado = '1';
      } catch (e) {
        mostrarError('No se pudieron cargar los ejemplos.');
        return;
      }
    }
    ejemplos.hidden = false;
  });

  /* --- Paso 2: analizar ------------------------------------------------ */

  botonAnalizar.addEventListener('click', async function () {
    limpiarError();
    if (enunciado.value.trim().length < 10) {
      mostrarError('Describe el producto en al menos un par de frases.');
      return;
    }

    ocupado(true, 'analizando...');
    try {
      var respuesta = await pedir('/api/plan');
      pintarPlan(await respuesta.json());
      botonGenerar.dataset.listo = '1';
      estado.textContent = '';
    } catch (e) {
      mostrarError(e.message);
      estado.textContent = '';
    } finally {
      botonAnalizar.disabled = false;
      botonGenerar.disabled = !botonGenerar.dataset.listo;
    }
  });

  function pintarPlan(plan) {
    $('seccion-plan').hidden = false;
    $('confianza').textContent = 'confianza ' + Math.round(plan.confidence * 100) + '%';

    pintarCifras($('cifras'), [
      [plan.stack.frontend, 'frontend'],
      [plan.stack.backend.replace('node-', ''), 'backend'],
      [plan.stack.database, 'datos'],
      [String(plan.entities.length), 'entidades'],
      [String(plan.endpoints), 'endpoints'],
      [String(plan.pages), 'pantallas']
    ]);

    var cuerpo = $('tabla-entidades').querySelector('tbody');
    cuerpo.textContent = '';
    plan.entities.forEach(function (entidad) {
      var fila = document.createElement('tr');
      fila.appendChild(celda(entidad.name, 'b'));
      fila.appendChild(celda(entidad.route, 'mono'));
      fila.appendChild(celda(String(entidad.fields)));
      var marca = document.createElement('td');
      if (entidad.inferred) {
        var etiqueta = document.createElement('span');
        etiqueta.className = 'marca';
        etiqueta.textContent = 'deducida';
        etiqueta.title = 'No estaba en el diccionario: revisa su nombre y sus campos.';
        marca.appendChild(etiqueta);
      }
      fila.appendChild(marca);
      cuerpo.appendChild(fila);
    });

    var decisiones = $('decisiones');
    decisiones.textContent = '';
    plan.decisions.forEach(function (decision) {
      var bloque = document.createElement('div');
      bloque.className = 'decision';

      var cabecera = document.createElement('header');
      var id = document.createElement('code');
      id.textContent = decision.id;
      var eleccion = document.createElement('b');
      eleccion.textContent = decision.choice;
      cabecera.appendChild(id);
      cabecera.appendChild(eleccion);

      var motivo = document.createElement('p');
      motivo.textContent = decision.rationale;

      bloque.appendChild(cabecera);
      bloque.appendChild(motivo);

      if (decision.alternatives && decision.alternatives.length) {
        var alt = document.createElement('p');
        alt.className = 'alt';
        alt.textContent = 'Descartadas: ' + decision.alternatives.join(', ') + '.';
        bloque.appendChild(alt);
      }
      decisiones.appendChild(bloque);
    });

    pintarLista($('bloque-riesgos'), $('riesgos'), plan.risks, function (riesgo) {
      var li = document.createElement('li');
      li.className = riesgo.impact;
      var titulo = document.createElement('b');
      titulo.textContent = riesgo.title;
      var texto = document.createElement('span');
      texto.textContent = riesgo.mitigation;
      li.appendChild(titulo);
      li.appendChild(texto);
      return li;
    });

    pintarLista($('bloque-preguntas'), $('preguntas'), plan.openQuestions, function (pregunta) {
      var li = document.createElement('li');
      li.textContent = pregunta;
      return li;
    });

    $('seccion-plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* --- Paso 3: generar ------------------------------------------------- */

  botonGenerar.addEventListener('click', async function () {
    limpiarError();
    ocupado(true, 'generando el proyecto...');

    try {
      var respuesta = await pedir('/api/generate');
      var cabecera = respuesta.headers.get('X-Calec-Summary');
      var blob = await respuesta.blob();

      descargar(blob, nombreDeFichero(respuesta));
      if (cabecera) pintarResultado(JSON.parse(decodeURIComponent(escape(atob(cabecera)))));
      estado.textContent = '';
    } catch (e) {
      mostrarError(e.message);
      estado.textContent = '';
    } finally {
      botonAnalizar.disabled = false;
      botonGenerar.disabled = false;
    }
  });

  function nombreDeFichero(respuesta) {
    var cabecera = respuesta.headers.get('Content-Disposition') || '';
    var coincidencia = /filename="([^"]+)"/.exec(cabecera);
    return coincidencia ? coincidencia[1] : 'proyecto.zip';
  }

  function descargar(blob, fichero) {
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = fichero;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    // Liberar en el siguiente ciclo: revocar antes cancela la descarga.
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function pintarResultado(resumen) {
    $('seccion-resultado').hidden = false;
    $('descarga-hecha').textContent = 'descargado';

    pintarCifras($('cifras-resultado'), [
      [String(resumen.metrics.fileCount), 'ficheros'],
      [String(resumen.metrics.lineCount), 'lineas'],
      [String(resumen.metrics.componentCount), 'componentes'],
      [Math.round(resumen.metrics.durationMs) + ' ms', 'tiempo'],
      [resumen.template ? resumen.template.name : 'ninguna', 'plantilla']
    ]);

    var informes = $('informes');
    informes.textContent = '';
    resumen.reports.forEach(function (informe) {
      var fila = document.createElement('div');
      fila.className = 'informe';

      var tipo = document.createElement('b');
      tipo.textContent = nombreModulo(informe.kind);

      var nota = document.createElement('span');
      nota.className = 'nota ' + nivelNota(informe.score);
      nota.textContent = informe.score === null ? '--' : informe.score + '/100';

      var resumenTexto = document.createElement('span');
      resumenTexto.textContent = informe.summary;

      fila.appendChild(tipo);
      fila.appendChild(nota);
      fila.appendChild(resumenTexto);
      informes.appendChild(fila);
    });

    var graves = [];
    resumen.reports.forEach(function (informe) {
      informe.findings.forEach(function (hallazgo) {
        if (hallazgo.severity === 'critical' || hallazgo.severity === 'high') graves.push(hallazgo);
      });
    });

    pintarLista($('bloque-pendiente'), $('pendiente'), graves, function (hallazgo) {
      var li = document.createElement('li');
      li.className = hallazgo.severity;
      var titulo = document.createElement('b');
      titulo.textContent = hallazgo.title;
      var texto = document.createElement('span');
      texto.textContent = hallazgo.remediation || hallazgo.id;
      li.appendChild(titulo);
      li.appendChild(texto);
      return li;
    });

    var omitidos = resumen.skippedModules || [];
    $('bloque-omitidos').hidden = omitidos.length === 0;
    var lista = $('omitidos');
    lista.textContent = '';
    omitidos.forEach(function (modulo) {
      var li = document.createElement('li');
      li.textContent = nombreModulo(modulo);
      lista.appendChild(li);
    });

    $('seccion-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* --- Auxiliares ------------------------------------------------------ */

  function celda(texto, clase) {
    var td = document.createElement('td');
    if (clase === 'b') {
      var fuerte = document.createElement('b');
      fuerte.textContent = texto;
      td.appendChild(fuerte);
    } else {
      td.textContent = texto;
      if (clase) td.className = clase;
    }
    return td;
  }

  function pintarCifras(contenedor, pares) {
    contenedor.textContent = '';
    pares.forEach(function (par) {
      var bloque = document.createElement('div');
      bloque.className = 'cifra';
      var valor = document.createElement('b');
      valor.textContent = par[0];
      // Los valores de texto no caben al tamano de una cifra.
      if (par[0].length > 6 && !/^[0-9]/.test(par[0])) valor.className = 'texto';
      var etiqueta = document.createElement('small');
      etiqueta.textContent = par[1];
      bloque.appendChild(valor);
      bloque.appendChild(etiqueta);
      contenedor.appendChild(bloque);
    });
  }

  function pintarLista(bloque, lista, elementos, construir) {
    lista.textContent = '';
    if (!elementos || elementos.length === 0) { bloque.hidden = true; return; }
    elementos.forEach(function (elemento) { lista.appendChild(construir(elemento)); });
    bloque.hidden = false;
  }

  function nombreModulo(clave) {
    var nombres = {
      optimizer: 'Rendimiento',
      security: 'Seguridad',
      tester: 'Pruebas',
      documenter: 'Documentacion',
      '@calecosystem/optimizer': 'Optimizador de rendimiento',
      '@calecosystem/security': 'Auditor de seguridad',
      '@calecosystem/tester': 'Testeador automatico',
      '@calecosystem/documenter': 'Documentador inteligente'
    };
    return nombres[clave] || clave;
  }

  function nivelNota(nota) {
    if (nota === null) return '';
    if (nota < 50) return 'baja';
    if (nota < 80) return 'media';
    return 'alta';
  }
})();
