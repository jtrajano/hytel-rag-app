import { useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { useForm, ControllerRenderProps } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Wind, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useAuth } from '@/hooks/useAuth'

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
})

type LoginFormValues = z.infer<typeof loginSchema>

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

const LoginSection = () => {
  const { signInWithGoogle, signInWithEmail } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(data: LoginFormValues) {
    setError(null)
    setLoading(true)
    try {
      await signInWithEmail(data.email, data.password)
    } catch (err: unknown) {
      console.error('Login error:', err)
      const firebaseError = err as { code?: string; message?: string }
      if (
        firebaseError.code === 'auth/invalid-credential' ||
        firebaseError.code === 'auth/user-not-found' ||
        firebaseError.code === 'auth/wrong-password'
      ) {
        setError('Invalid email or password.')
      } else {
        setError(firebaseError.message || 'Failed to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br px-6 py-12">
      <div className="mb-8 flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border shadow-sm">
        <Wind className="w-10 h-10 text-primary" />
      </div>

      <h1 className="text-4xl font-bold tracking-tight text-center mb-3 text-foreground">
        AirCare SEA
      </h1>
      <p className="text-base font-medium text-center text-muted-foreground max-w-xs mb-8">
        Sign in to get personalized air quality insights for Southeast Asia
      </p>

      <div className="w-full max-w-sm bg-card rounded-2xl p-8 shadow-xl border">
        <h2 className="text-xl font-semibold text-card-foreground text-center mb-6">
          Welcome Back
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/15 text-destructive text-sm text-center">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mb-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }: { field: ControllerRenderProps<LoginFormValues, 'email'> }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="hello@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({
                field,
              }: {
                field: ControllerRenderProps<LoginFormValues, 'password'>
              }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full font-medium mt-6" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </Form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button
          onClick={signInWithGoogle}
          variant="outline"
          size="lg"
          className="w-full gap-3 font-medium border-border hover:bg-muted/50 mb-6"
          disabled={loading}
        >
          <GoogleIcon />
          Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-primary hover:underline transition-all">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginSection
