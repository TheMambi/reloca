import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 task" or "3 tasks": a count with the noun that agrees with it. */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
