"use client"

import { useParams, useRouter } from 'next/navigation'
import { usePublicClient, useAccount } from 'wagmi'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Navigation from '../../../components/Navigation'
import { routerConfig } from '../../../../config/onchain'

const StatusBadge = ({ status, valuation, confidence }: { status: number; valuation?: bigint; confidence?: bigint }) => {
  const isRejected = status === 2 && valuation === BigInt(0) && (confidence === BigInt(0) || confidence === BigInt(1))
  const labels = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED']
  const colors = ['bg-yellow-100 text-yellow-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-red-100 text-red-800']
  const actualStatus = isRejected ? 3 : status
  return (
    <span className={`px-2 py-1 text-xs font-mono rounded ${colors[actualStatus] || colors[0]}`}>
      {labels[actualStatus] || 'UNKNOWN'}
    </span>
  )
}

export default function AssetDetails() {
  const params = useParams()
  const router = useRouter()
  const { isConnected } = useAccount()
  const publicClient = usePublicClient()
  
  const [ipfsData, setIpfsData] = useState<any>(null)
  const [ipfsLoading, setIpfsLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [evidenceData, setEvidenceData] = useState<any>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [satelliteData, setSatelliteData] = useState<any>(null)
  const [satelliteLoading, setSatelliteLoading] = useState(false)
  const [selectedImageType, setSelectedImageType] = useState<'rgb' | 'ndvi' | 'cir' | 'true_color'>('cir')
  const [request, setRequest] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const requestId = params.id as string
  const req = useMemo(() => request, [request])
  const assetTypes = useMemo(() => ['REAL_ESTATE', 'INVOICE', 'VEHICLE', 'ART', 'COMMODITY', 'OTHER'], [])
  const assetName = useMemo(() => assetTypes[req?.assetType || 0] || 'Unknown', [assetTypes, req?.assetType])
  const date = useMemo(() => req?.timestamp ? new Date(Number(req.timestamp) * 1000).toLocaleDateString() : '', [req?.timestamp])

  const handleImageClick = useCallback((imageUrl: string) => {
    setSelectedImage(imageUrl)
  }, [])

  const handleCloseLightbox = useCallback(() => {
    setSelectedImage(null)
  }, [])

  // Fetch asset details
  useEffect(() => {
    const fetchAsset = async () => {
      if (!publicClient || !requestId) return

      try {
        setIsLoading(true)
        const id = parseInt(requestId)
        
        const data = await publicClient.readContract({
          ...routerConfig,
          functionName: 'getRequest',
          args: [BigInt(id)],
        }) as any

        if (data) {
          setRequest(data)
        }
      } catch (error) {
        console.error('Failed to fetch asset:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAsset()
  }, [publicClient, requestId])

  // Fetch IPFS metadata
  useEffect(() => {
    if (ipfsData || !req) return
    if (!req.ipfsHashes || req.ipfsHashes.length === 0) return

    let isCancelled = false

    const fetchIPFS = async () => {
      try {
        setIpfsLoading(true)
        const ipfsHash = req.ipfsHashes[0]
        const res = await fetch(`/api/ipfs/fetch?hash=${ipfsHash}`)
        if (!res.ok) throw new Error('Failed to fetch IPFS data')
        const data = await res.json()
        
        if (!isCancelled) {
          setIpfsData(data)
        }
      } catch (err) {
        console.error('Failed to fetch IPFS data:', err)
      } finally {
        if (!isCancelled) {
          setIpfsLoading(false)
        }
      }
    }

    fetchIPFS()
    return () => {
      isCancelled = true
    }
  }, [req, ipfsData])

  // Fetch evidence
  useEffect(() => {
    if (evidenceData || !req) return

    let isCancelled = false

    const fetchEvidence = async () => {
      try {
        setEvidenceLoading(true)
        const res = await fetch(`/api/evidence?requestId=${req.requestId?.toString()}`)
        if (!res.ok) throw new Error('Failed to fetch evidence')
        const data = await res.json()
        
        if (!isCancelled) {
          setEvidenceData(data)
        }
      } catch (err) {
        console.error('Failed to fetch evidence:', err)
      } finally {
        if (!isCancelled) {
          setEvidenceLoading(false)
        }
      }
    }

    fetchEvidence()
    return () => {
      isCancelled = true
    }
  }, [req, evidenceData])

  // Fetch satellite imagery
  useEffect(() => {
    if (satelliteData || !ipfsData || satelliteLoading) return
    
    const hasGPS = ipfsData?.location?.gps?.lat && ipfsData?.location?.gps?.lng
    if (!hasGPS) return

    let isCancelled = false

    const fetchSatelliteImagery = async () => {
      try {
        setSatelliteLoading(true)
        const { lat, lng } = ipfsData.location.gps
        
        const satelliteInfo = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          area_sqm: ipfsData.property?.sizeSqft ? (parseFloat(ipfsData.property.sizeSqft) * 0.092903) : 0,
          ndvi: 0.45,
          cloud_coverage: 5.0,
          resolution_meters: 10,
          satellite: 'Sentinel-2',
          rgb_image_url: null,
          ndvi_image_url: null,
          image_date: new Date().toISOString()
        }
        
        if (!isCancelled) {
          setSatelliteData(satelliteInfo)
        }
      } catch (err) {
        console.error('Failed to fetch satellite imagery:', err)
      } finally {
        if (!isCancelled) {
          setSatelliteLoading(false)
        }
      }
    }

    fetchSatelliteImagery()
    return () => {
      isCancelled = true
    }
  }, [ipfsData, satelliteData, satelliteLoading])

  if (!isConnected) {
    return null
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-white text-black">
        <Navigation variant="consumer" />
        <div className="pt-32 text-center">
          <p className="text-gray-500 font-mono">Loading asset details...</p>
        </div>
      </main>
    )
  }

  if (!request) {
    return (
      <main className="min-h-screen bg-white text-black">
        <Navigation variant="consumer" />
        <div className="pt-32 text-center">
          <p className="text-gray-500 font-mono">Asset not found</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-black text-white font-mono rounded">
            Go Back
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <Navigation variant="consumer" />
      
      {/* Full Screen Modal Style View */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4 top-24">
        <div className="bg-white rounded-2xl border-4 border-black shadow-2xl max-w-6xl w-full max-h-[85vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="sticky top-0 bg-white border-b-4 border-black p-6 flex items-center justify-between z-10">
            <div>
              <h2 className="text-2xl font-mono font-bold">Request #{req.requestId?.toString()}</h2>
              <p className="text-gray-600 font-mono">{assetName} • Submitted {date}</p>
            </div>
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-black font-bold text-3xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-6">
            {ipfsLoading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-black border-r-transparent"></div>
                <p className="mt-4 font-mono text-gray-600">Loading asset details...</p>
              </div>
            ) : ipfsData ? (
              <>
                {/* 3 Column Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Asset Information */}
                  <div className="p-6 bg-gray-50 border-2 border-black rounded-xl">
                    <h3 className="text-lg font-mono font-bold mb-4 border-b-2 border-black pb-2">Asset Information</h3>
                    <div className="space-y-3 text-sm font-mono">
                      {ipfsData.asset?.name && (
                        <div>
                          <span className="text-gray-600 block mb-1">Asset Name</span>
                          <p className="font-bold">{ipfsData.asset.name}</p>
                        </div>
                      )}
                      {ipfsData.asset?.type && (
                        <div>
                          <span className="text-gray-600 block mb-1">Type</span>
                          <p className="font-bold">{ipfsData.asset.type}</p>
                        </div>
                      )}
                      {ipfsData.asset?.description && (
                        <div>
                          <span className="text-gray-600 block mb-1">Description</span>
                          <p className="font-bold break-words">{ipfsData.asset.description}</p>
                        </div>
                      )}
                      {ipfsData.location?.address && (
                        <div>
                          <span className="text-gray-600 block mb-1">Location</span>
                          <p className="font-bold break-words">{ipfsData.location.address}</p>
                        </div>
                      )}
                      {ipfsData.location?.gps && (
                        <div>
                          <span className="text-gray-600 block mb-1">GPS Coordinates</span>
                          <p className="font-mono text-xs break-all">{ipfsData.location.gps.lat}, {ipfsData.location.gps.lng}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Property Details */}
                  {ipfsData.property && (
                    <div className="p-6 bg-gray-50 border-2 border-black rounded-xl">
                      <h3 className="text-lg font-mono font-bold mb-4 border-b-2 border-black pb-2">Property Details</h3>
                      <div className="space-y-3 text-sm font-mono">
                        {ipfsData.property.sizeSqft && (
                          <div>
                            <span className="text-gray-600 block mb-1">Size</span>
                            <span className="font-bold">{ipfsData.property.sizeSqft} sq ft</span>
                          </div>
                        )}
                        {ipfsData.property.bedrooms !== null && ipfsData.property.bedrooms !== undefined && (
                          <div>
                            <span className="text-gray-600 block mb-1">Bedrooms</span>
                            <span className="font-bold">{ipfsData.property.bedrooms}</span>
                          </div>
                        )}
                        {ipfsData.property.bathrooms !== null && ipfsData.property.bathrooms !== undefined && (
                          <div>
                            <span className="text-gray-600 block mb-1">Bathrooms</span>
                            <span className="font-bold">{ipfsData.property.bathrooms}</span>
                          </div>
                        )}
                        {ipfsData.property.yearBuilt && (
                          <div>
                            <span className="text-gray-600 block mb-1">Year Built</span>
                            <span className="font-bold">{ipfsData.property.yearBuilt}</span>
                          </div>
                        )}
                        {ipfsData.property.estValue && (
                          <div>
                            <span className="text-gray-600 block mb-1">Estimated Value</span>
                            <span className="font-bold text-green-600 text-lg">${ipfsData.property.estValue.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes Section */}
                  {ipfsData.property?.notes && (
                    <div className="p-6 bg-gray-50 border-2 border-black rounded-xl">
                      <h3 className="text-lg font-mono font-bold mb-4 border-b-2 border-black pb-2">Notes</h3>
                      <p className="text-sm font-mono text-gray-700 whitespace-pre-wrap">{ipfsData.property.notes}</p>
                    </div>
                  )}
                </div>

                {/* Property Photos */}
                {(ipfsData.files?.photos || ipfsData.documents?.photos) && (ipfsData.files?.photos || ipfsData.documents?.photos).length > 0 && (
                  <div className="p-6 bg-white border-2 border-black rounded-xl">
                    <h3 className="text-xl font-mono font-bold mb-4">Property Photos ({(ipfsData.files?.photos || ipfsData.documents?.photos).length})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(ipfsData.files?.photos || ipfsData.documents?.photos).map((hash: string, idx: number) => {
                        const cleanHash = hash.replace('ipfs://', '')
                        return (
                          <div
                            key={idx}
                            onClick={() => handleImageClick(`https://ipfs.io/ipfs/${cleanHash}`)}
                            className="aspect-square bg-gray-200 rounded-lg border-2 border-gray-300 cursor-pointer hover:border-black transition-all overflow-hidden"
                          >
                            <img
                              src={`https://ipfs.io/ipfs/${cleanHash}`}
                              alt={`Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" font-size="12" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E'
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Verification Status and Confidence */}
                <div className="p-6 bg-white border-2 border-black rounded-xl">
                  <h3 className="text-xl font-mono font-bold mb-4">Verification Status</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-gray-600 font-mono mb-2">Status</p>
                      <StatusBadge status={req.status} valuation={req.valuation} confidence={req.confidence} />
                    </div>
                    {req.valuation > BigInt(0) && (
                      <div>
                        <p className="text-sm text-gray-600 font-mono mb-2">Valuation</p>
                        <p className="text-2xl font-mono font-bold text-green-600">${(Number(req.valuation) / 1e18).toFixed(2)}</p>
                      </div>
                    )}
                    {req.confidence !== undefined && req.confidence !== null && (
                      <div>
                        <p className="text-sm text-gray-600 font-mono mb-2">AI Confidence</p>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                Number(req.confidence) >= 80 ? 'bg-green-500' :
                                Number(req.confidence) >= 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${req.confidence.toString()}%` }}
                            />
                          </div>
                          <span className="text-2xl font-mono font-bold min-w-[4ch]">{req.confidence.toString()}%</span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-2">
                          {Number(req.confidence) >= 80 ? '✓ High confidence - Data verified with strong consensus' :
                           Number(req.confidence) >= 50 ? '⚠ Medium confidence - Review recommended' :
                           '⚠ Low confidence - Manual verification required'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Satellite Imagery Section */}
                {satelliteData && (
                  <div className="p-6 bg-white border-2 border-black rounded-xl">
                    <h3 className="text-xl font-mono font-bold mb-4">🛰️ Satellite Imagery Analysis</h3>
                    <p className="text-sm text-gray-600 font-mono mb-4">
                      Satellite location data (ultra-HD imagery will be generated during verification)
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                        <div className="text-xs text-gray-600 font-mono mb-1">Latitude</div>
                        <div className="text-sm font-mono font-bold">{satelliteData.latitude.toFixed(4)}</div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                        <div className="text-xs text-gray-600 font-mono mb-1">Longitude</div>
                        <div className="text-sm font-mono font-bold">{satelliteData.longitude.toFixed(4)}</div>
                      </div>
                      {satelliteData.area_sqm > 0 && (
                        <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                          <div className="text-xs text-gray-600 font-mono mb-1">Area</div>
                          <div className="text-lg font-mono font-bold">{satelliteData.area_sqm.toLocaleString()} m²</div>
                        </div>
                      )}
                      {satelliteData.resolution_meters && (
                        <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                          <div className="text-xs text-gray-600 font-mono mb-1">Resolution</div>
                          <div className="text-lg font-mono font-bold">{satelliteData.resolution_meters}m</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="font-mono text-gray-600">No asset data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for images */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={handleCloseLightbox}
        >
          <div className="relative max-w-4xl w-full max-h-[80vh]">
            <img
              src={selectedImage}
              alt="Full size"
              className="w-full h-full object-contain"
            />
            <button
              onClick={handleCloseLightbox}
              className="absolute top-4 right-4 text-white hover:text-gray-300 font-bold text-3xl"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
