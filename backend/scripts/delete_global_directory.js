const { prisma } = require('../modules/quotation/prisma');

async function run() {
  console.log('Running script to delete "MyCircle Global Directory" event...');
  try {
    // Find matching gallery events case-insensitively
    const events = await prisma.galleryEvent.findMany({
      where: {
        OR: [
          {
            slug: {
              contains: 'mycircle',
              mode: 'insensitive'
            }
          },
          {
            title: {
              contains: 'mycircle',
              mode: 'insensitive'
            }
          }
        ]
      }
    });

    if (events.length === 0) {
      console.log('No event matching "mycircle" found.');
      return;
    }

    for (const event of events) {
      console.log(`Deleting event: ID ${event.id} | Slug: ${event.slug} | Title: ${event.title}`);
      await prisma.galleryEvent.delete({
        where: { id: event.id }
      });
      console.log(`Successfully deleted event ID ${event.id}.`);
    }
  } catch (err) {
    console.error('Error deleting event:', err);
  } finally {
    process.exit(0);
  }
}

run();
