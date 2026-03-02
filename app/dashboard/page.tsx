// Placeholder — replaced by the full dashboard in Epic 6 (Stories 6.1–6.3).
import { SignOutButton } from "@/components/ui/SignOutButton";

export const metadata = {
  title: "Dashboard — Vesti",
};

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white gap-4">
      <h1 className="text-2xl font-bold text-black">Dashboard</h1>
      <p className="text-gray-500">Coming in Epic 6.</p>
      <SignOutButton />
    </main>
  );
}
