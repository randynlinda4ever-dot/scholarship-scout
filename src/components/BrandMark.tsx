type BrandMarkProps = {
  className: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      className={className}
      src="/brand/scholarship-scout-logo.png"
      alt=""
      aria-hidden="true"
      data-brand-symbol="graduation-hands"
      decoding="async"
    />
  );
}
