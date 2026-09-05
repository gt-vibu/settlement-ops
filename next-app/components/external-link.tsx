"use client"

/**
 * External reference link.
 *
 * This is the one place Skiper UI earns its keep in an enterprise finance console: the
 * underline-draw is a genuine affordance for "this leaves the app", which matters when
 * an operator is about to jump to a bank or documentation reference mid-investigation.
 *
 * Adapted from `Link003` in components/ui/skiper-ui/skiper40.tsx, with two corrections:
 *   - `rel="noopener noreferrer"` added (the original opens external targets without it);
 *   - `Link004`/`Link005` are deliberately NOT used - they hardcode `before:bg-white`
 *     with `mix-blend-difference`, which breaks in dark mode, and this app ships
 *     next-themes with defaultTheme="system".
 */

import { cn } from "@/lib/utils"

export function ExternalRef({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative inline-flex items-center text-foreground",
        "before:pointer-events-none before:absolute before:top-[1.4em] before:left-0 before:h-px before:w-full before:bg-current before:content-['']",
        "before:origin-center before:scale-x-0 before:transition-transform before:duration-200 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:scale-x-100",
        className
      )}
    >
      {children}
      <svg
        className="ml-[0.3em] size-[0.6em] translate-y-0.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
        fill="none"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  )
}
