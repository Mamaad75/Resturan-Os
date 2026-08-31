'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const FIELD_BASE =
  'w-full rounded-xl border border-line bg-surface-sunken px-3.5 text-ink ' +
  'placeholder:text-ink-subtle transition-colors ' +
  'hover:border-line-strong focus:border-gold focus:ring-2 focus:ring-gold/25 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function FieldShell({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-ink-muted"
        >
          {label}
          {required ? <span className="text-critical"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftAddon, rightAddon, className, containerClassName, id, dir, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      htmlFor={inputId}
      className={containerClassName}
    >
      {/*
        `dir` belongs on the wrapper, not just the input: the addons position
        themselves with logical properties (`start`/`end`) and the input
        reserves room for them with logical padding. A latin-direction field
        inside the RTL shell - every price and phone box - would otherwise put
        the padding on one side and the addon on the other, and the two would
        overlap.
      */}
      <div className="relative" dir={dir}>
        {leftAddon ? (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-ink-subtle">
            {leftAddon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          dir={dir}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            FIELD_BASE,
            'h-11',
            leftAddon && 'ps-10',
            rightAddon && 'pe-12',
            error && 'border-critical focus:border-critical focus:ring-critical/25',
            className,
          )}
          {...props}
        />
        {rightAddon ? (
          <span className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-sm text-ink-subtle">
            {rightAddon}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, className, id, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        required={props.required}
        htmlFor={fieldId}
      >
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(
            FIELD_BASE,
            'min-h-24 resize-y py-2.5 leading-relaxed',
            error && 'border-critical focus:border-critical',
            className,
          )}
          {...props}
        />
      </FieldShell>
    );
  },
);

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, containerClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      htmlFor={fieldId}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(
          FIELD_BASE,
          'h-11 appearance-none bg-[length:1.1rem] bg-[position:left_0.9rem_center] bg-no-repeat pe-3.5 ps-9',
          error && 'border-critical',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-surface-sunken p-4',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-gold' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
            // Logical offsets: "off" rests at the start edge (right, in RTL)
            // and "on" slides toward the end edge.
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </button>
    </label>
  );
}
