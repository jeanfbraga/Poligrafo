"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        className: "!font-mono !rounded-none !border !border-green-500 !bg-black !text-green-500 !uppercase !tracking-widest !text-xs !shadow-[0_0_15px_rgba(34,197,94,0.3)]",
        style: {
          background: 'black',
          border: '1px solid #22c55e',
          borderRadius: '0px',
          color: '#22c55e'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
