export type AlertTone = "amber" | "coral";

interface AlertProps {
  tone: AlertTone;
  title: string;
  body: string;
}

export function Alert({ tone, title, body }: AlertProps) {
  return (
    <div role="alert" className={`alert alert-${tone}`}>
      <span className="alert-dot">!</span>
      <div className="flex flex-col gap-[3px]">
        <div className="alert-title">{title}</div>
        <div className="text-[13px] leading-[1.5] text-body">{body}</div>
      </div>
    </div>
  );
}
