import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  getAdditionalUserInfo,
  type User,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signInRedirect: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [signInRedirect, setSignInRedirect] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider)
    const u = result.user

    const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false

    // Set redirect target BEFORE Firestore awaits so it's ready when
    // onAuthStateChanged updates user state and PublicOnlyRoute re-renders
    setSignInRedirect(isNewUser ? '/onboarding/profile' : '/dashboard')

    const userRef = doc(db, 'users', u.uid)

    if (isNewUser) {
      await setDoc(userRef, {
        uid: u.uid,
        email: u.email ?? '',
        displayName: u.displayName ?? '',
        photoURL: u.photoURL,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        healthProfile: null,
        homeCity: null,
      })
    } else {
      await setDoc(
        userRef,
        {
          uid: u.uid,
          email: u.email ?? '',
          displayName: u.displayName ?? '',
          photoURL: u.photoURL,
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      )
    }
  }

  async function signOut() {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInRedirect, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
