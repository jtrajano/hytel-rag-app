import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuthContext } from './AuthProvider'

type AuthContextTestShape = {
  user: { uid: string } | null
  loading: boolean
  signInRedirect: string | null
  signInWithEmail: (email: string, pass: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const {
  mockAuth,
  mockDb,
  mockGoogleProvider,
  mockOnAuthStateChanged,
  mockSignInWithPopup,
  mockSignInWithEmailAndPassword,
  mockCreateUserWithEmailAndPassword,
  mockFirebaseSignOut,
  mockGetAdditionalUserInfo,
  mockDoc,
  mockGetDoc,
  mockSetDoc,
  mockServerTimestamp,
} = vi.hoisted(() => ({
  mockAuth: { currentUser: null as null | { uid: string } },
  mockDb: {},
  mockGoogleProvider: {},
  mockOnAuthStateChanged: vi.fn(),
  mockSignInWithPopup: vi.fn(),
  mockSignInWithEmailAndPassword: vi.fn(),
  mockCreateUserWithEmailAndPassword: vi.fn(),
  mockFirebaseSignOut: vi.fn(),
  mockGetAdditionalUserInfo: vi.fn(),
  mockDoc: vi.fn((_db, collection: string, uid: string) => `${collection}/${uid}`),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'ts'),
}))

vi.mock('@/lib/firebase', () => ({
  auth: mockAuth,
  db: mockDb,
  googleProvider: mockGoogleProvider,
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithPopup: mockSignInWithPopup,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  signOut: mockFirebaseSignOut,
  getAdditionalUserInfo: mockGetAdditionalUserInfo,
}))

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  serverTimestamp: mockServerTimestamp,
}))

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.currentUser = null
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null)
      return vi.fn()
    })
    mockGetDoc.mockResolvedValue({ data: () => ({ homeCity: null }) })
  })

  it('throws when useAuthContext is used outside provider', () => {
    expect(() => renderHook(() => useAuthContext())).toThrow(
      'useAuthContext must be used within AuthProvider'
    )
  })

  it('signs in with email, sets redirect, and updates last login timestamp', async () => {
    let ctx: AuthContextTestShape | null = null
    const getCtx = () => {
      if (!ctx) throw new Error('auth context not ready')
      return ctx
    }
    function Capture() {
      ctx = useAuthContext() as unknown as AuthContextTestShape
      return null
    }

    mockAuth.currentUser = { uid: 'user-1' }
    mockSignInWithEmailAndPassword.mockResolvedValue({})

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    )

    await waitFor(() => expect(getCtx().loading).toBe(false))
    await act(async () => {
      await getCtx().signInWithEmail('jane@example.com', 'secret')
    })

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'jane@example.com',
      'secret'
    )
    expect(mockSetDoc).toHaveBeenCalledWith('users/user-1', { lastLoginAt: 'ts' }, { merge: true })
    expect(getCtx().signInRedirect).toBe('/dashboard')
  })

  it('creates a new firestore profile for new google sign-ins', async () => {
    let ctx: AuthContextTestShape | null = null
    const getCtx = () => {
      if (!ctx) throw new Error('auth context not ready')
      return ctx
    }
    function Capture() {
      ctx = useAuthContext() as unknown as AuthContextTestShape
      return null
    }

    mockSignInWithPopup.mockResolvedValue({
      user: {
        uid: 'google-user',
        email: 'g@example.com',
        displayName: 'Google User',
        photoURL: 'https://img',
      },
    })
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: true })

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    )

    await waitFor(() => expect(getCtx()).toBeTruthy())
    await act(async () => {
      await getCtx().signInWithGoogle()
    })

    expect(mockSignInWithPopup).toHaveBeenCalledWith(mockAuth, mockGoogleProvider)
    expect(mockSetDoc).toHaveBeenCalledWith(
      'users/google-user',
      expect.objectContaining({
        uid: 'google-user',
        email: 'g@example.com',
        displayName: 'Google User',
        homeCity: null,
      })
    )
    expect(getCtx().signInRedirect).toBe('/onboarding/profile')
  })

  it('signs out and clears redirect', async () => {
    let ctx: AuthContextTestShape | null = null
    const getCtx = () => {
      if (!ctx) throw new Error('auth context not ready')
      return ctx
    }
    function Capture() {
      ctx = useAuthContext() as unknown as AuthContextTestShape
      return null
    }

    mockFirebaseSignOut.mockResolvedValue(undefined)
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'user-1' })
      return vi.fn()
    })

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    )

    await waitFor(() => expect(getCtx().user).toBeTruthy())
    await act(async () => {
      await getCtx().signOut()
    })

    expect(mockFirebaseSignOut).toHaveBeenCalledWith(mockAuth)
    expect(getCtx().user).toBeNull()
    expect(getCtx().signInRedirect).toBeNull()
  })
})
