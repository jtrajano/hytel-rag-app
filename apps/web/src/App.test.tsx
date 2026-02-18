import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the header with title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Hytel Way')
  })

  it('renders the counter with initial value of 0', () => {
    render(<App />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('increments the counter when clicking increase button', () => {
    render(<App />)
    const increaseButton = screen.getByRole('button', { name: /increment counter/i })
    fireEvent.click(increaseButton)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('decrements the counter when clicking decrease button', () => {
    render(<App />)
    const decreaseButton = screen.getByRole('button', { name: /decrement counter/i })
    fireEvent.click(decreaseButton)
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('resets counter to zero when clicking reset button', () => {
    render(<App />)
    const increaseButton = screen.getByRole('button', { name: /increment counter/i })
    const resetButton = screen.getByRole('button', { name: /reset/i })

    // Increment a few times
    fireEvent.click(increaseButton)
    fireEvent.click(increaseButton)
    expect(screen.getByText('2')).toBeInTheDocument()

    // Reset
    fireEvent.click(resetButton)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders the stack overview card', () => {
    render(<App />)
    expect(screen.getByText('Stack Overview', { exact: false })).toBeInTheDocument()
  })

  it('renders the monorepo structure card', () => {
    render(<App />)
    expect(screen.getByText('Monorepo Structure', { exact: false })).toBeInTheDocument()
  })

  it('renders Vite and React logos', () => {
    render(<App />)
    expect(screen.getByAltText('Vite logo')).toBeInTheDocument()
    expect(screen.getByAltText('React logo')).toBeInTheDocument()
  })
})
