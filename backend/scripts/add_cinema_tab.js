/**
 * Migration: Add "Cinema" as a permanent tab (immediately following "Highlights")
 * to all existing galleries.
 * Safe to run multiple times (idempotent).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const galleries = await prisma.galleryEvent.findMany({ select: { id: true, title: true, tabs: true } });

  let updated = 0;
  for (const gallery of galleries) {
    const currentTabs = Array.isArray(gallery.tabs) ? gallery.tabs : [];
    
    // Ensure Highlights is first, Cinema is second, followed by all remaining unique tabs
    const otherTabs = currentTabs.filter(t => t !== 'Highlights' && t !== 'Cinema');
    const newTabs = ['Highlights', 'Cinema', ...otherTabs];

    // Check if the tabs array already matches
    const isIdentical = currentTabs.length === newTabs.length && currentTabs.every((val, idx) => val === newTabs[idx]);

    if (isIdentical) {
      console.log(`✓ [${gallery.id}] "${gallery.title}" already has [${newTabs.join(', ')}]`);
      continue;
    }

    await prisma.galleryEvent.update({
      where: { id: gallery.id },
      data: { tabs: newTabs }
    });

    console.log(`✅ [${gallery.id}] "${gallery.title}": updated tabs → [${newTabs.join(', ')}]`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} / ${galleries.length} galleries.`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
