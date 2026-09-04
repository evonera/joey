import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface JoeyLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  href?: string;
  className?: string;
  textClassName?: string;
}

export function JoeyLogo({
  size = "md",
  showText = true,
  href = "/",
  className,
  textClassName,
}: JoeyLogoProps) {
  const dimensions = {
    sm: { box: "size-7", img: 20, text: "text-lg" },
    md: { box: "size-8", img: 24, text: "text-xl" },
    lg: { box: "size-10", img: 30, text: "text-2xl" },
  }[size];

  const content = (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-[#ffe633]/20 border border-[#ffe633]/40 shadow-xs transition-transform hover:scale-105",
          dimensions.box
        )}
      >
        <Image
          src="/joey-mascot.png"
          alt="Joey Mascot"
          width={dimensions.img}
          height={dimensions.img}
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight text-foreground transition-colors hover:text-foreground/90",
            dimensions.text,
            textClassName
          )}
        >
          Joey
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
