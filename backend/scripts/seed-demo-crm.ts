import { Prisma } from '../src/generated/prisma/client.js';
import {
  DEMO_ACTIVITIES,
  DEMO_ACTIVITY_DESCRIPTIONS,
  DEMO_COMPANIES,
  DEMO_CONTACTS,
  DEMO_INQUIRIES,
  DEMO_INQUIRY_MESSAGES,
  DEMO_OPPORTUNITIES,
  getSeedState,
  requireExactlyOneActiveSuperAdmin,
  type DemoCounts,
} from './demo-crm-plan.js';
import {
  createDemoCrmPrisma,
  isApplyMode,
  printSafeFailure,
  requireDevelopment,
} from './demo-crm-db.js';

async function getDemoCounts(db: {
  company: { count(args: object): Promise<number> };
  contact: { count(args: object): Promise<number> };
  inquiry: { count(args: object): Promise<number> };
  opportunity: { count(args: object): Promise<number> };
  activity: { count(args: object): Promise<number> };
}): Promise<DemoCounts> {
  const [companies, contacts, inquiries, opportunities, activities] =
    await Promise.all([
      db.company.count({ where: { name: { in: DEMO_COMPANIES.map((row) => row.name) } } }),
      db.contact.count({ where: { email: { in: DEMO_CONTACTS.map((row) => row.email) } } }),
      db.inquiry.count({ where: { message: { in: DEMO_INQUIRY_MESSAGES } } }),
      db.opportunity.count({ where: { name: { in: DEMO_OPPORTUNITIES.map((row) => row.name) } } }),
      db.activity.count({ where: { description: { in: DEMO_ACTIVITY_DESCRIPTIONS } } }),
    ]);
  return { companies, contacts, inquiries, opportunities, activities };
}

async function getAuthor(db: {
  internalUser: {
    findMany(args: object): Promise<Array<{ id: string }>>;
  };
}): Promise<string> {
  const admins = await db.internalUser.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
    take: 2,
  });
  requireExactlyOneActiveSuperAdmin(admins.length);
  return admins[0]!.id;
}

async function createDemoData(tx: Prisma.TransactionClient, authorId: string) {
  const companies = [];
  for (const row of DEMO_COMPANIES) {
    companies.push(await tx.company.create({ data: { ...row } }));
  }

  const contacts = [];
  for (const row of DEMO_CONTACTS) {
    contacts.push(
      await tx.contact.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          companyId: companies[row.company]!.id,
        },
      }),
    );
  }

  const inquiries = [];
  for (const [index, row] of DEMO_INQUIRIES.entries()) {
    inquiries.push(
      await tx.inquiry.create({
        data: {
          locale: 'ES',
          status: row.status,
          companyName: DEMO_COMPANIES[row.company]!.name,
          contactName: `${DEMO_CONTACTS[row.contact]!.firstName} ${DEMO_CONTACTS[row.contact]!.lastName}`,
          email: DEMO_CONTACTS[row.contact]!.email,
          countryCode: DEMO_COMPANIES[row.company]!.countryCode,
          message: DEMO_INQUIRY_MESSAGES[index]!,
          companyId: companies[row.company]!.id,
          contactId: contacts[row.contact]!.id,
          createdById: authorId,
        },
      }),
    );
  }

  const opportunities = [];
  for (const row of DEMO_OPPORTUNITIES) {
    opportunities.push(
      await tx.opportunity.create({
        data: {
          name: row.name,
          stage: row.stage,
          companyId: companies[row.company]!.id,
          contactId: contacts[row.contact]!.id,
          ownerId: authorId,
          notes: 'Registro sintético de demostración; sin oferta ni precio real.',
        },
      }),
    );
  }

  for (const [index, row] of DEMO_ACTIVITIES.entries()) {
    await tx.activity.create({
      data: {
        type: row.type,
        description: DEMO_ACTIVITY_DESCRIPTIONS[index]!,
        authorId,
        companyId: companies[row.company]!.id,
        opportunityId: opportunities[row.opportunity]!.id,
        inquiryId: inquiries[index % inquiries.length]!.id,
        ...(row.type === 'TASK'
          ? {
              taskStatus: 'OPEN' as const,
              taskDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }
          : {}),
      },
    });
  }
}

async function main() {
  requireDevelopment();
  const apply = isApplyMode(process.argv.slice(2));
  const prisma = createDemoCrmPrisma();
  try {
    if (apply) {
      await prisma.$transaction(
        async (tx) => {
          const state = getSeedState(await getDemoCounts(tx));
          if (state === 'complete') {
            console.log('Los datos DEMO ya están completos; no se realizaron cambios.');
            return;
          }
          const authorId = await getAuthor(tx);
          await createDemoData(tx, authorId);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 20000,
        },
      );
      console.log('Se creó el conjunto DEMO autorizado en una transacción.');
      return;
    }

    const counts = await getDemoCounts(prisma);
    const state = getSeedState(counts);
    if (state === 'empty') {
      const authorCount = await prisma.internalUser.count({
        where: { role: 'SUPER_ADMIN', isActive: true },
      });
      requireExactlyOneActiveSuperAdmin(authorCount);
      console.log('SIMULACIÓN: se crearían 3 empresas, 4 contactos, 3 solicitudes, 3 oportunidades y 4 actividades. Sin cambios.');
    } else {
      console.log('SIMULACIÓN: los datos DEMO ya están completos. Sin cambios.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  printSafeFailure(error);
  process.exitCode = 1;
});
