"use client"

import { CheckCircle2, AlertTriangle, Info } from "lucide-react"
import type { ReactNode } from "react"
import { useToast } from "@/hooks/use-toast"
import { useT } from "@/lib/i18n"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  // Toast text is written in English at the call site and translated here.
  const { t } = useT()
  const tr = (n: ReactNode) => (typeof n === "string" ? t(n) : n)

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon =
          variant === "destructive" ? AlertTriangle : variant === "success" ? CheckCircle2 : Info
        const iconColor =
          variant === "destructive"
            ? "text-destructive-foreground"
            : variant === "success"
            ? "text-accent"
            : "text-primary"

        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="grid gap-1">
              {title && <ToastTitle>{tr(title)}</ToastTitle>}
              {description && (
                <ToastDescription>{tr(description)}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
