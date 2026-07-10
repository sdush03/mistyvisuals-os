const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const galleries = await prisma.galleryEvent.findMany({
    select: { id: true, title: true, slug: true, projectId: true }
  });
  console.log('Registered Gallery Events:');
  galleries.forEach(g => {
    console.log(`- ID: ${g.id} | Title: "${g.title}" | Slug: "${g.slug}" | Project ID: "${g.projectId}"`);
  });
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
