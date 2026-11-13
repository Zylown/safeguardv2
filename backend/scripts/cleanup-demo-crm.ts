import { Prisma } from '../src/generated/prisma/client.js';
import {
  DEMO_ACTIVITY_DESCRIPTIONS,
  DEMO_COMPANIES,
  DEMO_CONTACTS,
  DEMO_INQUIRY_MESSAGES,
  DEMO_OPPORTUNITIES,
} from './demo-crm-plan.js';
import {
  createDemoCrmPrisma,
  isApplyMode,
  printSafeFailure,
  requireDevelopment,
} from './demo-crm-db.js';

const COMPANY_NAMES = DEMO_COMPANIES.map((row) => row.name);
const CONTACT_EMAILS = DEMO_CONTACTS.map((row) => row.email);
const OPPORTUNITY_NAMES = DEMO_OPPORTUNITIES.map((row) => row.name);

async function inspect(tx: Prisma.TransactionClient) {
  const [companies, contacts, inquiries, opportunities, activities] =
    await Promise.all([
      tx.company.findMany({ where: { name: { in: COMPANY_NAMES } }, select: { id: true } }),
      tx.contact.findMany({ where: { email: { in: CONTACT_EMAILS } }, select: { id: true, companyId: true } }),
      tx.inquiry.findMany({ where: { message: { in: DEMO_INQUIRY_MESSAGES } }, select: { id: true } }),
      tx.opportunity.findMany({ where: { name: { in: OPPORTUNITY_NAMES } }, select: { id: true, companyId: true } }),
      tx.activity.findMany({ where: { description: { in: DEMO_ACTIVITY_DESCRIPTIONS } }, select: { id: true } }),
    ]);

  const companyIds = companies.map((row) => row.id);
  const contactIds = contacts.map((row) => row.id);
  const opportunityIds = opportunities.map((row) => row.id);
  const inquiryIds = inquiries.map((row) => row.id);

  const [foreignContacts, foreignOpportunities, foreignInquiries, foreignActivities] =
    await Promise.all([
      companyIds.length
        ? tx.contact.count({ where: { companyId: { in: companyIds }, NOT: { email: { in: CONTACT_EMAILS } } } })
        : 0,
      companyIds.length
        ? tx.opportunity.count({ where: { companyId: { in: companyIds }, NOT: { name: { in: OPPORTUNITY_NAMES } } } })
        : 0,
      companyIds.length || contactIds.length || opportunityIds.length
        ? tx.inquiry.count({
            where: {
              NOT: { message: { in: DEMO_INQUIRY_MESSAGES } },
              OR: [
                ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
                ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
                ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
              ],
            },
          })
        : 0,
      companyIds.length || opportunityIds.length || inquiryIds.length
        ? tx.activity.count({
            where: {
              NOT: { description: { in: DEMO_ACTIVITY_DESCRIPTIONS } },
              OR: [
                ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
                ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
                ...(inquiryIds.length ? [{ inquiryId: { in: inquiryIds } }] : []),
              ],
            },
          })
        : 0,
    ]);

  if (foreignContacts || foreignOpportunities || foreignInquiries || foreignActivities)
    throw new Error('La limpieza podría afectar registros relacionados no DEMO; se aborta sin cambios.');

  return { companies, contacts, inquiries, opportunities, activities };
}

async function removeDemo(tx: Prisma.TransactionClient) {
  const rows = await inspect(tx);
  await tx.activity.deleteMany({ where: { id: { in: rows.activities.map((row) => row.id) } } });
  await tx.inquiry.deleteMany({ where: { id: { in: rows.inquiries.map((row) => row.id) } } });
  await tx.opportunity.deleteMany({ where: { id: { in: rows.opportunities.map((row) => row.id) } } });
  await tx.contact.deleteMany({ where: { id: { in: rows.contacts.map((row) => row.id) } } });
  await tx.company.deleteMany({ where: { id: { in: rows.companies.map((row) => row.id) } } });
  return {
    companies: rows.companies.length,
    contacts: rows.contacts.length,
    inquiries: rows.inquiries.length,
    opportunities: rows.opportunities.length,
    activities: rows.activities.length,
  };
}

async function main() {
  requireDevelopment();
  const apply = isApplyMode(process.argv.slice(2));
  const prisma = createDemoCrmPrisma();
  try {
    if (apply) {
      const counts = await prisma.$transaction(
        async (tx) => removeDemo(tx),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 20000,
        },
      );
      console.log(`Se limpiaron únicamente anclas DEMO: ${JSON.stringify(counts)}.`);
      return;
    }

    const rows = await inspect(prisma);
    const counts = {
      companies: rows.companies.length,
      contacts: rows.contacts.length,
      inquiries: rows.inquiries.length,
      opportunities: rows.opportunities.length,
      activities: rows.activities.length,
    };
    console.log(`SIMULACIÓN: limpieza de anclas DEMO: ${JSON.stringify(counts)}. Sin cambios.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  printSafeFailure(error);
  process.exitCode = 1;
});
