import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEnvironmentStore } from '@/stores/settings/environment/store'

interface EnvVarDropdownProps {
  visible: boolean
  onSelect: (newValue: string) => void
  searchTerm?: string
  className?: string
  inputValue: string
  cursorPosition: number
  onClose?: () => void
}

export const EnvVarDropdown: React.FC<EnvVarDropdownProps> = ({
  visible,
  onSelect,
  searchTerm = '',
  className,
  inputValue,
  cursorPosition,
  onClose,
}) => {
  const envVars = useEnvironmentStore((state) => Object.keys(state.variables))
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Filter env vars based on search term
  const filteredEnvVars = envVars.filter((envVar) =>
    envVar.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchTerm])

  // Handle environment variable selection
  const handleEnvVarSelect = (envVar: string) => {
    const textBeforeCursor = inputValue.slice(0, cursorPosition)
    const textAfterCursor = inputValue.slice(cursorPosition)

    // Find the start of the env var syntax (last '{{' before cursor)
    const lastOpenBraces = textBeforeCursor.lastIndexOf('{{')

    // Get the text before the env var syntax
    const startText =
      lastOpenBraces !== -1 ? textBeforeCursor.slice(0, lastOpenBraces) : textBeforeCursor

    // Find the end of any existing env var syntax after cursor
    const closeIndex = textAfterCursor.indexOf('}}')
    const endText = closeIndex !== -1 ? textAfterCursor.slice(closeIndex + 2) : textAfterCursor

    // Construct the new value with proper env var syntax
    const newValue = startText + '{{' + envVar + '}}' + endText

    onSelect(newValue)
    onClose?.()
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!visible || filteredEnvVars.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < filteredEnvVars.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        handleEnvVarSelect(filteredEnvVars[selectedIndex])
        break
      case 'Escape':
        e.preventDefault()
        onClose?.()
        break
    }
  }

  // Add and remove keyboard event listener
  useEffect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible, selectedIndex, filteredEnvVars])

  if (!visible) return null

  return (
    <div
      className={cn(
        'absolute z-[9999] w-full mt-1 overflow-hidden bg-popover rounded-md border shadow-md',
        className
      )}
    >
      {filteredEnvVars.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          No matching environment variables
        </div>
      ) : (
        <div className="py-1">
          {filteredEnvVars.map((envVar, index) => (
            <button
              key={envVar}
              className={cn(
                'w-full px-3 py-1.5 text-sm text-left',
                'hover:bg-accent hover:text-accent-foreground',
                'focus:bg-accent focus:text-accent-foreground focus:outline-none',
                index === selectedIndex && 'bg-accent text-accent-foreground'
              )}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault() // Prevent input blur
                handleEnvVarSelect(envVar)
              }}
            >
              {envVar}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Helper function to check for '{{' trigger and get search term
export const checkEnvVarTrigger = (
  text: string,
  cursorPosition: number
): { show: boolean; searchTerm: string } => {
  if (cursorPosition >= 2) {
    const textBeforeCursor = text.slice(0, cursorPosition)
    const match = textBeforeCursor.match(/\{\{(\w*)$/)
    if (match) {
      return { show: true, searchTerm: match[1] }
    }
  }
  return { show: false, searchTerm: '' }
}
