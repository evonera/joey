"use client"

import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  CancelCircleIcon,
  Alert02Icon,
} from "hugeicons-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckmarkCircle02Icon className="size-4" />,
        info: <InformationCircleIcon className="size-4" />,
        warning: <Alert02Icon className="size-4" />,
        error: <CancelCircleIcon className="size-4" />,
        loading: <Loading03Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
