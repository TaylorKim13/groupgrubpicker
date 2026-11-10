type PhotoBannerProps = {
  title: string;
  subtitle?: string;
  photo?: "fresh" | "fries" | "account" | "create" | "join" | "reset" | "help";
  heading?: "h1" | "h2";
};

/** Decorative photography stays separate from readable, semantic page content. */
export function PhotoBanner({ title, subtitle, photo = "fresh", heading: Heading = "h1" }: PhotoBannerProps) {
  return (
    <section className={`photo-banner photo-banner-${photo}`}>
      <Heading>{title}</Heading>
      {subtitle && <p>{subtitle}</p>}
    </section>
  );
}
