import Link from "next/link";
import { Icon } from "../icon";
import { cn } from "@/lib/utils";

export function Dashboard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

export function MetricRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  icon,
  href,
  detail,
  onClick,
  pressed,
}: {
  label: string;
  value: string | number;
  icon?: string;
  href?: string;
  detail?: string;
  onClick?: () => void;
  pressed?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          data-slot="metric-value"
          className="text-3xl leading-none tracking-tight text-foreground"
        >
          {value}
        </span>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/30 text-foreground">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="mt-3 block text-sm font-medium">{label}</span>
      {detail && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {detail}
        </span>
      )}
    </>
  );
  const className =
    "flex min-h-24 w-full flex-col rounded-2xl border border-border/70 bg-card/80 p-3 text-left shadow-none";
  if (onClick)
    return (
      <button
        type="button"
        data-slot="metric"
        className={className}
        onClick={onClick}
        aria-pressed={pressed}
      >
        {body}
      </button>
    );
  if (href?.startsWith("#"))
    return (
      <a href={href} data-slot="metric" className={className}>
        {body}
      </a>
    );
  if (href)
    return (
      <Link href={href} data-slot="metric" className={className}>
        {body}
      </Link>
    );
  return <div data-slot="metric" className={className}>{body}</div>;
}

export function SurfaceGrid({
  children,
  variant = "split",
}: {
  children: React.ReactNode;
  variant?: "split" | "board" | "main" | "cards";
}) {
  const columns = {
    split: "lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.75fr)]",
    board: "md:grid-cols-2",
    main: "xl:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]",
    cards: "sm:grid-cols-2 xl:grid-cols-3",
  }[variant];
  return (
    <div className={cn("grid items-stretch gap-4", columns)}>{children}</div>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-3 md:grid-cols-2">{children}</div>;
}
