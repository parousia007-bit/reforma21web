const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const articulosPath = path.resolve(__dirname, '../js/db/articulos.js');
const contentDir = path.resolve(__dirname, '../content');

async function migrate() {
  try {
    // Read the file content
    const jsContent = fs.readFileSync(articulosPath, 'utf8');
    
    // Evaluate the JS content safely to get the object
    // We wrap it in a function to avoid polluting the global scope
    // and just return articulosDB.
    const script = jsContent + '\nreturn articulosDB;';
    const articulosDB = new Function(script)();

    console.log(`Found ${Object.keys(articulosDB).length} articles to migrate...`);

    // Ensure content directory exists
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    for (const key in articulosDB) {
      const article = articulosDB[key];
      const { id, contenido, ...metadata } = article;

      if (!id) continue;

      // Extract raw HTML content and remove unnecessary outer whitespace
      const rawContent = (contenido || '').trim();

      // We add id back to the frontmatter, and all other metadata
      const frontmatterData = {
        id: id,
        ...metadata
      };

      // Create the final markdown file string using gray-matter
      const fileString = matter.stringify(rawContent, frontmatterData);

      // Define output path
      const outputPath = path.join(contentDir, `${id}.md`);
      
      // Write the file
      fs.writeFileSync(outputPath, fileString);
      console.log(`Created: ${outputPath}`);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

migrate();
