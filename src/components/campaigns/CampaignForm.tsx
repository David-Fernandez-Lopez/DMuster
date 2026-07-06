"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import { firstFieldErrors } from "@/lib/validation/auth";
import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_TAG_LENGTH,
  type CampaignFormState,
  campaignSchema,
} from "@/lib/validation/campaign";

interface CampaignFormProps {
  /**
   * When present, the form edits this campaign (PUT); otherwise it creates a
   * new one (POST).
   */
  campaign?: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
  };
}

const INITIAL_STATE: CampaignFormState = {};

/**
 * Shared create/edit campaign form. Validates client-side with the same Zod
 * schema the API uses (instant field errors, tag uppercased), then writes
 * through the REST API via `fetch`. On success it navigates back to the list
 * and refreshes the server-rendered data.
 *
 * @param {CampaignFormProps} props - Optional campaign to edit.
 * @returns {JSX.Element} The campaign form.
 */
export default function CampaignForm({ campaign }: CampaignFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<CampaignFormState>(INITIAL_STATE);
  const [isPending, setIsPending] = useState(false);

  const isEdit = campaign !== undefined;

  /**
   * Validates the form and sends it to the campaigns API. Prevents the default
   * navigation, keeps a pending flag for the submit button, and maps API errors
   * back onto the form.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - The submit event.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const parsed = campaignSchema.safeParse({
      name: formData.get("name"),
      tag: formData.get("tag"),
      description: formData.get("description"),
    });

    if (!parsed.success) {
      setState({
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      });
      return;
    }

    setState(INITIAL_STATE);
    setIsPending(true);

    try {
      const response = await fetch(
        isEdit ? `/api/campaigns/${campaign.id}` : "/api/campaigns",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setState({
          error: body?.error ?? "campaigns.errors.unknown",
          fieldErrors: body?.fieldErrors,
        });
        return;
      }

      router.push("/campaigns");
      router.refresh();
    } catch {
      setState({ error: "campaigns.errors.unknown" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="name"
        name="name"
        type="text"
        label={t("campaigns.form.name")}
        required
        defaultValue={campaign?.name}
        maxLength={CAMPAIGN_NAME_MAX_LENGTH}
        errorKey={state.fieldErrors?.name}
      />
      <AuthField
        id="tag"
        name="tag"
        type="text"
        label={t("campaigns.form.tag")}
        required
        defaultValue={campaign?.tag}
        maxLength={CAMPAIGN_TAG_LENGTH}
        inputClassName="uppercase"
        errorKey={state.fieldErrors?.tag}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="text-sm font-medium text-ink"
        >
          {t("campaigns.form.description")}
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={CAMPAIGN_DESCRIPTION_MAX_LENGTH}
          defaultValue={campaign?.description ?? ""}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          className="min-h-[88px] rounded-[var(--radius-control)] border border-border bg-bg px-3 py-2 text-ink outline-none focus:border-brand"
        />
        {state.fieldErrors?.description ? (
          <p className="text-sm text-n" role="alert">
            {t(state.fieldErrors.description)}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p
          className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n"
          role="alert"
        >
          {t(state.error)}
        </p>
      ) : null}

      <SubmitButton
        label={
          isEdit
            ? t("campaigns.form.submitSave")
            : t("campaigns.form.submitCreate")
        }
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />

      <Link
        href="/campaigns"
        className="text-center text-sm font-semibold text-ink-muted hover:underline"
      >
        {t("common.cancel")}
      </Link>
    </form>
  );
}
