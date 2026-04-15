# Documentación Técnica - Arquitectura Modular Reforma 2.1

## Resumen
La plataforma web de Reforma 2.1 ha sido refactorizada migrando de un archivo `index.html` monolítico a una Arquitectura por Dominios (SoC - Separation of Concerns). Esto mejora la mantenibilidad, escalabilidad y claridad del código.

## Estructura de Directorios

*   **`css/`**: Contiene el archivo `styles.css`, el cual aloja todos los estilos visuales de la plataforma. Se eliminaron por completo las etiquetas `<style>` y los estilos en línea (atributos `style=""`) del HTML, garantizando un diseño limpio y reutilizable mediante clases CSS.
*   **`js/`**: Contiene la lógica interactiva de la aplicación.
    *   **`js/app.js`**: Aloja la lógica del frontend: la interacción de los Modales de lectura, el renderizado dinámico del Canvas de constelaciones, la navegación (scroll, menú hamburguesa) y el embudo de la App (funcionalidad `.app-trigger`).
*   **`js/db_articulos.js`**: Actúa como nuestra "Base de Datos" local. Contiene el objeto `contenidosDB`.
*   **`vistas/`**: (Proyectado para la fase de Navegación Dinámica) Directorio destinado a alojar plantillas HTML (`detalle_devocional.html`, `template_serie.html`) para el renderizado de contenido dinámico.

## Separación de Datos y Protección del MET

El archivo `js/db_articulos.js` encapsula la información de los artículos y devocionales. La regla de oro aplicada en la extracción fue la preservación íntegra de los textos. El contenido del MET (Mensaje, Estética y Tono) se extrajo caracter por caracter sin resúmenes, truncamientos o modificaciones de las etiquetas HTML internas de los párrafos. Esto garantiza que la curaduría original se mantenga exacta al diseño monolítico, aislando los datos de la interfaz visual.

## Navegación Dinámica y Vistas (Próxima Fase)

*(Diseño Arquitectónico)*
El sistema evolucionará para no requerir archivos HTML nuevos por cada artículo. En su lugar, se implementará un sistema de plantillas en `/vistas/` (ej. `detalle_devocional.html`, `template_serie.html`).
*   **Funcionamiento**: Mediante JavaScript, se interceptarán los parámetros de la URL (ej. `?id=devocional_01`) para buscar el ID correspondiente en `contenidosDB`.
*   **Renderizado**: La plantilla inyectará el título, metadatos, contenido y ejercicios en el DOM en tiempo de ejecución.

## UI/UX Premium

La experiencia de usuario se fundamenta en los siguientes pilares:
*   **Efecto Reveal (IntersectionObserver)**: Los elementos con la clase `.reveal` aparecen fluidamente a medida que el usuario hace scroll, mejorando la inmersión.
*   **Canvas Interactivo**: Un sistema de partículas en el fondo de la página, proporcionando una estética cósmica o espacial.
*   **Modal de Lectura Estilo MasterClass**: Diseño limpio, enfocado y libre de distracciones para consumir el contenido de la base de datos (con citas destacadas y ejercicios).
*   **Responsive Design**: Adaptación fluida a dispositivos móviles, incluyendo un menú hamburguesa y redimensionamiento dinámico del Canvas.

## Guía de Ingesta (Protocolo "Cero Monolitos")

Para agregar nuevos contenidos (artículos, audios, devocionales) sin alterar el `index.html`:

1.  **Abrir `js/db_articulos.js`**.
2.  **Añadir un nuevo nodo** al objeto `contenidosDB` siguiendo el esquema existente:
    ```javascript
    'nuevo_id': {
      tipo: 'articulo', // o 'devocional'
      esfera: 'Nombre de la Esfera',
      tiempo: 'X min',
      serie: 'Nombre de la Serie',
      titulo: 'Título del Contenido',
      lead: 'Cita destacada o resumen...',
      autor: 'Autor o Referencia',
      texto: '<p>Párrafo 1...</p><p>Párrafo 2...</p>',
      ejercicio: 'Texto del ejercicio práctico (opcional)'
    }
    ```
3.  **Actualizar la Interfaz** (Si aplica en la pantalla principal o muro): Añadir una tarjeta HTML simple en `index.html` que invoque el modal u enlace con el ID: `onclick="openModal('nuevo_id')"`. (En la fase de navegación dinámica, esto será automático o apuntará a la ruta parametrizada).

## Próximos Pasos

Esta arquitectura establece las bases sólidas para:
*   Implementar la fase de **"Diálogo y Respuestas"**.
*   Integrar de forma nativa la **Audioteca**.
*   Escalar el uso de vistas dinámicas y `fetch`/API en el futuro.
