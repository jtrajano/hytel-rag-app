import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Counter } from './Counter'

describe('Counter', () => {
  it('renders with initial count of 0', () => {
    render(<Counter />)
    expect(screen.getByRole('button')).toHaveTextContent('count is 0')
  })

  it('increments count when clicked', () => {
    render(<Counter />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(button).toHaveTextContent('count is 1')
  })

  it('increments multiple times', () => {
    render(<Counter />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toHaveTextContent('count is 3')
  })

  it('accepts initial count prop', () => {
    render(<Counter initialCount={5} />)
    expect(screen.getByRole('button')).toHaveTextContent('count is 5')
  })
})
