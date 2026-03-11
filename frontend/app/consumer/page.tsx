"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ConsumerPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard
    router.replace('/consumer/dashboard')
  }, [router])

  return null
}
