/**
 * =============================================================================
 * WELCOME TO THE HYTEL WAY: MONOREPO STACK
 * =============================================================================
 *
 * This file demonstrates the key concepts of our tech stack using friendly
 * analogies. Think of building a web app like putting on a theater production!
 *
 * THE STACK EXPLAINED (Theater Analogy):
 *
 * PNPM (Package Manager)
 *    -> "The super-organized prop master"
 *    -> Manages all the tools/packages we need, storing them efficiently
 *    -> Unlike npm, it doesn't duplicate packages - saves space!
 *
 * TURBOREPO (Monorepo Build System)
 *    -> "The stage manager who coordinates everything"
 *    -> Runs tasks (build, test, dev) across multiple packages smartly
 *    -> Caches results so repeated tasks are lightning fast!
 *
 * REACT + VITE (Frontend Framework + Build Tool)
 *    -> "The stage and lighting system"
 *    -> React: Builds the interactive UI (the actors on stage)
 *    -> Vite: Super-fast dev server (instant lighting changes!)
 *
 * TAILWIND CSS + SHADCN UI (Styling)
 *    -> "The costume designer"
 *    -> Tailwind: Utility classes for quick styling (fabric swatches)
 *    -> Shadcn UI: Pre-made, beautiful component patterns (costume templates)
 *
 * @repo/ui (Shared Component Package)
 *    -> "The shared costume closet"
 *    -> Components here (Header, Button, Card) can be used by ANY app!
 *    -> Located in: packages/ui/
 *
 * @repo/shared (Shared Types & Schemas)
 *    -> "The spellbook of shared rules"
 *    -> Zod schemas define what data looks like (validation spells!)
 *    -> Located in: packages/shared/
 *
 * tRPC + TanStack Query (API Layer)
 *    -> "The messenger system between actors"
 *    -> tRPC: Type-safe communication with backend (no lost messages!)
 *    -> TanStack Query: Smart caching of server data (remembers the script!)
 *
 * =============================================================================
 */

import { useState } from 'react'
import './style.css'

// Importing from @repo/ui - the "shared component closet"
// These components live in packages/ui/ and can be used by any app!
import { Header } from '@repo/ui/Header'
import { Button } from '@repo/ui/Button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@repo/ui/Card'

// Assets
import viteLogo from '/vite.svg'
import reactLogo from '/react.svg'

/**
 * Main App Component
 *
 * This is the "main stage" of our application. Everything you see
 * in the browser starts here!
 */
export function App() {
  // React State - like a scoreboard that updates the display automatically
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen py-8 px-4">
      {/* 
        Header Component from @repo/ui
        This comes from our shared "costume closet" (packages/ui)
        Any app in the monorepo can use this same Header!
      */}
      <Header title="The Hytel Way" />

      {/* Logo Section */}
      <div className="flex justify-center gap-8 my-8">
        <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
          <img src={reactLogo} className="logo" alt="React logo" />
        </a>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2">
        {/* 
          Interactive Counter Card
          Demonstrates React state + Shadcn UI components
        */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive Counter</CardTitle>
            <CardDescription>
              Click the buttons to change the count. This demonstrates React state management - when
              count changes, the UI updates automatically!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-6xl font-bold text-primary mb-6">{count}</p>
              <div className="flex justify-center gap-4">
                {/* 
                  Shadcn UI Buttons
                  These come from packages/ui/components/ui/button.tsx
                  The "variant" prop changes the button style (like costume options!)
                */}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setCount(c => c - 1)}
                  aria-label="Decrement counter"
                >
                  - Decrease
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => setCount(c => c + 1)}
                  aria-label="Increment counter"
                >
                  + Increase
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="ghost" onClick={() => setCount(0)}>
              Reset to Zero
            </Button>
          </CardFooter>
        </Card>

        {/* 
          Stack Info Card
          Educational content about the monorepo structure
        */}
        <Card>
          <CardHeader>
            <CardTitle>Stack Overview</CardTitle>
            <CardDescription>
              What powers this template? Here's the cast of characters!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <div>
                <strong>pnpm</strong> - Fast, disk-efficient package manager
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <strong>Turborepo</strong> - Smart monorepo build system
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <strong>React + Vite</strong> - Fast UI development
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <strong>Tailwind + Shadcn</strong> - Beautiful styling
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <strong>tRPC</strong> - Type-safe API layer
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <strong>TanStack Query</strong> - Server state management
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 
          Monorepo Structure Card
        */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Monorepo Structure</CardTitle>
            <CardDescription>Where to find things in this project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6 text-sm font-mono">
              <div>
                <h4 className="font-bold text-primary mb-2">apps/</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    |-- web/ <span className="text-xs">(this React app)</span>
                  </li>
                  <li>
                    |-- functions/ <span className="text-xs">(tRPC backend)</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-primary mb-2">packages/</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    |-- ui/ <span className="text-xs">(shared components)</span>
                  </li>
                  <li>
                    |-- shared/ <span className="text-xs">(Zod schemas)</span>
                  </li>
                  <li>
                    |-- config/ <span className="text-xs">(TypeScript config)</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-center gap-4">
            <a href="https://turbo.build/repo/docs" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">Turborepo Docs</Button>
            </a>
            <a href="https://ui.shadcn.com" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">Shadcn UI Docs</Button>
            </a>
          </CardFooter>
        </Card>
      </div>

      {/* Footer */}
      <p className="text-center text-muted-foreground mt-8 text-sm">
        Edit <code className="bg-muted px-1 rounded">apps/web/src/App.tsx</code> and save to see hot
        reload in action!
      </p>
    </div>
  )
}
