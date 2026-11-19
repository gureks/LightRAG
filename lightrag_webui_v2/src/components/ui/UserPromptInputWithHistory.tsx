import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn, isImeComposing } from '@/lib/utils'
import Input from './Input'

interface UserPromptInputWithHistoryProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  history: string[]
  onSelectFromHistory: (prompt: string) => void
  onDeleteFromHistory?: (index: number) => void
}

export default function UserPromptInputWithHistory({
  value,
  onChange,
  placeholder,
  className,
  id,
  history,
  onSelectFromHistory,
  onDeleteFromHistory
}: UserPromptInputWithHistoryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isHovered, setIsHovered] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // While an IME is composing, Enter confirms its candidate and the arrow
    // keys move through its candidate list; none of them is meant for history.
    if (isImeComposing(e)) return
    if (!isOpen) {
      if (e.key === 'ArrowDown' && history.length > 0) {
        e.preventDefault()
        setIsOpen(true)
        setSelectedIndex(0)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < history.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        if (selectedIndex === 0) {
          setSelectedIndex(-1)
        }
        break
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < history.length) {
          e.preventDefault()
          const selectedPrompt = history[selectedIndex]
          onSelectFromHistory(selectedPrompt)
          setIsOpen(false)
          setSelectedIndex(-1)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSelectedIndex(-1)
        break
    }
  }, [isOpen, selectedIndex, history, onSelectFromHistory])

  const handleInputClick = () => {
    if (history.length > 0) {
      setIsOpen(!isOpen)
      setSelectedIndex(-1)
    }
  }

  const handleDropdownItemClick = (prompt: string) => {
    onSelectFromHistory(prompt)
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleMouseEnter = () => {
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  // Handle delete history item with boundary cases
  const handleDeleteHistoryItem = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering item selection
    onDeleteFromHistory?.(index)

    // Handle boundary cases
    if (history.length === 1) {
      // Deleting the last item, close dropdown
      setIsOpen(false)
      setSelectedIndex(-1)
    } else if (selectedIndex === index) {
      // Deleting currently selected item, adjust selection
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (selectedIndex > index) {
      // Deleting item before selected item, adjust index
      setSelectedIndex(prev => prev - 1)
    }
  }, [onDeleteFromHistory, history.length, selectedIndex])

  return (
    <div className="relative" ref={dropdownRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={handleInputClick}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(isHovered && history.length > 0 ? 'pr-5' : 'pr-2', 'w-full', className)}
        />
        {isHovered && history.length > 0 && (
          <button
            type="button"
            onClick={handleInputClick}
            className="hover:bg-default text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-0 transition-colors"
            tabIndex={-1}
          >
            <ChevronDown
              className={cn(
                'text-foreground h-3 w-3 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && history.length > 0 && (
        <div className="bg-overlay text-foreground border-border shadow-overlay absolute top-full right-0 left-0 z-50 mt-0.5 max-h-96 min-w-0 overflow-auto rounded-xl border">
          {history.map((prompt, index) => (
            <div
              key={index}
              className={cn(
                'hover:bg-default text-foreground flex items-center justify-between py-2 pr-1 pl-3 text-sm transition-colors',
                'border-border border-b last:border-b-0',
                'focus-within:bg-default',
                selectedIndex === index && 'bg-default'
              )}
            >
              <button
                type="button"
                onClick={() => handleDropdownItemClick(prompt)}
                className="text-foreground mr-0 flex-1 truncate text-left focus:outline-none"
                title={prompt}
              >
                {prompt}
              </button>
              {onDeleteFromHistory && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteHistoryItem(index, e)}
                  className="hover:bg-danger-soft ml-auto flex-shrink-0 rounded p-0 transition-colors focus:outline-none"
                  title="Delete this history item"
                >
                  <X className="text-foreground hover:text-danger h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
