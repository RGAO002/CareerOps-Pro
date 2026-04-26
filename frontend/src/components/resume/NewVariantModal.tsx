// frontend/src/components/resume/NewVariantModal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

interface Props {
  parentId: string;
  parentTitle: string;
  onClose: () => void;
}

export function NewVariantModal({ parentId, parentTitle, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(`Copy of ${parentTitle}`);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const variant = await resumeApi.createVariant(parentId, {
        title: title.trim() || `Copy of ${parentTitle}`,
        target_company: company.trim() || undefined,
        target_role: role.trim() || undefined,
      });
      router.push(`/resume/${variant.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[400px] rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-neutral-900">
          New variant from this resume
        </h2>
        <div className="space-y-3">
          <Field label="Variant name">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              autoFocus
            />
          </Field>
          <Field label="Target company (optional)">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Target role (optional)">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Backend SWE"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create variant"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
