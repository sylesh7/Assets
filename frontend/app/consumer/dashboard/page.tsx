"use client"

import { useAccount, useWalletClient } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Navigation from '../../components/Navigation'
import { routerConfig } from '../../../config/onchain'
import { usePublicClient } from 'wagmi'
import { Search, Filter, TrendingUp, Heart, Building2, FileText, Car, Palette, Package, ShoppingCart } from 'lucide-react'

interface RWAAsset {
  id: string
  name: string
  type: string
  price: number
  confidence: number
  location?: string
  tokens_available: number
  owner?: string
  status?: string
}

// AssetRegistry ABI (only the transferAsset function)
const ASSET_REGISTRY_ABI = [
  {
    inputs: [
      { name: '_assetId', type: 'uint256' },
      { name: '_newOwner', type: 'address' }
    ],
    name: 'transferAsset',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

export default function ConsumerDashboard() {
  const { isConnected, address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const router = useRouter()
  const publicClient = usePublicClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [assets, setAssets] = useState<RWAAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [buyingAssetId, setBuyingAssetId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [purchasedAssets, setPurchasedAssets] = useState<Set<string>>(new Set())

  // Load purchased assets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('purchasedAssets')
    if (stored) {
      setPurchasedAssets(new Set(JSON.parse(stored)))
    }
  }, [])

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Fetch all requests from contract using publicClient
  useEffect(() => {
    const fetchRequests = async () => {
      if (!publicClient || !routerConfig.address) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        
        // First, try to get the request counter by reading all events or use a reasonable upper limit
        // Since requestCounter isn't exposed, we'll fetch requests incrementally
        const requests: RWAAsset[] = []
        const maxRequests = 100 // reasonable upper limit to check
        
        for (let i = 1; i <= maxRequests; i++) {
          try {
            const request = await publicClient.readContract({
              ...routerConfig,
              functionName: 'getRequest',
              args: [BigInt(i)],
            }) as any
            
            if (request) {
              // Convert request data to asset format
              const assetType = ['REAL_ESTATE', 'INVOICE', 'VEHICLE', 'ART', 'COMMODITY', 'OTHER'][request.assetType] || 'REAL_ESTATE'
              const asset: RWAAsset = {
                id: request.requestId?.toString() || i.toString(),
                name: `Asset #${i}`, // We'll get better names if available
                type: assetType,
                price: Number(request.valuation || 0),
                confidence: Number(request.confidence || 0),
                location: request.location || 'Unknown',
                tokens_available: request.valuation ? Math.floor(Number(request.valuation) / 1e18) : 0,
                owner: request.owner,
                status: request.status,
              }
              
              // Only include verified assets (status = 2 for VERIFIED)
              if (request.status === 2 && asset.price > 0) {
                requests.push(asset)
              }
            }
          } catch (error) {
            // Request doesn't exist, continue
            continue
          }
        }
        
        setAssets(requests)
      } catch (error) {
        console.error('Failed to fetch requests:', error)
        setAssets([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRequests()
  }, [publicClient])

  // Handle buying asset (transferring ownership)
  const handleBuyAsset = async (assetId: string) => {
    if (!address) {
      setMessage({ type: 'error', text: 'Please connect your wallet first' })
      setTimeout(() => setMessage(null), 4000)
      return
    }

    if (!walletClient) {
      setMessage({ type: 'error', text: 'Wallet client not available' })
      setTimeout(() => setMessage(null), 4000)
      return
    }

    setBuyingAssetId(assetId)
    setMessage(null)

    try {
      const ASSET_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS as `0x${string}`

      if (!ASSET_REGISTRY_ADDRESS) {
        throw new Error('Contract address not configured')
      }

      console.log('Transferring asset:', assetId)
      console.log('From wallet:', address)
      console.log('Buyer:', address)

      // Call transferAsset function using the connected wallet (will trigger MetaMask)
      const hash = await walletClient.writeContract({
        address: ASSET_REGISTRY_ADDRESS,
        abi: ASSET_REGISTRY_ABI,
        functionName: 'transferAsset',
        args: [BigInt(assetId), address],
      })

      console.log('Transaction sent:', hash)

      // Mark asset as purchased immediately after transaction is sent
      const newPurchased = new Set(purchasedAssets)
      newPurchased.add(assetId)
      setPurchasedAssets(newPurchased)
      localStorage.setItem('purchasedAssets', JSON.stringify([...newPurchased]))

      setMessage({
        type: 'success',
        text: `Purchase transaction submitted! Hash: ${hash.slice(0, 10)}...`
      })
      setTimeout(() => setMessage(null), 5000)

      // Try to wait for confirmation but don't fail if receipt not found
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
            timeout: 30_000, // Reduced timeout to 30 seconds
          })

          if (receipt.status === 'success') {
            console.log('Transaction confirmed:', receipt)
          } else {
            console.warn('Transaction may have failed')
          }
        } catch (receiptError) {
          // Transaction sent but receipt not found yet - that's ok
          console.log('Receipt not found yet, transaction may still be processing')
        }
      }
    } catch (error: any) {
      console.error('Buy asset error:', error)
      setMessage({
        type: 'error',
        text: `Failed to purchase asset: ${error.shortMessage || error.message || 'Unknown error'}`
      })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setBuyingAssetId(null)
    }
  }

  if (!isConnected) {
    return null
  }

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.location?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = selectedFilter === 'all' || asset.type === selectedFilter
    return matchesSearch && matchesFilter
  })

  return (
    <main className="min-h-screen bg-white text-black overflow-hidden">
      <Navigation variant="consumer" />
      
      {/* Grid Background Pattern */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `
            linear-gradient(to right, #000 1px, transparent 1px),
            linear-gradient(to bottom, #000 1px, transparent 1px)
          `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-4 h-4 border border-black opacity-20 rotate-45 animate-pulse"></div>
        <div className="absolute bottom-32 right-32 w-6 h-6 border border-black opacity-15 animate-bounce"></div>
        <div className="absolute top-1/3 right-20 w-2 h-2 bg-black opacity-30 animate-ping"></div>
      </div>

      {/* Dashboard Content */}
      <div className="relative z-10 pt-24 px-6 max-w-7xl mx-auto">
        {/* Success/Error Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-2 font-mono ${
            message.type === 'success' 
              ? 'bg-green-50 border-green-500 text-green-800' 
              : 'bg-red-50 border-red-500 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="mb-12">
          <h1 className="text-6xl font-light tracking-wider mb-4 font-mono">
            RWA <span className="font-bold">MARKETPLACE</span>
          </h1>
          <div className="w-64 h-px bg-black mb-8 relative">
            <div className="absolute left-0 top-0 h-full bg-black animate-pulse" style={{ width: "100%" }}></div>
          </div>
          <p className="text-gray-600 text-lg">Discover and invest in verified real-world assets tokenized on Mantle blockchain</p>
        </div>

        {/* Search and Filter Section */}
        <div className="mb-12 space-y-6">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search assets by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-black rounded-xl font-mono text-lg focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-3">
            {['all', 'REAL_ESTATE', 'INVOICE', 'VEHICLE', 'ART', 'COMMODITY', 'OTHER'].map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-6 py-2 font-mono font-bold border-2 rounded-lg transition-all ${
                  selectedFilter === filter
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-50'
                }`}
              >
                {filter === 'all' ? 'ALL ASSETS' : filter.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
              <div className="text-sm text-gray-600 font-mono mb-1">TOTAL ASSETS</div>
              <div className="text-3xl font-bold font-mono">{filteredAssets.length}</div>
            </div>
            <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
              <div className="text-sm text-gray-600 font-mono mb-1">TOTAL MARKET CAP</div>
              <div className="text-3xl font-bold font-mono">${(filteredAssets.reduce((sum, a) => sum + a.price, 0) / 1000000).toFixed(2)}M</div>
            </div>
            <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
              <div className="text-sm text-gray-600 font-mono mb-1">AVG CONFIDENCE</div>
              <div className="text-3xl font-bold font-mono">{filteredAssets.length > 0 ? (filteredAssets.reduce((sum, a) => sum + a.confidence, 0) / filteredAssets.length).toFixed(1) : '0'}%</div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-20">
            <p className="text-2xl font-mono text-gray-600">Loading marketplace assets...</p>
          </div>
        )}

        {/* Assets Grid */}
        {!isLoading && (
          <>
            {filteredAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredAssets.map((asset) => {
              const getAssetIcon = (type: string) => {
                switch(type) {
                  case 'REAL_ESTATE': return <Building2 size={48} className="text-gray-400 opacity-50" />
                  case 'INVOICE': return <FileText size={48} className="text-gray-400 opacity-50" />
                  case 'VEHICLE': return <Car size={48} className="text-gray-400 opacity-50" />
                  case 'ART': return <Palette size={48} className="text-gray-400 opacity-50" />
                  case 'COMMODITY': return <Package size={48} className="text-gray-400 opacity-50" />
                  default: return <TrendingUp size={48} className="text-gray-400 opacity-50" />
                }
              }
              
              return (
              <div
                key={asset.id}
                onClick={() => router.push(`/consumer/asset/${asset.id}`)}
                className="bg-white border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_black] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_black] transition-all duration-300 cursor-pointer group"
              >
                {/* Asset Image Placeholder */}
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {getAssetIcon(asset.type)}
                  </div>
                  {/* Confidence Badge */}
                  {asset.confidence > 0 && (
                    <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 rounded-full text-sm font-mono font-bold">
                      {asset.confidence.toFixed(1)}%
                    </div>
                  )}
                  {/* Favorite Button */}
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-4 right-4 w-10 h-10 bg-white rounded-full border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all">
                    <Heart size={20} />
                  </button>
                </div>

                {/* Asset Details */}
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-2xl font-mono font-bold mb-2">{asset.name}</h3>
                    {asset.location && (
                      <p className="text-sm text-gray-600 font-mono">{asset.location}</p>
                    )}
                    <div className="mt-2">
                      <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono font-bold">
                        {asset.type.replace('_', ' ')}
                      </span>
                        </div>
                      </div>

                      {/* Price Section */}
                      <div className="border-t-2 border-black pt-4 mb-4">
                        <div className="text-sm text-gray-600 font-mono mb-1">PRICE</div>
                        <div className="text-3xl font-bold font-mono mb-2">${asset.price.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 font-mono">{asset.tokens_available.toLocaleString()} tokens available</div>
                      </div>

                      {/* CTA Buttons */}
                      <div className="space-y-2">
                        {purchasedAssets.has(asset.id) ? (
                          <div className="w-full py-3 bg-green-50 text-green-700 font-mono font-bold rounded-lg border-2 border-green-500 text-center">
                            ✓ PURCHASED
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBuyAsset(asset.id)
                            }}
                            disabled={buyingAssetId === asset.id}
                            className={`w-full py-3 font-mono font-bold rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                              buyingAssetId === asset.id
                                ? 'bg-gray-300 text-gray-600 border-gray-400 cursor-not-allowed'
                                : 'bg-black text-white border-black hover:bg-white hover:text-black'
                            }`}
                          >
                            <ShoppingCart size={20} />
                            {buyingAssetId === asset.id ? 'PROCESSING...' : 'BUY ASSET'}
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/consumer/asset/${asset.id}`)
                          }}
                          className="w-full py-3 bg-white text-black font-mono font-bold rounded-lg border-2 border-black hover:bg-gray-50 transition-all duration-200">
                          VIEW DETAILS
                        </button>
                      </div>
                    </div>
                  </div>
                )
            })}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-2xl font-mono text-gray-600 mb-4">No assets found in marketplace</p>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedFilter('all')
                  }}
                  className="px-6 py-3 bg-black text-white font-mono font-bold rounded-lg border-2 border-black hover:bg-white hover:text-black transition-all"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
