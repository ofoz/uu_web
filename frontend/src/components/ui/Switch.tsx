import type { ReactNode } from "react";

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  inline = false,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  inline?: boolean;
  id?: string;
}) {
  const className = ["switch-control", inline ? "switch-control-inline" : "", disabled ? "is-disabled" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={className}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
      <i aria-hidden="true" />
    </label>
  );
}
