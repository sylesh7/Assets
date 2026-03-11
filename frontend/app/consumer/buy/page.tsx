"use client"

import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Navigation from '../../components/Navigation'
import { MapPin, DollarSign, Home, Building2, Calendar, CheckCircle } from 'lucide-react'

// Mock data - In production, this would come from your backend/blockchain
const mockAssets = [
  {
    id: 1,
    name: "Downtown Office Building",
    type: "Commercial Real Estate",
    location: "New York, USA",
    valuation: 2500000,
    description: "Modern office building in prime downtown location with 10 floors and parking",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0x1234...5678",
    dateAdded: "2026-01-05",
    size: "15,000 sq ft",
    yearBuilt: 2020
  },
  {
    id: 2,
    name: "Luxury Apartment Complex",
    type: "Residential Real Estate",
    location: "Los Angeles, USA",
    valuation: 5000000,
    description: "Premium apartment complex with 50 units, pool, and fitness center",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0x8765...4321",
    dateAdded: "2026-01-04",
    size: "45,000 sq ft",
    yearBuilt: 2022
  },
  {
    id: 3,
    name: "Historic Townhouse",
    type: "Residential Real Estate",
    location: "London, UK",
    valuation: 3200000,
    description: "Beautifully restored Victorian townhouse in prestigious neighborhood",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0xabcd...efgh",
    dateAdded: "2026-01-03",
    size: "4,500 sq ft",
    yearBuilt: 1890
  },
  {
    id: 4,
    name: "Beachfront Villa",
    type: "Residential Real Estate",
    location: "Miami, USA",
    valuation: 4500000,
    description: "Stunning oceanfront property with private beach access and modern amenities",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0x5555...6666",
    dateAdded: "2026-01-02",
    size: "6,000 sq ft",
    yearBuilt: 2021
  },
  {
    id: 5,
    name: "Shopping Mall",
    type: "Commercial Real Estate",
    location: "Dubai, UAE",
    valuation: 15000000,
    description: "Large shopping center with 100+ retail units and entertainment facilities",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0x9999...1111",
    dateAdded: "2026-01-01",
    size: "250,000 sq ft",
    yearBuilt: 2019
  },
  {
    id: 6,
    name: "Industrial Warehouse",
    type: "Commercial Real Estate",
    location: "Chicago, USA",
    valuation: 1800000,
    description: "Modern logistics facility with loading docks and climate control",
    image: "/api/placeholder/400/300",
    verificationStatus: "verified",
    businessOwner: "0x2222...3333",
    dateAdded: "2025-12-30",
    size: "80,000 sq ft",
    yearBuilt: 2023
  }
]

export default function BuyPage() {
  const { isConnected, address } = useAccount()
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  if (!isConnected) {
    return null
  }

  const filteredAssets = mockAssets.filter(asset => {
    const matchesType = selectedType === "all" || asset.type.toLowerCase().includes(selectedType.toLowerCase())
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         asset.location.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  const handleBuyAsset = (assetId: number) => {
    console.log('Buying asset:', assetId)
    // TODO: Implement purchase flow with smart contract
  }

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
        <div className="absolute bottom-1/4 left-1/4 w-12 h-1 bg-black opacity-10 rotate-12"></div>
        <div className="absolute top-1/2 left-10 w-8 h-8 border border-black opacity-10 rotate-45"></div>
      </div>

      {/* Buy Page Content */}
      <div className="relative z-10 pt-24 px-6 max-w-7xl mx-auto pb-12">
        <div className="mb-8">
          <h1 className="text-6xl font-light tracking-wider mb-4 font-mono">
            BUY <span className="font-bold">ASSETS</span>
          </h1>
          <div className="w-64 h-px bg-black mb-8 relative">
            <div className="absolute left-0 top-0 h-full bg-black animate-pulse" style={{ width: "100%" }}></div>
          </div>
          <p className="text-gray-600 font-mono text-sm">
            Browse verified real-world assets tokenized on Mantle Network
          </p>
        </div>

        {/* Search and Filter Section */}
        <div className="mb-8 p-6 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_black]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search Bar */}
            <div>
              <label className="block text-sm font-mono font-bold mb-2">Search Assets</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or location..."
                className="w-full px-4 py-3 border-2 border-black rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            {/* Filter by Type */}
            <div>
              <label className="block text-sm font-mono font-bold mb-2">Filter by Type</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-4 py-3 border-2 border-black rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="all">All Types</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-4 text-sm font-mono">
            <span className="text-gray-600">Results:</span>
            <span className="font-bold">{filteredAssets.length} Assets</span>
          </div>
        </div>

        {/* Assets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_black] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_black] transition-all overflow-hidden"
            >
              {/* Asset Image Placeholder */}
              <div className="h-48 bg-gray-100 border-b-2 border-black relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  {asset.type.includes('Commercial') ? (
                    <Building2 size={64} className="text-gray-300" strokeWidth={1} />
                  ) : (
                    <Home size={64} className="text-gray-300" strokeWidth={1} />
                  )}
                </div>
                {/* Verification Badge */}
                <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1 rounded-full flex items-center space-x-1 text-xs font-mono font-bold">
                  <CheckCircle size={14} />
                  <span>VERIFIED</span>
                </div>
              </div>

              {/* Asset Details */}
              <div className="p-6">
                <h3 className="text-xl font-mono font-bold mb-2">{asset.name}</h3>
                <p className="text-sm text-gray-600 font-mono mb-4">{asset.type}</p>

                {/* Location */}
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin size={16} className="text-gray-500" />
                  <span className="text-sm font-mono text-gray-700">{asset.location}</span>
                </div>

                {/* Size and Year */}
                <div className="flex items-center space-x-4 mb-3 text-sm font-mono text-gray-600">
                  <span>{asset.size}</span>
                  <span>•</span>
                  <span>Built {asset.yearBuilt}</span>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{asset.description}</p>

                {/* Valuation */}
                <div className="flex items-center space-x-2 mb-4">
                  <DollarSign size={20} className="text-black" />
                  <span className="text-2xl font-bold font-mono">
                    ${asset.valuation.toLocaleString()}
                  </span>
                </div>

                {/* Business Owner */}
                <div className="mb-4 p-2 bg-gray-50 rounded border border-gray-200">
                  <p className="text-xs font-mono text-gray-500">Listed by</p>
                  <p className="text-sm font-mono font-medium">{asset.businessOwner}</p>
                </div>

                {/* Buy Button */}
                <button
                  onClick={() => handleBuyAsset(asset.id)}
                  className="w-full px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-mono font-bold"
                >
                  Buy Asset
                </button>

                {/* Date Added */}
                <div className="mt-3 flex items-center justify-center space-x-1 text-xs font-mono text-gray-400">
                  <Calendar size={12} />
                  <span>Added {asset.dateAdded}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {filteredAssets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xl font-mono text-gray-500">No assets found matching your criteria</p>
          </div>
        )}
      </div>
    </main>
  )
}
