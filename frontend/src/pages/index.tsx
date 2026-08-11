import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

    if (token) {
      // Skip dashboard - go directly to investigation workspace
      router.replace('/investigation/90857')
    } else {
      router.replace('/login')
    }
  }, [router.isReady, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  )
}
