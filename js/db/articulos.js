// db/articulos.js: Investigaciones Profundas (Fase de Investigación/Femenina)
const dbArticulos = {
  // EJEMPLO DE TU NUEVA CATEGORÍA (Crítica/Diálogo)
  'resp_macarthur_psy': {
    id: 'resp_macarthur_psy',
    tipo: 'articulo',
    categoria: 'Diálogo y Respuestas', // <- NUEVA CATEGORÍA
    esfera: 'Antropología/Fe',
    esfera_color: 'teologia', // purple
    tiempo: '10 min de lectura',
    serie: 'Respuestas a la Fragmentación',
    titulo: '¿Cristianismo vs. Psicología? Una respuesta a John MacArthur',
    lead: 'Diagnósticando el reduccionismo: Cómo el MET integra el estudio de la mente sin sacrificar la suficiencia de la Escritura.',
    autor: 'Futura Editions',
    imagen: 'https://images.unsplash.com/photo-1579389083078-4e7018379f7e?w=800', // Image de debate/cerebro
    texto: `<p>El debate iniciado por figuras como John MacArthur sobre la "psicología cristiana" no debe ignorarse. Diagnostica correctamente el peligro de un reduccionismo materialista que intenta reemplazar el alma con la química.</p>
    <p>Sin embargo, el MET ofrece una fase de Redención: reconocer que el estudio de la mente (diagnóstico de la distorsión conductual) es parte del mandato de "sojuzgar" la buena creación de Dios. No fragmentamos la realidad. No es "Biblia vs. Psicología", sino una psicología redimida bajo el orden de la Creación y la suficiencia de la Palabra.</p>`,
    ejercicio: 'EJERCICIO: Escribe dos conceptos psicológicos modernos (ej: autoestima) y cámbiales el nombre usando el lenguaje pre-teórico del MET (ej: orientación del corazón/identidad dada).',
    fecha_iso: '2026-04-10'
  },
  
  // ARTÍCULOS EXISTENTES REFACTORIZADOS CON ID DE SERIE (Opcional pero mejor)
  'article_fisica': {
    id: 'article_fisica', tipo: 'articulo', categoria: 'Ciencias', esfera: 'Física Cósmica', esfera_color: 'psico', // blue
    tiempo: '8 min', serie: 'Entendiendo el Orden', titulo: 'El Espejismo del Tiempo',
    lead: '¿Y si el tiempo no es una dimensión física que podamos recorrer?', autor: 'Futura Editions',
    imagen: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800',
    texto: `<p>...texto física...</p>`, ejercicio: '...', fecha_iso: '2026-04-09'
  }
};
