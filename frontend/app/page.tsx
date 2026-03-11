import { Suspense } from "react"
import Hero from "./components/Hero"
import Features from "./components/Features"
import AISection from "./components/AISection"
import VercelSection from "./components/VercelSection"
import Navigation from "./components/Navigation"
import LoadingSpinner from "./components/LoadingSpinner"

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black overflow-hidden">
      <Navigation />
      <Suspense fallback={<LoadingSpinner />}>
        <Hero />
        <Features />
        <AISection />
        <VercelSection />
      </Suspense>
    </main>
  )
}
