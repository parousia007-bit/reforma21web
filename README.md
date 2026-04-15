# Documentación Técnica - Arquitectura Modular Reforma 2.1

## Filosofía del Proyecto
En Reforma 2.1, nuestro orden técnico busca reflejar el orden creacional que buscamos restaurar. Hemos migrado de un `index.html` monolítico a una estructura modular limpia y organizada. Cada parte de nuestro código ahora tiene un propósito y lugar específico, eliminando el desorden y permitiendo que la plataforma crezca de manera sostenible.

## Arquitectura Modular (Separation of Concerns)
Hemos adoptado el principio de **Separación de Responsabilidades (SoC)** para dividir nuestro monolito en dominios específicos:
*   **`css/styles.css`**: Encapsula todos los estilos visuales, eliminando dependencias de `<style>` en línea y atributos `style=""` en el HTML. Esto asegura que el diseño visual sea reutilizable, limpio y mantenible de forma independiente.
*   **`js/app.js`**: Centraliza la lógica interactiva del lado del cliente (Modales, Canvas interactivo, navegación y el embudo `app-trigger`). Al aislar este comportamiento, el HTML se mantiene puramente semántico.
*   **`js/db/`**: Directorio dedicado a la gestión de datos. Aquí se almacena la "verdad" de nuestro contenido para no mezclar datos con la presentación.

## Bases de Datos por Dominio
Para proteger el **MET (Mensaje, Estética y Tono)**, extrajimos la información de manera precisa, asegurando que ningún carácter o etiqueta HTML interna se modifique o resuma.
*   **`js/db/db_articulos.js`**: Actúa como nuestra fuente de verdad local (agrupando artículos y devocionales temporalmente antes de separarlos totalmente en `articulos.js` y `devocionales.js`). Estas bases de datos permiten actualizar contenido sin tocar el `index.html`.

## Sistema de Vistas Dinámicas (Proyección)
Para evitar la redundancia de crear múltiples archivos HTML estáticos para cada nuevo contenido, hemos establecido las bases para un sistema de vistas dinámicas:
*   **Plantillas en `/vistas/`**: Archivos como `detalle_devocional.html` y `template_serie.html` servirán como esqueletos.
*   **Enrutamiento por Parámetros**: A través de JavaScript, interceptaremos parámetros en la URL (ej. `?id=articulo_fisica`). La lógica buscará este ID en nuestras bases de datos locales (`js/db/`) e inyectará el título, texto y ejercicios dinámicamente en la plantilla. Esto consolida el concepto de "Cero Monolitos".

## UX/UI Premium
Nuestra interfaz se apoya en patrones modernos para ofrecer una experiencia de inmersión:
*   **Efecto Reveal (IntersectionObserver)**: Los elementos aparecen fluidamente mientras el usuario hace scroll, creando una lectura relajada y progresiva.
*   **Diseño Estilo MasterClass**: El contenido (como las series en el modal) se organiza mediante "tarjetas apiladas", con una tipografía limpia y un diseño libre de distracciones, enfocado puramente en la retención del lector.
*   **Canvas Interactivo**: Añade dinamismo visual sin interferir con la navegación, representando la temática cósmica/creacional.

Esta estructura sienta las bases para las siguientes fases, como la integración de la **Audioteca** y el sistema de **Diálogo y Respuestas**.
