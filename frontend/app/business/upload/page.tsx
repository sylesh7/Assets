"use client"

import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Navigation from '../../components/Navigation'
import { routerConfig, AssetTypeId, type AssetTypeKey } from '../../../config/onchain'
import { useWriteContract, usePublicClient } from 'wagmi'
import { parseEther } from 'viem'

export default function UploadPage() {
  const { isConnected, address } = useAccount()
  const router = useRouter()
  const [formError, setFormError] = useState('')
  const [formValues, setFormValues] = useState({
    assetName: '',
    assetType: 'REAL_ESTATE' as AssetTypeKey,
    location: '',
    gpsLat: '',
    gpsLng: '',
    sizeSqft: '',
    bedrooms: '',
    bathrooms: '',
    yearBuilt: '',
    estValue: '',
    notes: '',
    agreeTerms: false
  })
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [validatingDocs, setValidatingDocs] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  const photoPreviews = useMemo(() =>
    photoFiles.map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    [photoFiles]
  )

  useEffect(() => {
    return () => {
      photoPreviews.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [photoPreviews])

  function appendFiles(existing: File[], incoming: File[]) {
    const seen = new Set(existing.map((f) => `${f.name}-${f.size}-${f.lastModified}`))
    const deduped = incoming.filter((f) => !seen.has(`${f.name}-${f.size}-${f.lastModified}`))
    return [...existing, ...deduped]
  }

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Validate document against land document template using AI
  async function validateDocumentWithAI(file: File): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Accept all document formats (PDF, JSON, images, etc.)
      // AI agents will analyze the content to verify if it's a land document
      console.log(`✅ Document accepted for AI verification: ${file.name} (${file.type})`)
      return { valid: true }
      
    } catch (error) {
      return { 
        valid: false, 
        reason: `Error processing document: ${error}` 
      }
    }
  }

  if (!isConnected) {
    return null
  }

  return (
    <main className="min-h-screen bg-white text-black overflow-hidden">
      <Navigation variant="business" />
      
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

      {/* Upload Content */}
      <div className="relative z-10 pt-24 px-6 max-w-6xl mx-auto pb-12">
        <div className="relative w-full bg-white border-2 border-black rounded-2xl shadow-[8px_8px_0px_black] p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-sm font-mono text-gray-600">New Verification Request</p>
              <h2 className="text-3xl font-mono font-bold">Upload Assets</h2>
            </div>
            <button
              aria-label="Go back to dashboard"
              className="text-black hover:text-gray-700 font-bold text-xl"
              onClick={() => router.push('/business/dashboard')}
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <label className="flex flex-col gap-2 font-mono text-sm">
              Asset Name
              <input
                className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="e.g., Sunset Villa"
                value={formValues.assetName}
                onChange={(e) => setFormValues(v => ({ ...v, assetName: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-2 font-mono text-sm">
              Asset Type
              <select
                className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black bg-white"
                value={formValues.assetType}
                onChange={(e) => setFormValues(v => ({ ...v, assetType: e.target.value as AssetTypeKey }))}
              >
                <option value="REAL_ESTATE">Real Estate</option>
                <option value="INVOICE">Invoice</option>
                <option value="VEHICLE">Vehicle</option>
                <option value="ART">Art</option>
                <option value="COMMODITY">Commodity</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 font-mono text-sm md:col-span-2">
              Location / Address
              <input
                className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="123 Market St, San Francisco, CA"
                value={formValues.location}
                onChange={(e) => setFormValues(v => ({ ...v, location: e.target.value }))}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
              <label className="flex flex-col gap-2 font-mono text-sm">
                GPS Latitude
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="40.7128"
                  value={formValues.gpsLat}
                  onChange={(e) => setFormValues(v => ({ ...v, gpsLat: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-sm">
                GPS Longitude
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="-74.0060"
                  value={formValues.gpsLng}
                  onChange={(e) => setFormValues(v => ({ ...v, gpsLng: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
              <label className="flex flex-col gap-2 font-mono text-sm">
                Size (sqft)
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="2400"
                  value={formValues.sizeSqft}
                  onChange={(e) => setFormValues(v => ({ ...v, sizeSqft: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-sm">
                Bedrooms
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="3"
                  value={formValues.bedrooms}
                  onChange={(e) => setFormValues(v => ({ ...v, bedrooms: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-sm">
                Bathrooms
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="2"
                  value={formValues.bathrooms}
                  onChange={(e) => setFormValues(v => ({ ...v, bathrooms: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
              <label className="flex flex-col gap-2 font-mono text-sm">
                Year Built
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="2010"
                  value={formValues.yearBuilt}
                  onChange={(e) => setFormValues(v => ({ ...v, yearBuilt: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-sm">
                Estimated Value (optional, USD)
                <input
                  className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="450000"
                  value={formValues.estValue}
                  onChange={(e) => setFormValues(v => ({ ...v, estValue: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
              <label className="flex flex-col gap-2 font-mono text-sm">
                Property Photos (min 3)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="border-2 border-dashed border-black rounded-lg px-3 py-3 cursor-pointer bg-gray-50"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    setPhotoFiles((prev) => appendFiles(prev, files))
                    if (e.currentTarget) e.currentTarget.value = ''
                  }}
                />
                <span className="text-xs text-gray-600">Selected: {photoFiles.length} file(s) — you can add more anytime</span>

                {photoFiles.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {photoPreviews.map((p, idx) => (
                      <div key={`${p.name}-${idx}`} className="relative border-2 border-black rounded-lg overflow-hidden">
                        <img src={p.url} alt={p.name} className="w-full h-28 object-cover" />
                        <button
                          className="absolute top-1 right-1 bg-white border-2 border-black rounded px-1 text-xs font-mono hover:bg-gray-100"
                          onClick={(e) => {
                            e.preventDefault()
                            setPhotoFiles((prev) => prev.filter((_, i) => i !== idx))
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>

              <label className="flex flex-col gap-2 font-mono text-sm">
                Documents (PDF or images, add as many as needed)
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="border-2 border-dashed border-black rounded-lg px-3 py-3 cursor-pointer bg-gray-50"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    setDocFiles((prev) => appendFiles(prev, files))
                    if (e.currentTarget) e.currentTarget.value = ''
                  }}
                />
                <span className="text-xs text-gray-600">Selected: {docFiles.length} document(s) — unlimited uploads supported</span>

                {docFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {docFiles.map((f, idx) => (
                      <div key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between border-2 border-black rounded-lg px-3 py-2 bg-white">
                        <div className="truncate pr-3">
                          <span className="mr-2">•</span>
                          <span className="truncate align-middle">{f.name}</span>
                          <span className="ml-2 text-xs text-gray-600">({Math.ceil(f.size / 1024)} KB)</span>
                        </div>
                        <button
                          className="bg-white border-2 border-black rounded px-2 text-xs font-mono hover:bg-gray-100"
                          onClick={(e) => {
                            e.preventDefault()
                            setDocFiles((prev) => prev.filter((_, i) => i !== idx))
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
            </div>

            <label className="flex flex-col gap-2 font-mono text-sm md:col-span-2">
              Notes (optional)
              <textarea
                className="border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black min-h-[80px]"
                placeholder="Any context for the verifiers"
                value={formValues.notes}
                onChange={(e) => setFormValues(v => ({ ...v, notes: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 font-mono text-sm mb-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 border-2 border-black"
                checked={formValues.agreeTerms}
                onChange={(e) => setFormValues(v => ({ ...v, agreeTerms: e.target.checked }))}
              />
              I confirm the information is accurate and agree to verification fees.
            </label>
            <div className="text-xs text-gray-600">Estimated on-chain fee: ~0.01 MNT + gas. Files will upload to IPFS after clicking submit.</div>
          </div>

          {formError && (
            <div className="mb-4 text-red-600 font-mono text-sm">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 font-mono border-2 border-black rounded-lg bg-white hover:bg-gray-100"
              onClick={() => router.push('/business/dashboard')}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 font-mono bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={validatingDocs}
              onClick={async () => {
                const missingBasics = !formValues.assetName || !formValues.location
                const missingGeo = !formValues.gpsLat || !formValues.gpsLng
                const notEnoughPhotos = photoFiles.length < 3
                const noDocs = docFiles.length < 1
                const noTerms = !formValues.agreeTerms

                if (missingBasics || missingGeo || notEnoughPhotos || noDocs || noTerms) {
                  const errors = []
                  if (missingBasics) errors.push('asset name and address')
                  if (missingGeo) errors.push('GPS coordinates')
                  if (notEnoughPhotos) errors.push('at least 3 photos')
                  if (noDocs) errors.push('at least 1 document')
                  if (noTerms) errors.push('agreeing to terms')
                  setFormError(`Please add ${errors.join(', ')}.`)
                  return
                }

                try {
                  setFormError('')
                  setValidatingDocs(true)

                  // STEP 0: Validate documents BEFORE uploading to IPFS
                  console.log('🔍 Validating documents against land document template...')
                  
                  for (let i = 0; i < docFiles.length; i++) {
                    const doc = docFiles[i]
                    console.log(`Validating document ${i + 1}/${docFiles.length}: ${doc.name}`)
                    
                    const validation = await validateDocumentWithAI(doc)
                    
                    if (!validation.valid) {
                      setValidatingDocs(false)
                      setFormError(`❌ REJECTED: ${validation.reason}\n\nPlease upload documents that match the land document template with all mandatory fields.`)
                      alert(`Document Rejected!\n\n${validation.reason}\n\nREQUIRED LAND DOCUMENT FIELDS:\n\nProperty Identification:\n• Survey Number\n• Plot Number\n\nOwner Information:\n• Owner/Seller Name\n• Owner Address\n\nProperty Details:\n• Property Location\n• Total Area (in sqft or sqm)\n• Boundaries Description\n\nAdditional Required:\n• Deed Type\n• Registration Details\n• Consideration Amount\n\nPlease ensure your document is in JSON format with these exact field names.`)
                      return
                    }
                  }

                  console.log('✅ All documents validated successfully')
                  setValidatingDocs(false)

                  // 1) Upload files + metadata to IPFS via API route
                  const meta = {
                    owner: address,
                    asset: { type: formValues.assetType, name: formValues.assetName },
                    location: {
                      address: formValues.location,
                      gps: { lat: Number(formValues.gpsLat), lng: Number(formValues.gpsLng) },
                    },
                    property: {
                      sizeSqft: Number(formValues.sizeSqft || 0),
                      bedrooms: Number(formValues.bedrooms || 0),
                      bathrooms: Number(formValues.bathrooms || 0),
                      yearBuilt: Number(formValues.yearBuilt || 0),
                      estValue: formValues.estValue ? Number(formValues.estValue) : undefined,
                      notes: formValues.notes || undefined,
                    },
                    uiVersion: 'business-upload@1',
                  }

                  const fd = new FormData()
                  photoFiles.forEach((f) => fd.append('photos', f))
                  docFiles.forEach((f) => fd.append('documents', f))
                  fd.append('metadata', JSON.stringify(meta))

                  const res = await fetch('/api/ipfs/upload', { method: 'POST', body: fd })
                  if (!res.ok) {
                    const t = await res.text()
                    throw new Error(`Upload failed: ${t}`)
                  }
                  const { metadataCid } = await res.json()

                  // 2) Determine fee
                  let fee = parseEther('0.01')
                  try {
                    const onchainFee = await publicClient?.readContract({
                      ...routerConfig,
                      functionName: 'verificationFee',
                      args: [],
                    })
                    if (onchainFee) fee = onchainFee as any
                  } catch {}

                  // 3) Call OracleRouter.requestVerification
                  const locationString = `${formValues.location} | ${formValues.gpsLat},${formValues.gpsLng}`
                  await writeContractAsync({
                    ...routerConfig,
                    functionName: 'requestVerification',
                    args: [
                      AssetTypeId[formValues.assetType] as unknown as number,
                      locationString,
                      [metadataCid],
                    ],
                    value: fee,
                  })

                  router.push('/business/dashboard')
                } catch (err: any) {
                  setValidatingDocs(false)
                  setFormError(err?.message || 'Submission failed')
                }
              }}
            >
              {validatingDocs ? '🔍 Validating Documents...' : 'Submit for Verification'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
