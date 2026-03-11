export default function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-16 h-16 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <div className="font-mono text-sm text-gray-600">LOADING NEXORASIM...</div>
      </div>
    </div>
  )
}
