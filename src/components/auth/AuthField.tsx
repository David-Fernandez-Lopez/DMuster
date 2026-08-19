"use client";

import { useTranslation } from "react-i18next";

interface AuthFieldProps {
  id: string;
  name: string;
  type: "text" | "email" | "password";
  label: string;
  autoComplete?: string;
  required?: boolean;
  /** Pre-filled value for edit forms (uncontrolled input). */
  defaultValue?: string;
  /** Maximum number of characters the input accepts. */
  maxLength?: number;
  /** Extra classes appended to the input (e.g. `uppercase`). */
  inputClassName?: string;
  /** i18n key of the field-level error, if any. */
  errorKey?: string;
  /** Renders the input non-editable (e.g. the fixed email on the invite accept form). */
  readOnly?: boolean;
}

/**
 * Labelled input used by the auth forms, rendering a translated field error
 * beneath the control when present. Hit target ≥44px (design handoff).
 *
 * @param {AuthFieldProps} props - Field configuration.
 * @returns {JSX.Element} The labelled input.
 */
export default function AuthField({
  id,
  name,
  type,
  label,
  autoComplete,
  required,
  defaultValue,
  maxLength,
  inputClassName,
  errorKey,
  readOnly,
}: AuthFieldProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        readOnly={readOnly}
        aria-invalid={errorKey ? true : undefined}
        aria-readonly={readOnly ? true : undefined}
        className={`min-h-[44px] rounded-[var(--radius-control)] border border-border px-3 text-ink outline-none focus:border-brand${
          readOnly ? " bg-bg-elevated text-ink-muted" : " bg-bg"
        }${inputClassName ? ` ${inputClassName}` : ""}`}
      />
      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
