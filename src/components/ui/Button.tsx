import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Spinner } from "./Feedback";

type Variant = "default" | "primary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  default: "",
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
  /** Shows a spinner and blocks clicks; the label stays so screen readers still hear it. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "default", size = "md", icon, loading, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn ${VARIANT[variant]} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** Square button with only an icon. `label` is required: it's the accessible name and the tooltip. */
export function IconButton({ label, icon, variant = "ghost", size = "md", className = "", ...rest }: Omit<ButtonProps, "children"> & { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`btn btn-icon ${VARIANT[variant]} ${size === "sm" ? "btn-sm w-7" : ""} ${className}`}
    >
      {icon}
    </button>
  );
}
