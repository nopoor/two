import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ eyebrow, title, description, children, className }: Props) {
  return (
    <section className={`section-card ${className ?? ""}`.trim()}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <div className="section-header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
