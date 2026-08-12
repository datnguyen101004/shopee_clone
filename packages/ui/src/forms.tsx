'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from './utils';

type FieldMetaProps = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

function useFieldIds(id?: string) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

function FieldMeta({
  fieldId,
  hintId,
  errorId,
  label,
  hint,
  error,
  optional,
}: FieldMetaProps & ReturnType<typeof useFieldIds>) {
  return (
    <>
      <label className="sc-field__label" htmlFor={fieldId}>
        {label}
        {optional ? <span className="sc-field__optional">Tuỳ chọn</span> : null}
      </label>
      {hint && !error ? (
        <span className="sc-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="sc-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

export type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & FieldMetaProps;

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { id, label, hint, error, optional, className, 'aria-describedby': describedBy, ...props },
  ref,
) {
  const ids = useFieldIds(id);
  const description =
    [describedBy, error ? ids.errorId : hint ? ids.hintId : undefined].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="sc-field" data-invalid={Boolean(error) || undefined}>
      <FieldMeta {...ids} label={label} hint={hint} error={error} optional={optional} />
      <input
        ref={ref}
        id={ids.fieldId}
        className={cn('sc-input', className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={description}
        {...props}
      />
    </div>
  );
});

export type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMetaProps;

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField(
    { id, label, hint, error, optional, className, 'aria-describedby': describedBy, ...props },
    ref,
  ) {
    const ids = useFieldIds(id);
    const description =
      [describedBy, error ? ids.errorId : hint ? ids.hintId : undefined]
        .filter(Boolean)
        .join(' ') || undefined;
    return (
      <div className="sc-field" data-invalid={Boolean(error) || undefined}>
        <FieldMeta {...ids} label={label} hint={hint} error={error} optional={optional} />
        <textarea
          ref={ref}
          id={ids.fieldId}
          className={cn('sc-textarea', className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={description}
          {...props}
        />
      </div>
    );
  },
);

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & FieldMetaProps;

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  {
    id,
    label,
    hint,
    error,
    optional,
    className,
    children,
    'aria-describedby': describedBy,
    ...props
  },
  ref,
) {
  const ids = useFieldIds(id);
  const description =
    [describedBy, error ? ids.errorId : hint ? ids.hintId : undefined].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="sc-field" data-invalid={Boolean(error) || undefined}>
      <FieldMeta {...ids} label={label} hint={hint} error={error} optional={optional} />
      <select
        ref={ref}
        id={ids.fieldId}
        className={cn('sc-select', className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={description}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});

type ChoiceFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
};

function ChoiceField({ label, description, className, id, type, ...props }: ChoiceFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  return (
    <div className="sc-choice">
      <input
        id={fieldId}
        type={type}
        className={cn('sc-choice__control', className)}
        aria-describedby={descriptionId}
        {...props}
      />
      <div>
        <label htmlFor={fieldId}>{label}</label>
        {description ? <span id={descriptionId}>{description}</span> : null}
      </div>
    </div>
  );
}

export function CheckboxField(props: Omit<ChoiceFieldProps, 'type'>) {
  return <ChoiceField type="checkbox" {...props} />;
}

export function RadioField(props: Omit<ChoiceFieldProps, 'type'>) {
  return <ChoiceField type="radio" {...props} />;
}
