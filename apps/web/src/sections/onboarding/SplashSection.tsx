import { Wind } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const SplashSection = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 px-6 text-white">
      {/* Logo / Icon */}
      <div className="mb-8 flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
        <Wind className="w-10 h-10 text-white" />
      </div>

      {/* Brand Heading */}
      <h1 className="text-5xl font-bold tracking-tight text-center mb-3">AirCare SEA</h1>

      {/* Tagline */}
      <p className="text-lg font-medium text-center text-white/95 max-w-xs mb-3">
        Your AI-Powered Air Quality & Allergy Companion for Southeast Asia
      </p>

      {/* Subtitle */}
      <p className="text-sm text-center text-white/80 max-w-sm mb-12">
        Make safer decisions about outdoor activity based on real-time air quality data
      </p>

      {/* CTA */}
      <Button
        asChild
        size="lg"
        className="bg-white text-teal-700 hover:bg-white/90 font-semibold px-10 rounded-full shadow-lg"
      >
        <Link to="/onboarding/profile">Get Started</Link>
      </Button>

      {/* Footnote */}
      <p className="mt-8 text-xs text-white/50">Powered by Gemini AI + Vertex AI</p>
    </div>
  )
}

export default SplashSection
