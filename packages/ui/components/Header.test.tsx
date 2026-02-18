import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from './Header'

describe('Header', () => {
  it('renders the title', () => {
    render(<Header title="Test Title" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Title')
  })

  it('applies Tailwind CSS classes', () => {
    render(<Header title="Styled" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveClass('text-4xl')
  })

  it('renders as a header element', () => {
    render(<Header title="Header" />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
