const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const versions = await prisma.quoteVersion.findMany({
    orderBy: { id: 'desc' },
    take: 3
  });
  versions.forEach(v => {
    console.log(`Version ${v.id} - status: ${v.status}`);
    const draft = v.draftDataJson || {};
    console.log(`  signatureImage length: ${draft.signatureImage ? draft.signatureImage.length : 'none'}`);
    console.log(`  signatureImageDark length: ${draft.signatureImageDark ? draft.signatureImageDark.length : 'none'}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
