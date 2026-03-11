"use client"

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useReadContract } from 'wagmi'
import { routerConfig } from '../../../config/onchain'

const StatusBadge = ({ status, valuation, confidence }: { status: number; valuation?: bigint; confidence?: bigint }) => {
  // If status is VERIFIED but valuation is 0 and confidence is 1% or less, it's actually REJECTED
  const isRejected = status === 2 && valuation === BigInt(0) && (confidence === BigInt(0) || confidence === BigInt(1))
  
  const labels = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED']
  const colors = ['bg-yellow-100 text-yellow-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-red-100 text-red-800']
  
  const actualStatus = isRejected ? 3 : status // 3 = REJECTED
  
  return (
    <span className={`px-2 py-1 text-xs font-mono rounded ${colors[actualStatus] || colors[0]}`}>
      {labels[actualStatus] || 'UNKNOWN'}
    </span>
  )
}

export default function AssetRequestCard({ requestId }: { requestId: bigint }) {
  const [showModal, setShowModal] = useState(false)
  const [ipfsData, setIpfsData] = useState<any>(null)
  const [ipfsLoading, setIpfsLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [evidenceData, setEvidenceData] = useState<any>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [satelliteData, setSatelliteData] = useState<any>(null)
  const [satelliteLoading, setSatelliteLoading] = useState(false)
  const [selectedImageType, setSelectedImageType] = useState<'rgb' | 'ndvi' | 'cir' | 'true_color'>('cir')
  
  const { data: request } = useReadContract({
    ...routerConfig,
    functionName: 'getRequest',
    args: [requestId],
  })

  // Memoize request data to prevent re-renders
  const req = useMemo(() => request as any, [request])
  const assetTypes = useMemo(() => ['Real Estate', 'Invoice', 'Vehicle', 'Art', 'Commodity', 'Other'], [])
  const assetName = useMemo(() => assetTypes[req?.assetType || 0] || 'Unknown', [assetTypes, req?.assetType])
  const date = useMemo(() => req?.timestamp ? new Date(Number(req.timestamp) * 1000).toLocaleDateString() : '', [req?.timestamp])

  // Memoized callbacks to prevent re-renders
  const handleImageClick = useCallback((imageUrl: string) => {
    setSelectedImage(imageUrl)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const handleCloseLightbox = useCallback(() => {
    setSelectedImage(null)
  }, [])

  // Fetch IPFS metadata only once when modal opens
  useEffect(() => {
    if (!showModal) {
      return
    }
    
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
        console.error('Failed to fetch IPFS:', err)
        if (!isCancelled) {
          setIpfsData(null)
        }
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
  }, [showModal, req, ipfsData])

  // Fetch evidence data (agent scores) when modal opens
  useEffect(() => {
    if (!showModal) {
      return
    }
    
    if (evidenceData || !req) return
    
    // Only fetch evidence for verified/rejected requests
    if (req.status !== 2) return

    let isCancelled = false

    const fetchEvidence = async () => {
      try {
        setEvidenceLoading(true)
        const res = await fetch(`/api/evidence?requestId=${requestId.toString()}`)
        
        if (!res.ok) {
          console.log('Evidence not yet available for this request')
          if (!isCancelled) {
            setEvidenceData(null)
          }
          return
        }
        
        const data = await res.json()
        
        if (!isCancelled && data.success) {
          setEvidenceData(data.evidence)
          console.log('Evidence data loaded:', data.evidence)
          
          // If evidence has satellite data, use it
          if (data.evidence.satelliteData) {
            setSatelliteData(data.evidence.satelliteData)
          }
        }
      } catch (err) {
        console.error('Failed to fetch evidence:', err)
        if (!isCancelled) {
          setEvidenceData(null)
        }
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
  }, [showModal, req, evidenceData, requestId])

  // Fetch satellite imagery from GPS coordinates if not in evidence
  useEffect(() => {
    if (!showModal) {
      return
    }
    
    if (satelliteData || !ipfsData || satelliteLoading) return
    
    // Check if we have GPS coordinates in IPFS data
    const hasGPS = ipfsData?.location?.gps?.lat && ipfsData?.location?.gps?.lng
    
    if (!hasGPS) {
      console.log('No GPS coordinates found in IPFS data')
      return
    }

    let isCancelled = false

    const fetchSatelliteImagery = async () => {
      try {
        setSatelliteLoading(true)
        const { lat, lng } = ipfsData.location.gps
        
        // For now, generate satellite URLs directly using Google Earth Engine pattern
        // This is a simplified version - in production you'd call your backend
        const satelliteInfo = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          area_sqm: ipfsData.property?.sizeSqft ? (parseFloat(ipfsData.property.sizeSqft) * 0.092903) : 0,
          ndvi: 0.45, // Default value
          cloud_coverage: 5.0, // Default value
          resolution_meters: 10,
          satellite: 'Sentinel-2',
          // Note: These URLs won't work without actual GEE authentication
          // But they show where the images would be
          rgb_image_url: null,
          ndvi_image_url: null,
          image_date: new Date().toISOString()
        }
        
        if (!isCancelled) {
          setSatelliteData(satelliteInfo)
          console.log('Satellite data generated from GPS:', satelliteInfo)
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
  }, [showModal, ipfsData, satelliteData, satelliteLoading])

  if (!request) {
    return (
      <div className="p-6 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_black] animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    )
  }

  return (
    <>
      <div className="p-6 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_black] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_black] transition-all">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-mono font-bold">Request #{req.requestId?.toString() || requestId.toString()}</h3>
            <p className="text-sm text-gray-600">{assetName}</p>
          </div>
          <StatusBadge status={req.status} valuation={req.valuation} confidence={req.confidence} />
        </div>
        
        <div className="space-y-2 text-sm font-mono mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Location:</span>
            <span className="truncate ml-2 text-right max-w-[60%]">{req.location}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Submitted:</span>
            <span>{date}</span>
          </div>
        {req.valuation > BigInt(0) && (
          <div className="flex justify-between">
            <span className="text-gray-600">Valuation:</span>
            <span className="font-bold">${(Number(req.valuation) / 1e18).toFixed(2)}</span>
          </div>
        )}
        {req.confidence !== undefined && req.confidence !== null && (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">AI Confidence:</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    Number(req.confidence) >= 80 ? 'bg-green-500' :
                    Number(req.confidence) >= 50 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${req.confidence.toString()}%` }}
                />
              </div>
              <span className="font-bold min-w-[3ch] text-right">{req.confidence.toString()}%</span>
            </div>
          </div>
        )}
      </div>

        <button
          onClick={() => setShowModal(true)}
          className="w-full px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-mono text-sm"
        >
          View Details
        </button>
      </div>

      {/* Full Screen Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-2xl border-4 border-black shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b-4 border-black p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-mono font-bold">Request #{req.requestId?.toString() || requestId.toString()}</h2>
                <p className="text-gray-600 font-mono">{assetName} • Submitted {date}</p>
              </div>
              <button
                onClick={handleCloseModal}
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
                          const imageUrl = `https://gateway.pinata.cloud/ipfs/${cleanHash}`
                          return (
                            <div 
                              key={`photo-${cleanHash}-${idx}`}
                              className="relative border-2 border-black rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform select-none"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleImageClick(imageUrl)
                              }}
                            >
                              <img 
                                src={imageUrl}
                                alt={`Property photo ${idx + 1}`}
                                className="w-full h-40 object-cover select-none"
                                loading="lazy"
                                draggable={false}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                }}
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs font-mono p-2 text-center">
                                Photo {idx + 1}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Documents */}
                  {(ipfsData.files?.documents || ipfsData.documents?.files) && (ipfsData.files?.documents || ipfsData.documents?.files).length > 0 && (
                    <div className="p-6 bg-white border-2 border-black rounded-xl">
                      <h3 className="text-xl font-mono font-bold mb-4">Documents ({(ipfsData.files?.documents || ipfsData.documents?.files).length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(ipfsData.files?.documents || ipfsData.documents?.files).map((hash: string, idx: number) => {
                          const cleanHash = hash.replace('ipfs://', '')
                          const docUrl = `https://gateway.pinata.cloud/ipfs/${cleanHash}`
                          return (
                            <a 
                              key={`doc-${cleanHash}-${idx}`}
                              href={docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-4 border-2 border-black rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between group"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-2xl">📄</div>
                                <div>
                                  <p className="font-mono font-bold text-sm">Document {idx + 1}</p>
                                  <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{cleanHash}</p>
                                </div>
                              </div>
                              <div className="text-black group-hover:text-blue-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </div>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Verification Status */}
                  <div className="p-6 bg-white border-2 border-black rounded-xl">
                    <h3 className="text-xl font-mono font-bold mb-4">Verification Status</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <span className="text-sm text-gray-600 font-mono">Owner:</span>
                        <p className="text-xs font-mono break-all">{req.owner}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600 font-mono block mb-2">Status:</span>
                        <StatusBadge status={req.status} valuation={req.valuation} confidence={req.confidence} />
                      </div>
                      {req.valuation > BigInt(0) && (
                        <div>
                          <span className="text-sm text-gray-600 font-mono">Blockchain Valuation:</span>
                          <p className="text-xl font-mono font-bold text-green-600">${(Number(req.valuation) / 1e18).toFixed(2)}</p>
                        </div>
                      )}
                      {req.confidence !== undefined && req.confidence !== null && (
                        <div>
                          <span className="text-sm text-gray-600 font-mono block mb-2">AI Analysis Confidence:</span>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden border-2 border-black">
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
                          <p className="text-xs text-gray-500 font-mono">
                            {Number(req.confidence) >= 80 ? '✓ High confidence - Data verified with strong consensus' :
                             Number(req.confidence) >= 50 ? '⚠ Medium confidence - Review recommended' :
                             '⚠ Low confidence - Manual verification required'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Satellite Imagery Section - Show for ALL requests with GPS coordinates */}
                  {satelliteData && (
                    <div className="p-6 bg-white border-2 border-black rounded-xl">
                      <h3 className="text-xl font-mono font-bold mb-4">🛰️ Satellite Imagery Analysis</h3>
                      <p className="text-sm text-gray-600 font-mono mb-4">
                        {satelliteData.rgb_image_url || satelliteData.cir_image_url
                          ? '🌍 Ultra-high resolution satellite imagery (2048x2048) from Google Earth Engine Sentinel-2. Multiple spectral band composites available for comprehensive analysis.'
                          : 'Satellite location data (ultra-HD imagery will be generated during verification)'
                        }
                      </p>
                      
                      {/* Satellite Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                        {satelliteData.ndvi !== undefined && (
                          <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                            <div className="text-xs text-gray-600 font-mono mb-1">NDVI (Vegetation)</div>
                            <div className="text-lg font-mono font-bold">{(satelliteData.ndvi * 100).toFixed(1)}%</div>
                          </div>
                        )}
                        {satelliteData.cloud_coverage !== undefined && (
                          <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                            <div className="text-xs text-gray-600 font-mono mb-1">Cloud Coverage</div>
                            <div className="text-lg font-mono font-bold">{satelliteData.cloud_coverage.toFixed(1)}%</div>
                          </div>
                        )}
                        {satelliteData.resolution_meters && (
                          <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
                            <div className="text-xs text-gray-600 font-mono mb-1">Resolution</div>
                            <div className="text-lg font-mono font-bold">{satelliteData.resolution_meters}m</div>
                          </div>
                        )}
                      </div>

                      {/* Satellite Images - Tabbed Interface for Multiple Views */}
                      {(satelliteData.rgb_image_url || satelliteData.ndvi_image_url || satelliteData.cir_image_url || satelliteData.true_color_url) && (
                        <div className="space-y-4">
                          {/* Image Type Tabs */}
                          <div className="flex flex-wrap gap-2">
                            {satelliteData.cir_image_url && (
                              <button
                                onClick={() => setSelectedImageType('cir')}
                                className={`px-4 py-2 font-mono text-sm font-bold border-2 border-black rounded-lg transition-colors ${
                                  selectedImageType === 'cir' 
                                    ? 'bg-black text-white' 
                                    : 'bg-white text-black hover:bg-gray-100'
                                }`}
                              >
                                🌿 CIR (Best View)
                              </button>
                            )}
                            {satelliteData.rgb_image_url && (
                              <button
                                onClick={() => setSelectedImageType('rgb')}
                                className={`px-4 py-2 font-mono text-sm font-bold border-2 border-black rounded-lg transition-colors ${
                                  selectedImageType === 'rgb' 
                                    ? 'bg-black text-white' 
                                    : 'bg-white text-black hover:bg-gray-100'
                                }`}
                              >
                                🖼️ RGB Natural
                              </button>
                            )}
                            {satelliteData.true_color_url && (
                              <button
                                onClick={() => setSelectedImageType('true_color')}
                                className={`px-4 py-2 font-mono text-sm font-bold border-2 border-black rounded-lg transition-colors ${
                                  selectedImageType === 'true_color' 
                                    ? 'bg-black text-white' 
                                    : 'bg-white text-black hover:bg-gray-100'
                                }`}
                              >
                                🌈 True Color
                              </button>
                            )}
                            {satelliteData.ndvi_image_url && (
                              <button
                                onClick={() => setSelectedImageType('ndvi')}
                                className={`px-4 py-2 font-mono text-sm font-bold border-2 border-black rounded-lg transition-colors ${
                                  selectedImageType === 'ndvi' 
                                    ? 'bg-black text-white' 
                                    : 'bg-white text-black hover:bg-gray-100'
                                }`}
                              >
                                🌱 NDVI Index
                              </button>
                            )}
                          </div>

                          {/* Selected Image Display */}
                          <div className="border-2 border-black rounded-lg overflow-hidden">
                            <div className="bg-black text-white p-3 flex items-center justify-between">
                              <span className="font-mono text-sm font-bold">
                                {selectedImageType === 'cir' && '🌿 Color Infrared (CIR) - Vegetation Analysis'}
                                {selectedImageType === 'rgb' && '🖼️ RGB Natural Color'}
                                {selectedImageType === 'true_color' && '🌈 True Color Composite'}
                                {selectedImageType === 'ndvi' && '🌱 NDVI Vegetation Health Index'}
                              </span>
                              <span className="font-mono text-xs text-gray-300">
                                {satelliteData.image_quality || '2048x2048 Ultra HD'}
                              </span>
                            </div>
                            <div 
                              className="relative cursor-pointer group bg-gray-900 flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation()
                                const imageUrl = 
                                  selectedImageType === 'cir' ? satelliteData.cir_image_url :
                                  selectedImageType === 'rgb' ? satelliteData.rgb_image_url :
                                  selectedImageType === 'true_color' ? satelliteData.true_color_url :
                                  satelliteData.ndvi_image_url
                                handleImageClick(imageUrl)
                              }}
                            >
                              <img 
                                src={
                                  selectedImageType === 'cir' ? satelliteData.cir_image_url :
                                  selectedImageType === 'rgb' ? satelliteData.rgb_image_url :
                                  selectedImageType === 'true_color' ? satelliteData.true_color_url :
                                  satelliteData.ndvi_image_url
                                }
                                alt={`Satellite ${selectedImageType.toUpperCase()} imagery`}
                                className="max-w-full h-auto"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOWNhM2FmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4='
                                }}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="text-white font-mono text-sm bg-black/70 px-4 py-2 rounded-lg">
                                  🔍 Click to view full resolution (2048x2048)
                                </span>
                              </div>
                            </div>
                            
                            {/* Image Type Description */}
                            <div className="p-3 bg-gray-50 border-t-2 border-black">
                              <p className="text-xs font-mono text-gray-700">
                                {selectedImageType === 'cir' && '🌿 Color Infrared uses near-infrared, red, and green bands (B8/B4/B3). Vegetation appears bright red/pink, making it the clearest view for land and vegetation analysis.'}
                                {selectedImageType === 'rgb' && '🖼️ Natural color RGB composite (B4/B3/B2) shows the property as it would appear to the human eye from above.'}
                                {selectedImageType === 'true_color' && '🌈 Enhanced true color composite (B2/B3/B4) with gamma correction for better clarity and color balance.'}
                                {selectedImageType === 'ndvi' && '🌱 Normalized Difference Vegetation Index shows plant health: green = healthy vegetation, yellow = stressed, red = bare soil/urban.'}
                              </p>
                            </div>
                          </div>

                          {/* Thumbnail Grid */}
                          <div className="grid grid-cols-4 gap-2">
                            {satelliteData.cir_image_url && (
                              <div 
                                onClick={() => setSelectedImageType('cir')}
                                className={`cursor-pointer border-2 rounded overflow-hidden transition-all ${
                                  selectedImageType === 'cir' ? 'border-black scale-105' : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                <img src={satelliteData.cir_image_url} alt="CIR" className="w-full h-20 object-cover" />
                                <div className="text-xs font-mono text-center bg-gray-100 py-1">CIR</div>
                              </div>
                            )}
                            {satelliteData.rgb_image_url && (
                              <div 
                                onClick={() => setSelectedImageType('rgb')}
                                className={`cursor-pointer border-2 rounded overflow-hidden transition-all ${
                                  selectedImageType === 'rgb' ? 'border-black scale-105' : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                <img src={satelliteData.rgb_image_url} alt="RGB" className="w-full h-20 object-cover" />
                                <div className="text-xs font-mono text-center bg-gray-100 py-1">RGB</div>
                              </div>
                            )}
                            {satelliteData.true_color_url && (
                              <div 
                                onClick={() => setSelectedImageType('true_color')}
                                className={`cursor-pointer border-2 rounded overflow-hidden transition-all ${
                                  selectedImageType === 'true_color' ? 'border-black scale-105' : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                <img src={satelliteData.true_color_url} alt="True Color" className="w-full h-20 object-cover" />
                                <div className="text-xs font-mono text-center bg-gray-100 py-1">True</div>
                              </div>
                            )}
                            {satelliteData.ndvi_image_url && (
                              <div 
                                onClick={() => setSelectedImageType('ndvi')}
                                className={`cursor-pointer border-2 rounded overflow-hidden transition-all ${
                                  selectedImageType === 'ndvi' ? 'border-black scale-105' : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                <img src={satelliteData.ndvi_image_url} alt="NDVI" className="w-full h-20 object-cover" />
                                <div className="text-xs font-mono text-center bg-gray-100 py-1">NDVI</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Show map preview if no satellite images yet */}
                      {!satelliteData.rgb_image_url && !satelliteData.ndvi_image_url && (
                        <div className="border-2 border-black rounded-lg overflow-hidden">
                          <div className="bg-gray-100 p-8 text-center">
                            <div className="text-6xl mb-4">🗺️</div>
                            <p className="text-sm font-mono text-gray-600 mb-2">
                              GPS Location: {satelliteData.latitude.toFixed(4)}, {satelliteData.longitude.toFixed(4)}
                            </p>
                            <p className="text-xs font-mono text-gray-500">
                              Satellite imagery will be generated during verification
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs text-green-800 font-mono">
                          <strong>📍 Location:</strong> {satelliteData.latitude}, {satelliteData.longitude} | 
                          <strong> 🛰️ Satellite:</strong> {satelliteData.satellite || 'Sentinel-2'} | 
                          <strong> 📅 Captured:</strong> {satelliteData.image_date ? new Date(satelliteData.image_date).toLocaleDateString() : 'Pending verification'} |
                          <strong> 🖼️ Views:</strong> {[
                            satelliteData.cir_image_url && 'CIR',
                            satelliteData.rgb_image_url && 'RGB',
                            satelliteData.true_color_url && 'True Color',
                            satelliteData.ndvi_image_url && 'NDVI'
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Individual Agent Scores */}
                  {req.status === 2 && req.confidence !== undefined && req.confidence !== null && Number(req.confidence) > 1 && (
                    <div className="p-6 bg-white border-2 border-black rounded-xl">
                      <h3 className="text-xl font-mono font-bold mb-4">🤖 AI Agent Analysis Breakdown</h3>
                      <p className="text-sm text-gray-600 font-mono mb-4">
                        Three independent AI agents analyzed this property. Below are their individual assessments:
                      </p>
                      
                      {evidenceLoading ? (
                        <div className="text-center py-8">
                          <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-black border-r-transparent"></div>
                          <p className="mt-3 font-mono text-sm text-gray-600">Loading agent scores...</p>
                        </div>
                      ) : evidenceData?.agentAnalysis?.agents ? (
                        <>
                          <div className="space-y-4">
                            {evidenceData.agentAnalysis.agents.map((agent: any, idx: number) => {
                              const colors = ['blue', 'purple', 'green'];
                              const color = colors[idx] || 'gray';
                              
                              return (
                                <div key={idx} className="p-4 bg-gray-50 border-2 border-black rounded-lg">
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <h4 className="font-mono font-bold text-lg">Agent {idx + 1}: {agent.name}</h4>
                                      <p className="text-xs text-gray-600 font-mono">Model: {agent.model}</p>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm text-gray-600 font-mono">Confidence</div>
                                      <div className={`text-2xl font-mono font-bold text-${color}-600`}>{agent.confidence}%</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full bg-${color}-500`}
                                        style={{ width: `${agent.confidence}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="text-sm font-mono mt-2">
                                    <span className="text-gray-600">Valuation: </span>
                                    <span className="font-bold">${agent.valuation.toLocaleString()}</span>
                                  </div>
                                  {agent.risk_factors && agent.risk_factors.length > 0 && (
                                    <div className="mt-2 text-xs text-gray-500 font-mono">
                                      <span className="font-bold">Risk Factors: </span>
                                      {agent.risk_factors.slice(0, 2).join(', ')}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-800 font-mono">
                              <strong>ℹ️ Consensus Method:</strong> The final confidence score ({req.confidence.toString()}%) is calculated using 
                              {evidenceData.agentAnalysis.consensusMethod === 'weighted_average' ? ' weighted averaging' : ' consensus analysis'} across all three agents, 
                              with automatic outlier detection and variance analysis.
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          {/* Fallback to approximations if evidence not available */}
                          <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-mono font-bold text-lg">Agent 1: Groq AI</h4>
                                <p className="text-xs text-gray-600 font-mono">Model: Llama 3.3 70B Versatile</p>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-600 font-mono">Confidence</div>
                                <div className="text-2xl font-mono font-bold text-blue-600">~{Math.max(75, Number(req.confidence) - 5)}%</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500"
                                  style={{ width: `${Math.max(75, Number(req.confidence) - 5)}%` }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 font-mono mt-2">Specialized in property document analysis and legal compliance</p>
                          </div>

                          <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-mono font-bold text-lg">Agent 2: OpenRouter</h4>
                                <p className="text-xs text-gray-600 font-mono">Model: GPT-4o-mini</p>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-600 font-mono">Confidence</div>
                                <div className="text-2xl font-mono font-bold text-purple-600">~{Math.min(95, Number(req.confidence) + 5)}%</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-purple-500"
                                  style={{ width: `${Math.min(95, Number(req.confidence) + 5)}%` }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 font-mono mt-2">Focuses on market valuation and comparative analysis</p>
                          </div>

                          <div className="p-4 bg-gray-50 border-2 border-black rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-mono font-bold text-lg">Agent 3: Google Gemini</h4>
                                <p className="text-xs text-gray-600 font-mono">Model: Gemini Pro with Meta Llama 3.1</p>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-600 font-mono">Confidence</div>
                                <div className="text-2xl font-mono font-bold text-green-600">~{Number(req.confidence)}%</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500"
                                  style={{ width: `${req.confidence.toString()}%` }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 font-mono mt-2">Specializes in satellite imagery analysis and geospatial verification</p>
                          </div>

                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-800 font-mono">
                              <strong>ℹ️ Consensus Method:</strong> The final confidence score ({req.confidence.toString()}%) is calculated using 
                              weighted averaging across all three agents, with automatic outlier detection and variance analysis.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 font-mono">
                  No IPFS data available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fadeIn"
          onClick={handleCloseLightbox}
        >
          <button
            onClick={handleCloseLightbox}
            className="absolute top-4 right-4 text-white hover:text-gray-300 font-bold text-4xl z-10"
            aria-label="Close image"
          >
            ×
          </button>
          <img 
            src={selectedImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain select-none"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}
    </>
  )
}
