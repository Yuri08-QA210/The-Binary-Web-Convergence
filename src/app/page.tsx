'use client'

import { useState, useRef, useCallback, type DragEvent } from 'react'
import {
  Shield,
  Upload,
  FileCode,
  Zap,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  Terminal,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'

// ── Types ────────────────────────────────────────────────────────────────────
interface UploadResponse {
  success?: boolean
  message?: string
  file?: string
  processingTime?: string
  metadata?: Record<string, unknown>
  entityCount?: number
  error?: string
  detail?: string
  hint?: string
}

// ── JSON Viewer Component ────────────────────────────────────────────────────
function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false)

  const formatted = JSON.stringify(data, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Simple syntax highlighting
  const highlightJson = (json: string) => {
    return json.replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span style="color:#7dd3fc">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span style="color:#86efac">$1</span>'
    ).replace(
      /:\s*(\d+)/g,
      ': <span style="color:#fde68a">$1</span>'
    ).replace(
      /:\s*(true|false)/g,
      ': <span style="color:#c4b5fd">$1</span>'
    ).replace(
      /:\s*(null)/g,
      ': <span style="color:#f87171">$1</span>'
    )
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 text-xs text-gray-400 hover:text-white transition-colors bg-gray-800 px-2 py-1 rounded"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm overflow-auto max-h-96 font-mono leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlightJson(formatted) }}
      />
    </div>
  )
}

// ── Main Page Component ──────────────────────────────────────────────────────
export default function Home() {
  // ── State ────────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [response, setResponse] = useState<UploadResponse | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // ── File Handling ─────────────────────────────────────────────────────────
  const validateAndSetFile = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.svg')) {
      toast({
        title: 'Invalid file type',
        description: 'Only .svg files are accepted. Please select an SVG file.',
        variant: 'destructive',
      })
      return
    }
    setFile(selectedFile)
    setResponse(null)
    setResponseError(null)
  }, [toast])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) validateAndSetFile(selectedFile)
  }

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) validateAndSetFile(droppedFile)
    },
    [validateAndSetFile]
  )

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const clearFile = () => {
    setFile(null)
    setResponse(null)
    setResponseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Upload Handler ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setResponse(null)
    setResponseError(null)

    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setResponseError(data.detail || data.error || 'Upload failed')
        setResponse(data)
        toast({
          title: 'Upload failed',
          description: data.detail || data.error || 'An error occurred during processing.',
          variant: 'destructive',
        })
      } else {
        setResponse(data)
        toast({
          title: 'SVG processed',
          description: data.message || 'File uploaded and processed successfully.',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      setResponseError(message)
      toast({
        title: 'Upload error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  // ── Format File Size ─────────────────────────────────────────────────────
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Scroll Helper ────────────────────────────────────────────────────────
  const scrollToUpload = () => {
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">VaultVM</span>
              <span className="ml-2 text-sm text-gray-400">SVG Avatar Studio</span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={scrollToUpload}
            >
              <Upload className="w-4 h-4 mr-1" />
              Upload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
            >
              <FileCode className="w-4 h-4 mr-1" />
              Gallery
            </Button>
          </nav>
        </div>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
          <Badge
            variant="outline"
            className="mb-6 border-blue-500/30 text-blue-400 bg-blue-500/10 px-3 py-1"
          >
            <Zap className="w-3 h-3 mr-1" />
            Advanced SVG Processing Engine v2.1
          </Badge>

          <h1 className="text-5xl font-bold tracking-tight text-white mb-6">
            Transform Your{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              SVG Avatars
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload, process, and optimize your SVG files with our advanced processing engine.
            Support for metadata extraction, entity resolution, and dynamic rendering.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-12 text-base cursor-pointer"
              onClick={scrollToUpload}
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload SVG
            </Button>
          </div>

          {/* Feature pills */}
          <div className="flex items-center justify-center gap-3 mt-12 flex-wrap">
            {[
              'Metadata Extraction',
              'Entity Resolution',
              'SVG Optimization',
              'Dynamic Rendering',
            ].map((feature) => (
              <span
                key={feature}
                className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-full px-3 py-1.5"
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Scroll indicator */}
          <div className="mt-16 animate-bounce">
            <ArrowDown className="w-5 h-5 text-gray-600 mx-auto" />
          </div>
        </div>
      </section>

      <Separator className="bg-gray-800" />

      {/* ── Upload Section ───────────────────────────────────────────────── */}
      <section id="upload-section" className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-3">Upload & Process</h2>
          <p className="text-gray-400">
            Select or drag-and-drop an SVG file to process it through our engine.
          </p>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileCode className="w-5 h-5 text-blue-400" />
              SVG Processor
            </CardTitle>
            <CardDescription className="text-gray-400">
              Upload an SVG avatar file for processing, optimization, and metadata extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
                flex flex-col items-center justify-center py-12 px-6
                ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : file
                      ? 'border-green-500/50 bg-green-500/5'
                      : 'border-gray-700 bg-gray-950/50 hover:border-gray-600 hover:bg-gray-900/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/20 border border-green-500/30">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{file.name}</p>
                    <p className="text-sm text-gray-400">{formatSize(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFile()
                    }}
                    className="ml-4 p-1 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload
                    className={`w-10 h-10 mb-3 ${isDragging ? 'text-blue-400' : 'text-gray-600'}`}
                  />
                  <p className="text-gray-300 font-medium mb-1">
                    {isDragging ? 'Drop your SVG here' : 'Drag & drop your SVG file here'}
                  </p>
                  <p className="text-sm text-gray-500">
                    or click to browse — .svg files only
                  </p>
                </>
              )}
            </div>

            {/* Process Button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Process SVG
                  </>
                )}
              </Button>
              {file && !isUploading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  className="text-gray-500 hover:text-gray-300 cursor-pointer"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Results Area */}
            {(response || responseError) && (
              <div className="space-y-4">
                <Separator className="bg-gray-800" />

                {/* Status Bar */}
                {responseError ? (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-red-300">Processing Error</p>
                      <p className="text-sm text-red-400/80 mt-1">{responseError}</p>
                      {response?.hint && (
                        <p className="text-xs text-red-400/60 mt-2 italic">
                          Hint: {response.hint}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  response?.success && (
                    <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-green-300">
                          {response.message || 'Processed successfully'}
                        </p>
                        {response.processingTime && (
                          <p className="text-sm text-green-400/70 mt-1">
                            Completed in {response.processingTime}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                )}

                {/* Response JSON Viewer */}
                {response && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-300">
                        Server Response
                      </span>
                      {response.entityCount && (
                        <Badge
                          variant="outline"
                          className="text-xs border-yellow-500/30 text-yellow-400"
                        >
                          {response.entityCount} entities resolved
                        </Badge>
                      )}
                    </div>
                    <JsonViewer data={response} />
                  </div>
                )}

                {/* Highlighted debugInfo/metadata extraction */}
                {response?.metadata &&
                  typeof response.metadata === 'object' &&
                  'debugInfo' in (response.metadata as Record<string, unknown>) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-medium text-amber-300">
                          Debug Information
                        </span>
                      </div>
                      <JsonViewer data={(response.metadata as Record<string, unknown>).debugInfo} />
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <span className="font-semibold text-sm text-white">VaultVM v2.1.0</span>
                <p className="text-xs text-gray-500">
                  Powered by Nunjucks Template Engine
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              If you need debug access, contact your system administrator
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
