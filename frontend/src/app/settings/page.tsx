import DashboardShell from "@/components/dashboard/DashboardShell";
import AccountSettingsClient from "@/components/settings/AccountSettingsClient";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <AccountSettingsClient />
    </DashboardShell>
  );
}
