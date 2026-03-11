"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BusinessPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard
    router.replace('/business/dashboard')
  }, [router])

  return null
}
