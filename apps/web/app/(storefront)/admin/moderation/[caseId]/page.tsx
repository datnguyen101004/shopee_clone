import AdminModerationPage from '../page';

export default async function AdminModerationCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <AdminModerationPage initialCaseId={caseId} />;
}
