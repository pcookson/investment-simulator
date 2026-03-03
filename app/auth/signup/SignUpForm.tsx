"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { signUpAction, type SignUpState } from "./actions";

const initialState: SignUpState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <span
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden="true"
          />
          Creating account…
        </>
      ) : (
        "Create account"
      )}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useFormState(signUpAction, initialState);

  if (state.confirmEmail) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-gray-900">Check your email</p>
        <p className="mt-2 text-sm text-gray-500">
          We sent a confirmation link to your inbox. Click it to activate your
          account and get started.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="displayName"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="Jane Smith"
        />
        <p className="mt-1 text-xs text-gray-500">
          Shown on the leaderboard.
        </p>
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="Min. 6 characters"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          href="/auth/signin"
          className="font-medium text-black underline underline-offset-2 hover:text-gray-700"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
