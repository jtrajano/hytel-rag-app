import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Helper to avoid repeating the wrapper
const renderApp = () =>
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )

describe('App', () => {
  it('renders the header with title', () => {
    renderApp()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Hytel Way')
  })

  it('renders the counter with initial value of 0', () => {
    renderApp()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('increments the counter when clicking increase button', () => {
    renderApp()
    const increaseButton = screen.getByRole('button', { name: /increment counter/i })
    fireEvent.click(increaseButton)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('decrements the counter when clicking decrease button', () => {
    renderApp()
    const decreaseButton = screen.getByRole('button', { name: /decrement counter/i })
    fireEvent.click(decreaseButton)
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('resets counter to zero when clicking reset button', () => {
    renderApp()
    const increaseButton = screen.getByRole('button', { name: /increment counter/i })
    const resetButton = screen.getByRole('button', { name: /reset/i })

    fireEvent.click(increaseButton)
    fireEvent.click(increaseButton)
    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.click(resetButton)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders the stack overview card', () => {
    renderApp()
    expect(screen.getByText('Stack Overview', { exact: false })).toBeInTheDocument()
  })

  it('renders the monorepo structure card', () => {
    renderApp()
    expect(screen.getByText('Monorepo Structure', { exact: false })).toBeInTheDocument()
  })

  it('renders Vite and React logos', () => {
    renderApp()
    expect(screen.getByAltText('Vite logo')).toBeInTheDocument()
    expect(screen.getByAltText('React logo')).toBeInTheDocument()
  })
})
