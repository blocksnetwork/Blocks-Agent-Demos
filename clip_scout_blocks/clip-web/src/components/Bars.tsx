interface BarsProps {
  values: number[];
  height: number;
  /** Bars at or past this index take the lit colour. */
  activeFrom?: number;
  activeClass: string;
  restClass: string;
}

/**
 * The bar meter, which the design uses twice at different scales: as a 36-bar
 * input level and as a 96-bar scrolling waveform.
 */
export function Bars({
  values,
  height,
  activeFrom = 0,
  activeClass,
  restClass,
}: BarsProps) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-1 items-end gap-[2px]"
      style={{ height }}
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={`block min-w-0 flex-[1_1_0] ${index >= activeFrom ? activeClass : restClass}`}
          style={{ height: Math.max(1, value * height) }}
        />
      ))}
    </span>
  );
}
