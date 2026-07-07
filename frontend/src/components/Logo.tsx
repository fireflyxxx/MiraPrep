export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize =
    size === "lg" ? "text-[22px]" : size === "sm" ? "text-[18px]" : "text-[21px]";
  return (
    <span className={`font-display font-bold tracking-tight ${textSize}`}>
      MiraPrep
      <span className="text-orange-500">.</span>
    </span>
  );
}
