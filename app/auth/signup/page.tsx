import { SignUpForm } from "./SignUpForm";

export const metadata = {
  title: "Create account — Vesti",
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-black">
            Vesti
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            $100,000 in virtual cash. Beat the market.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">
            Create your account
          </h2>
          <SignUpForm />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Virtual money only. No real funds are used.
        </p>
      </div>
    </main>
  );
}
