# Importador Hourglass

[English](README.md) · [Português](README.pt-BR.md) · **Español**

Herramienta local que registra en [Hourglass](https://hourglass-app.com) los informes mensuales de servicio del campo a partir de una hoja de cálculo (exportación de Microsoft Forms o la plantilla incluida) y muestra quién todavía no entregó su informe.

Todo se ejecuta en su propio equipo. Las únicas solicitudes externas van a la API de Hourglass, con su propia sesión.

## Funciones

- Lee el archivo de Excel e identifica las columnas por su título, en español, portugués o inglés.
- Permite mapear las columnas de cualquier hoja y recuerda el formato para la próxima vez.
- Asocia cada respuesta con el publicador registrado en Hourglass (nombre exacto, apodos guardados o nombre parecido).
- Entiende horas, horas de crédito y cursos bíblicos escritos como texto libre ("29 horas", "30 + 25 crédito construcción", "dos cursos").
- Genera una **revisión** con alertas para todo lo dudoso antes de enviar.
- Simula el envío, pide una confirmación explícita y envía un informe a la vez mostrando el progreso.
- Lista los informes pendientes del mes abierto por grupo, con un mensaje listo para pegar.
- Interfaz, hojas generadas, mensajes y línea de comandos en **español, portugués e inglés**.

## Requisitos

- [Node.js](https://nodejs.org) 20 o posterior
- Una cuenta de Hourglass con permiso para registrar los informes de la congregación

## Instalación

```bash
git clone https://github.com/willdenjohn/importador-hourglass.git
cd importador-hourglass
npm install
```

## Uso de la interfaz web

```bash
npm start
```

El navegador se abre en `http://localhost:3434` cuando el servidor está listo. En Windows también puede hacer doble clic en `start.bat`. Elija el idioma en la barra superior; la primera vez se usa el idioma del sistema.

1. **Sesión** — con la [extensión de Chrome](#extensión-de-chrome) instalada, la conexión es automática. Sin ella, pegue las cookies `hglogin` y `X-Hourglass-XSRF-Token` de Hourglass (en un navegador con la sesión iniciada: F12 → Application → Cookies → `https://app.hourglass-app.com`). La pantalla muestra los datos de la cuenta leídos de Hourglass: usuario, congregación, mes abierto, último mes enviado a la sucursal, grupos y permisos.
2. **Importar hoja de cálculo** — elija el mes en el calendario (el mes abierto en Hourglass tiene un punto verde; los meses ya enviados a la sucursal aparecen tachados), arrastre la hoja, revise las columnas detectadas y la vista previa, y haga clic en *Procesar hoja*. En este paso no se envía nada.
3. **Revisión y envío** — revise las filas:
   - `ENVIAR`: lista para enviar;
   - `REVISAR`: algo necesita confirmación (vea la columna *Alertas*);
   - `NO ENCONTRADO`: elija el publicador o regístrelo en Hourglass;
   - `YA ENVIADO` e `IGNORAR`: no se enviarán.

   Los cambios se guardan automáticamente y puede pasar de un campo a otro con Tab. Use la búsqueda y los filtros por estado para encontrar filas. Al elegir un publicador manualmente, *Recordar este nombre* guarda el apodo para los próximos meses. Haga clic en *Simular envío*, revise la lista y escriba la palabra de confirmación para enviar.
4. **Informes pendientes** — consulta Hourglass y muestra quién no entregó el informe del mes abierto: totales, lista por grupo con superintendente y teléfono, un mensaje único listo para copiar y descarga en Excel.

Al volver a abrir la página, la revisión del mes abierto se carga automáticamente.

## Hoja de cálculo

### Plantilla (recomendada)

Descárguela en la pantalla de importación (*Descargar plantilla*) o con `node cli.js template`. Sus columnas siguen los campos del informe en Hourglass y se generan en el idioma elegido:

| Columna | Qué completar | Obligatoria |
|---|---|---|
| Nombre | Nombre completo como está registrado en Hourglass | Sí |
| Participó en el ministerio | Sí o No (publicadores) | Sí, o Horas |
| Cursos bíblicos | Número de cursos dirigidos | No |
| Precursor auxiliar | Sí si fue precursor auxiliar este mes | No |
| Horas | Número entero (precursores) | Sí, o Participó |
| Horas de crédito | Solo precursores regulares; campo + crédito hasta 55 h | No |
| Notas | Va a las notas del informe | No |

La plantilla incluye una hoja de *Instrucciones*. Los precursores regulares y auxiliares continuos se reconocen en Hourglass, por eso no hay columna de tipo.

### Otras hojas

Cualquier Excel con una fila de títulos funciona. Al enviar el archivo, la pantalla **Columnas de la hoja** muestra cada campo del informe con la columna sugerida y valores de ejemplo; ajuste lo necesario y revise la vista previa antes de procesar. *Cursos bíblicos* y *Dirigió un curso* aceptan más de una columna (cuenta el primer valor completado), lo que cubre formularios con preguntas separadas para publicadores y precursores. Con *Recordar este formato*, el mapeo se guarda en `mappings.json`.

## Reglas aplicadas

- **Precursor**: se toma de Hourglass (regular, auxiliar continuo, especial). Si la hoja dice otra cosa, la fila pasa a revisión. El precursor auxiliar de un mes se toma de la columna *Precursor auxiliar*.
- **Publicador**: "participó" se envía como 1 minuto y "no participó" como 0, tal como lo hace Hourglass.
- **Horas**: solo horas enteras.
- **Horas de crédito**: solo para precursores regulares y especiales, limitadas para que campo + crédito no pase de 55 horas en el mes.
- **Duplicados**: si un nombre se repite, cuenta la última respuesta; dos filas que envían al mismo publicador bloquean el envío.
- **Ya enviado**: los informes que ya están en Hourglass se detectan antes de enviar y nunca se envían de nuevo.

## Uso de la línea de comandos

```bash
node cli.js prepare "Informe de servicio(SEPTIEMBRE).xlsx" 9 2026
node cli.js send reviews/review-2026-09.xlsx
node cli.js send reviews/review-2026-09.xlsx --execute
node cli.js send reviews/review-2026-09.xlsx --execute --limit=1
node cli.js missing
node cli.js template
```

- Agregue `--lang=es`, `--lang=pt-BR` o `--lang=en` a cualquier comando; por defecto se usa el idioma del sistema.
- `prepare` crea `reviews/review-AAAA-MM.xlsx`, que se puede revisar en Excel (cambie la columna *Estado* a ENVIAR).
- `send` sin `--execute` solo simula. Con `--execute` pide que escriba la palabra de confirmación.
- `--limit=N` envía solo los N primeros informes — útil para una primera prueba.
- La sesión se lee de `session.json` (vea `session.example.json`).

## Extensión de Chrome

La carpeta `extension/` contiene una extensión que entrega la sesión de Hourglass al importador automáticamente, sin copiar cookies.

**Instalación (una vez):**

1. Abra `chrome://extensions` y active el **Modo de desarrollador**.
2. Haga clic en **Cargar descomprimida** y elija la carpeta `extension/`.
3. Fije el ícono del reloj de arena en la barra de Chrome.

**Cómo funciona:**

- Solo actúa cuando se abre la página del importador (`localhost:3434`) y la sesión falta o venció, cuando una consulta a Hourglass falla porque la sesión venció (la consulta se repite sola) o cuando usted hace clic en *Conectar con Chrome* / *Sincronizar ahora*. No supervisa nada en segundo plano.
- Lee cookies solo de `app.hourglass-app.com` y las envía solo a `localhost:3434`.
- El ícono muestra **ON** u **OFF**. La ventana de la extensión indica si Hourglass tiene la sesión iniciada en este Chrome, si el importador está abierto y conectado, y el resultado de la última sincronización.
- **Desactivar** la apaga: no lee ninguna cookie hasta que se active de nuevo.
- Sus textos siguen el idioma de Chrome (español, portugués o inglés).

Debe tener la sesión de Hourglass iniciada en el mismo Chrome.

## Seguridad e integridad de los envíos

- El servidor solo escucha en `127.0.0.1` y rechaza solicitudes cuyo `Host` no sea `localhost` o `127.0.0.1`.
- Las escrituras (`POST`/`PUT`) solo se aceptan desde la propia página del importador o desde la extensión; otros sitios abiertos en el navegador no pueden cambiar la sesión ni los datos.
- Solo un envío se ejecuta a la vez: la interfaz y la línea de comandos comparten un bloqueo (`.send.lock`). Un bloqueo abandonado por más de 30 minutos se descarta.
- Antes de registrar cada informe, el importador verifica en Hourglass si ya existe; si existe, no lo envía de nuevo.
- Las solicitudes a Hourglass tienen un límite de 30 segundos. Las consultas se repiten una vez si hay inestabilidad; la creación de un informe solo se repite después de confirmar que el primer intento no llegó.
- Elegir un mes que Hourglass ya envió a la sucursal muestra un aviso: los informes registrados en él cuentan como atrasados.
- Cada envío queda registrado en `reviews/submissions-AAAA-MM.log` (fecha, origen, publicador, valores y resultado).

## Archivos locales (no versionados)

| Archivo | Contenido |
|---|---|
| `session.json` | Cookies de sesión de Hourglass. Da acceso a su cuenta — no lo comparta. |
| `aliases.json` | Nombres del formulario asociados a ID de Hourglass (vea `aliases.example.json`). |
| `mappings.json` | Formatos de hoja recordados (títulos de columnas). |
| `reviews/` | Revisiones, hojas de informes pendientes y registros de envío por mes. |

Todos contienen datos personales y están en `.gitignore`.

**Actualización desde la versión 1:** los archivos creados por la versión 1 (`sessao.json`, `apelidos.json`, `mapeamentos.json`, `conferencias/`) se renombran automáticamente en la primera ejecución, y las revisiones antiguas en portugués se siguen abriendo. Vuelva a cargar la extensión de Chrome desde la nueva carpeta `extension/`.

## Pruebas

```bash
npm test
```

Usa el ejecutor de pruebas integrado de Node, sin dependencias adicionales. Las pruebas usan solo datos ficticios y un Hourglass simulado — no se hace ninguna solicitud real.

## Cómo contribuir

- **Idioma:** el código, los identificadores, los nombres de archivo y los mensajes de commit están en inglés. Los textos para el usuario están en `locales/*.json`; agregue cada clave en los tres archivos (una prueba verifica que tengan las mismas claves y parámetros). Los textos de la extensión están en `extension/_locales/*/messages.json`.
- **Commits:** siguen [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), con un asunto breve en imperativo y en inglés.
- **Sin datos reales:** nunca incluya nombres, teléfonos, datos de la congregación, ID de Hourglass, cookies ni hojas de cálculo. Las pruebas y los ejemplos usan solo datos ficticios.
- **Antes de abrir un pull request:** ejecute `npm test`.

La estructura del proyecto y la API de Hourglass utilizada se describen en el [README en inglés](README.md#project-structure).

## Licencia

[MIT](LICENSE).

## Aviso

Proyecto independiente, sin relación con Hourglass. Úselo bajo su propia responsabilidad y verifique los informes en Hourglass después de enviarlos.
