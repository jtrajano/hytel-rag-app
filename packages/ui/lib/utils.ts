import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function for merging Tailwind CSS classes
 *
 * Think of this as a "smart wardrobe organizer" - it combines multiple
 * clothing items (CSS classes) and resolves any conflicts automatically.
 *
 * Example: cn("px-4", "px-6") → "px-6" (last one wins for conflicts)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
