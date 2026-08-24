import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  LuArrowLeft,
  LuBookOpen,
  LuBoxes,
  LuDownload,
  LuFileUp,
  LuFiles,
  LuHardDriveUpload,
  LuLogOut,
  LuRefreshCw,
  LuSearch,
  LuServer,
  LuSparkles,
  LuVideo,
} from 'react-icons/lu'

import apiClient from '@/lib/api'
import { useAuthStore } from '@/lib/store'

type KnowledgeType =
  | 'plant_flow'
  | 'cr_design'
  | 'kt_video'
  | 'blueprint'
  | 'server_infra'
  | 'document'
  | 'other'

interface KnowledgeAsset {
  id: number
  batch_id: string
  title: string
  description: string
  notes: string
  knowledge_type: KnowledgeType
  source_kind: string
  plant_names: string[]
  module_names: string[]
  tags: string[]
  original_filename: string | null
  mime_type: string | null
  file_extension: string | null
  file_size_bytes: number | null
  ingest_status: string
  uploaded_by: string
  created_at: string
  updated_at: string
  download_url: string | null
}

interface KnowledgeAssetListResponse {
  total_assets: number
  total_batches: number
  assets: KnowledgeAsset[]
  available_plants: string[]
  available_modules: string[]
}

interface KnowledgeAssetCreateResponse {
  created_count: number
  batch_id: string
  assets: KnowledgeAsset[]
  status: string
}

interface UploadFormState {
  title: string
  description: string
  notes: string
  knowledgeType: KnowledgeType
  plantNames: string
  moduleNames: string
  tags: string
  files: File[]
}

interface LibraryFilters {
  plant: string
  moduleName: string
  knowledgeType: string
  query: string
}

const KNOWLEDGE_TYPE_OPTIONS: Array<{ value: KnowledgeType; label: string; helper: string }> = [
  {
    value: 'plant_flow',
    label: 'Plant Flow',
    helper: 'GR to Dispatch flow knowledge for one or many plants.',
  },
  {
    value: 'cr_design',
    label: 'CR Design',
    helper: 'Change request designs, solution outlines, and functional changes.',
  },
  {
    value: 'kt_video',
    label: 'KT Session Video',
    helper: 'Recorded KT sessions, walkthroughs, or training videos.',
  },
  {
    value: 'blueprint',
    label: 'Blueprint',
    helper: 'Plant blueprints, architecture visuals, mappings, and diagrams.',
  },
  {
    value: 'server_infra',
    label: 'Server / Infra',
    helper: 'Infrastructure notes, server-side KT, deployment, and topology details.',
  },
  {
    value: 'document',
    label: 'General Document',
    helper: 'SOPs, PDFs, Word docs, Excel files, or mixed documentation.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Anything else that should train Samixa for future ticket solving.',
  },
]

const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  plant_flow: 'Plant Flow',
  cr_design: 'CR Design',
  kt_video: 'KT Video',
  blueprint: 'Blueprint',
  server_infra: 'Server / Infra',
  document: 'Document',
  other: 'Other',
}

const SOURCE_KIND_LABELS: Record<string, string> = {
  video: 'Video',
  presentation: 'Presentation',
  spreadsheet: 'Spreadsheet',
  pdf: 'PDF',
  document: 'Document',
  blueprint: 'Blueprint',
  note: 'Note',
}

const TRAINING_MATERIALS = [
  {
    icon: <LuSparkles className="h-5 w-5 text-emerald-300" />,
    title: 'End-to-End Plant Flows',
    copy: 'Train GR, staging, production, packing, label, and dispatch flows per plant and module.',
  },
  {
    icon: <LuFileUp className="h-5 w-5 text-blue-300" />,
    title: 'CR Design Documents',
    copy: 'Store future-state designs, change requests, requirement notes, and business process updates.',
  },
  {
    icon: <LuVideo className="h-5 w-5 text-amber-300" />,
    title: 'KT Session Videos',
    copy: 'Upload KT recordings so the knowledge layer can retain plant-specific walkthrough context.',
  },
  {
    icon: <LuBookOpen className="h-5 w-5 text-fuchsia-300" />,
    title: 'Blueprints & SOPs',
    copy: 'Keep architecture diagrams, process blueprints, SOPs, and plant reference material together.',
  },
  {
    icon: <LuServer className="h-5 w-5 text-cyan-300" />,
    title: 'Server & Infra Material',
    copy: 'Capture PPTs and documents for server topology, infrastructure, interfaces, and deployment knowledge.',
  },
]

const DEFAULT_FORM: UploadFormState = {
  title: '',
  description: '',
  notes: '',
  knowledgeType: 'plant_flow',
  plantNames: '',
  moduleNames: '',
  tags: '',
  files: [],
}

const DEFAULT_FILTERS: LibraryFilters = {
  plant: '',
  moduleName: '',
  knowledgeType: '',
  query: '',
}

function parseListInput(rawValue: string) {
  const values = rawValue
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function formatRelativeDate(value: string) {
  if (!value) {
    return 'Not available'
  }

  try {
    return `${formatDistanceToNowStrict(parseISO(value))} ago`
  } catch {
    return 'Not available'
  }
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Not available'
  }

  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'Not available'
  }
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return 'No file size'
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function buildFileDownloadName(asset: KnowledgeAsset) {
  if (asset.original_filename) {
    return asset.original_filename
  }

  const titleSlug = asset.title.trim().replace(/\s+/g, '-').toLowerCase() || `knowledge-${asset.id}`
  return `${titleSlug}${asset.file_extension || ''}`
}

function uniqueOptions(options: string[], selectedValue: string) {
  const merged = selectedValue && !options.includes(selectedValue) ? [selectedValue, ...options] : options
  return Array.from(new Set(merged))
}

export default function KnowledgeBasePage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)

  const [authLoading, setAuthLoading] = useState(true)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [downloadingAssetId, setDownloadingAssetId] = useState<number | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [form, setForm] = useState<UploadFormState>(DEFAULT_FORM)
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  const [activeFilters, setActiveFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  const [library, setLibrary] = useState<KnowledgeAssetListResponse | null>(null)
  const [pageError, setPageError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

    if (!token) {
      void router.replace('/login')
      return
    }

    if (user) {
      setAuthLoading(false)
      return
    }

    const restoreUser = async () => {
      try {
        const response = await apiClient.get('/auth/me')
        setUser(response.data)
      } catch (err) {
        console.error('Failed to restore knowledge base session:', err)
        logout()
        void router.replace('/login')
      } finally {
        setAuthLoading(false)
      }
    }

    void restoreUser()
  }, [logout, router, setUser, user])

  useEffect(() => {
    if (authLoading || !user) {
      return
    }

    void loadLibrary(DEFAULT_FILTERS)
  }, [authLoading, user])

  const plantOptions = useMemo(() => uniqueOptions(library?.available_plants || [], filters.plant), [filters.plant, library?.available_plants])
  const moduleOptions = useMemo(
    () => uniqueOptions(library?.available_modules || [], filters.moduleName),
    [filters.moduleName, library?.available_modules]
  )

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    void router.push('/dashboard')
  }

  const handleLogout = () => {
    logout()
    void router.push('/login')
  }

  async function loadLibrary(nextFilters: LibraryFilters) {
    setLibraryLoading(true)
    setPageError('')

    try {
      const params: Record<string, string> = {}

      if (nextFilters.plant) {
        params.plant = nextFilters.plant
      }
      if (nextFilters.moduleName) {
        params.module = nextFilters.moduleName
      }
      if (nextFilters.knowledgeType) {
        params.knowledge_type = nextFilters.knowledgeType
      }
      if (nextFilters.query) {
        params.q = nextFilters.query
      }

      const response = await apiClient.get<KnowledgeAssetListResponse>('/knowledge-base/assets', { params })
      setLibrary(response.data)
      setActiveFilters(nextFilters)
    } catch (err: any) {
      console.error('Failed to load knowledge assets:', err)
      setPageError(err.response?.data?.detail || 'Failed to load the knowledge library')
      setLibrary(null)
    } finally {
      setLibraryLoading(false)
    }
  }

  const handleFormValueChange =
    (field: keyof Omit<UploadFormState, 'files'>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value

      if (field === 'knowledgeType') {
        setForm((current) => ({ ...current, knowledgeType: value as KnowledgeType }))
        return
      }

      setForm((current) => ({ ...current, [field]: value }))
    }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setForm((current) => ({ ...current, files }))
  }

  const handleFilterValueChange =
    (field: keyof LibraryFilters) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value
      setFilters((current) => ({ ...current, [field]: value }))
    }

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError('')
    setSuccessMessage('')

    const plants = parseListInput(form.plantNames)
    const modules = parseListInput(form.moduleNames)
    const tags = parseListInput(form.tags)
    const hasFiles = form.files.length > 0
    const hasNotes = Boolean(form.notes.trim())

    if (plants.length === 0) {
      setSubmitError('Enter at least one plant name before storing knowledge.')
      return
    }

    if (modules.length === 0) {
      setSubmitError('Enter at least one module name before storing knowledge.')
      return
    }

    if (!hasFiles && !hasNotes) {
      setSubmitError('Upload one or more files, or add quick knowledge notes before saving.')
      return
    }

    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('title', form.title.trim())
      formData.append('description', form.description.trim())
      formData.append('notes', form.notes.trim())
      formData.append('knowledge_type', form.knowledgeType)
      formData.append('plant_names', JSON.stringify(plants))
      formData.append('module_names', JSON.stringify(modules))
      formData.append('tags', JSON.stringify(tags))
      form.files.forEach((file) => formData.append('files', file))

      const response = await apiClient.post<KnowledgeAssetCreateResponse>('/knowledge-base/assets', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setSuccessMessage(
        `Stored ${response.data.created_count} knowledge item${response.data.created_count === 1 ? '' : 's'} in batch ${response.data.batch_id.slice(0, 8)}.`
      )
      setForm(DEFAULT_FORM)
      setUploadInputKey((current) => current + 1)
      await loadLibrary(activeFilters)
    } catch (err: any) {
      console.error('Failed to store knowledge:', err)
      setSubmitError(err.response?.data?.detail || 'Failed to store this knowledge entry')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadLibrary(filters)
  }

  const handleFilterClear = () => {
    setFilters(DEFAULT_FILTERS)
    void loadLibrary(DEFAULT_FILTERS)
  }

  const handleDownload = async (asset: KnowledgeAsset) => {
    if (!asset.original_filename && !asset.download_url) {
      return
    }

    setPageError('')
    setDownloadingAssetId(asset.id)

    try {
      const response = await apiClient.get(`/knowledge-base/assets/${asset.id}/download`, {
        responseType: 'blob',
      })
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = buildFileDownloadName(asset)
      link.click()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err: any) {
      console.error('Failed to download knowledge asset:', err)
      setPageError(err.response?.data?.detail || 'Failed to download this knowledge file')
    } finally {
      setDownloadingAssetId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
          <p className="text-slate-400">Restoring your knowledge workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Knowledge Base | Samixa</title>
      </Head>

      <div className="min-h-screen bg-slate-950 text-white">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-start gap-3">
              <button
                onClick={handleBack}
                aria-label="Go back"
                className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
              >
                <LuArrowLeft className="h-5 w-5" />
              </button>

              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  <LuHardDriveUpload className="h-3.5 w-3.5" />
                  Plant-Aware Training
                </div>
                <h1 className="mt-3 text-3xl font-bold text-white">Knowledge Base</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Train Samixa with plant flows, CR designs, KT videos, blueprints, infrastructure PPTs, and any other
                  support knowledge. Every upload is stored against the exact plant and module so future ticket solving
                  can pull the right context.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-right">
                <p className="text-sm font-medium text-white">{user?.full_name || user?.username}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>

              <button
                onClick={() => void router.push('/investigation')}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:border-slate-600 hover:bg-slate-700"
              >
                Investigation
              </button>

              <button
                onClick={() => void loadLibrary(activeFilters)}
                disabled={libraryLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LuRefreshCw className={`h-4 w-4 ${libraryLoading ? 'animate-spin' : ''}`} />
                Refresh Library
              </button>

              <button
                onClick={handleLogout}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
              >
                <span className="inline-flex items-center gap-2">
                  <LuLogOut className="h-4 w-4" />
                  Logout
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<LuFiles className="h-5 w-5 text-blue-300" />}
              label="Stored Assets"
              value={library?.total_assets ?? 0}
              helper="Files and note entries currently visible in this library view"
              tone="blue"
            />
            <MetricCard
              icon={<LuBoxes className="h-5 w-5 text-emerald-300" />}
              label="Upload Batches"
              value={library?.total_batches ?? 0}
              helper="Grouped upload sessions for bulk plant/module knowledge"
              tone="green"
            />
            <MetricCard
              icon={<LuBookOpen className="h-5 w-5 text-amber-300" />}
              label="Plants Tagged"
              value={library?.available_plants.length ?? 0}
              helper="Distinct plant names available in the current result set"
              tone="amber"
            />
            <MetricCard
              icon={<LuServer className="h-5 w-5 text-fuchsia-300" />}
              label="Modules Tagged"
              value={library?.available_modules.length ?? 0}
              helper="Distinct modules available for future ticket matching"
              tone="fuchsia"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <form
              onSubmit={handleUploadSubmit}
              className="rounded-3xl border border-slate-800 bg-slate-900/65 p-6 shadow-[0_12px_40px_rgba(2,6,23,0.3)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Step 1: Tag Before Train</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Upload Plant and Module Knowledge</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-400">
                    Before Samixa learns anything, capture which plant and which module this knowledge belongs to. That
                    tag becomes the retrieval context for future ticket solving.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                  Plant and module are mandatory for every upload.
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="Plant Name(s)"
                  helper="Enter one or multiple plants separated by comma or new line."
                  required
                >
                  <textarea
                    value={form.plantNames}
                    onChange={handleFormValueChange('plantNames')}
                    rows={4}
                    placeholder="BASF India&#10;Surventis Highrunner"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </FieldBlock>

                <FieldBlock
                  label="Module(s)"
                  helper="Examples: GR, Dispatch, Label, Symphony, Highrunner."
                  required
                >
                  <textarea
                    value={form.moduleNames}
                    onChange={handleFormValueChange('moduleNames')}
                    rows={4}
                    placeholder="GR&#10;Dispatch&#10;Label"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </FieldBlock>

                <FieldBlock
                  label="Knowledge Type"
                  helper="Pick the closest training material category."
                  required
                >
                  <select
                    value={form.knowledgeType}
                    onChange={handleFormValueChange('knowledgeType')}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                  >
                    {KNOWLEDGE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldBlock>

                <FieldBlock
                  label="Title"
                  helper="Optional, but useful for clear library browsing later."
                >
                  <input
                    value={form.title}
                    onChange={handleFormValueChange('title')}
                    placeholder="GLM label flow for BASF India"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </FieldBlock>
              </div>

              <div className="mt-4 grid gap-4">
                <FieldBlock
                  label="Short Description"
                  helper="Optional summary of what this training material covers."
                >
                  <textarea
                    value={form.description}
                    onChange={handleFormValueChange('description')}
                    rows={3}
                    placeholder="Explains label selection, plant routing, and spool handoff for BASF India."
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </FieldBlock>

                <FieldBlock
                  label="Quick Notes / Learned Context"
                  helper="Use this when you want to directly type knowledge even without uploading a file."
                >
                  <textarea
                    value={form.notes}
                    onChange={handleFormValueChange('notes')}
                    rows={5}
                    placeholder="Inside this plant, printer IA5016 should be used for GLM labels. IA0024 must not be selected for this flow."
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </FieldBlock>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                  <FieldBlock
                    label="Tags"
                    helper="Optional search helpers like printer, SAP, routing, bluecoat."
                  >
                    <input
                      value={form.tags}
                      onChange={handleFormValueChange('tags')}
                      placeholder="printer, sap, label, routing"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                    />
                  </FieldBlock>

                  <FieldBlock
                    label="Upload Files"
                    helper="You can upload videos, PDFs, DOCX, PPT, Excel, images, blueprints, or mixed docs."
                  >
                    <input
                      key={uploadInputKey}
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="block w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-blue-500/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-100 hover:file:bg-blue-500/30"
                    />
                  </FieldBlock>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Selected Uploads</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Leave files empty if you only want to store typed notes for this plant/module.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
                    {form.files.length} file{form.files.length === 1 ? '' : 's'}
                  </span>
                </div>

                {form.files.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No files selected yet. Notes-only training is also allowed.</p>
                ) : (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {form.files.map((file) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200"
                      >
                        <p className="font-medium text-white">{file.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatBytes(file.size)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <LuHardDriveUpload className="h-4 w-4" />
                  {submitting ? 'Storing Knowledge...' : 'Store Knowledge'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForm(DEFAULT_FORM)
                    setSubmitError('')
                    setSuccessMessage('')
                    setUploadInputKey((current) => current + 1)
                  }}
                  className="rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-600 hover:bg-slate-700"
                >
                  Reset Form
                </button>
              </div>
            </form>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-slate-800 bg-slate-900/65 p-6 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Accepted Training Material</p>
                <div className="mt-5 space-y-4">
                  {TRAINING_MATERIALS.map((material) => (
                    <div key={material.title} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{material.icon}</div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{material.title}</h3>
                          <p className="mt-1 text-sm text-slate-400">{material.copy}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/12 via-slate-900/70 to-emerald-500/10 p-6 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">How It Works</p>
                <div className="mt-4 space-y-4">
                  <ProcessStep
                    step="1"
                    title="Tag plants and modules first"
                    copy="Every upload is anchored to the exact plants and modules it trains."
                  />
                  <ProcessStep
                    step="2"
                    title="Store files and notes together"
                    copy="Samixa keeps the file plus the typed summary so the context is not lost."
                  />
                  <ProcessStep
                    step="3"
                    title="Retrieve the right knowledge later"
                    copy="Future ticket-solving can match plant/module context instead of using generic answers."
                  />
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/65 p-6 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Storage Approach</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Knowledge metadata is stored in the database with plant and module tags, while uploaded files are kept
                  on the server for later retrieval. This keeps onboarding fast now and still gives us a clean path for
                  future retrieval, search, and AI-assisted ticket resolution.
                </p>
              </section>
            </aside>
          </section>

          {submitError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {submitError}
            </div>
          )}

          {successMessage && (
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
              {successMessage}
            </div>
          )}

          {pageError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {pageError}
            </div>
          )}

          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/65 p-6 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Step 2: Browse Stored Knowledge</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Knowledge Library</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Search by plant, module, type, or free text to find the right training material quickly.
                </p>
              </div>
            </div>

            <form onSubmit={handleFilterSubmit} className="mt-6 grid gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Plant</label>
                <select
                  value={filters.plant}
                  onChange={handleFilterValueChange('plant')}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                >
                  <option value="">All plants</option>
                  {plantOptions.map((plantName) => (
                    <option key={plantName} value={plantName}>
                      {plantName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Module</label>
                <select
                  value={filters.moduleName}
                  onChange={handleFilterValueChange('moduleName')}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                >
                  <option value="">All modules</option>
                  {moduleOptions.map((moduleName) => (
                    <option key={moduleName} value={moduleName}>
                      {moduleName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</label>
                <select
                  value={filters.knowledgeType}
                  onChange={handleFilterValueChange('knowledgeType')}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                >
                  <option value="">All types</option>
                  {KNOWLEDGE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Search</label>
                <div className="relative">
                  <LuSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={filters.query}
                    onChange={handleFilterValueChange('query')}
                    placeholder="title, note, plant, module..."
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="self-end rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={handleFilterClear}
                className="self-end rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-600 hover:bg-slate-700"
              >
                Clear
              </button>
            </form>

            {libraryLoading ? (
              <div className="mt-8 flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/45">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
                  <p className="text-slate-400">Loading knowledge library...</p>
                </div>
              </div>
            ) : !library || library.assets.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-dashed border-slate-700 bg-slate-950/35 px-6 py-12 text-center">
                <h3 className="text-xl font-semibold text-white">No knowledge stored for this view yet</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Upload the first plant/module training material above and it will appear here for future retrieval.
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-4">
                {library.assets.map((asset) => (
                  <article
                    key={asset.id}
                    className="rounded-3xl border border-slate-800 bg-slate-950/50 p-5 shadow-[0_10px_30px_rgba(2,6,23,0.2)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-white">{asset.title}</h3>
                          <Badge copy={KNOWLEDGE_TYPE_LABELS[asset.knowledge_type] || asset.knowledge_type} tone="blue" />
                          <Badge copy={SOURCE_KIND_LABELS[asset.source_kind] || asset.source_kind} tone="emerald" />
                          <Badge copy={asset.ingest_status} tone="slate" />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {asset.description || asset.notes || 'No extra summary provided for this knowledge item.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {asset.original_filename ? (
                          <button
                            onClick={() => void handleDownload(asset)}
                            disabled={downloadingAssetId === asset.id}
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <LuDownload className="h-4 w-4" />
                            {downloadingAssetId === asset.id ? 'Downloading...' : 'Download'}
                          </button>
                        ) : (
                          <span className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300">
                            Notes Only
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="space-y-4">
                        <TagGroup label="Plants" values={asset.plant_names} />
                        <TagGroup label="Modules" values={asset.module_names} />
                        {asset.tags.length > 0 ? <TagGroup label="Tags" values={asset.tags} /> : null}

                        {asset.notes ? (
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Stored Notes</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{asset.notes}</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <MetaRow label="Uploaded by" value={asset.uploaded_by} />
                        <MetaRow label="Created" value={`${formatDateTime(asset.created_at)} (${formatRelativeDate(asset.created_at)})`} />
                        <MetaRow label="Updated" value={formatDateTime(asset.updated_at)} />
                        <MetaRow label="Batch ID" value={asset.batch_id} />
                        <MetaRow label="File" value={asset.original_filename || 'No file attached'} />
                        <MetaRow label="Size" value={formatBytes(asset.file_size_bytes)} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  )
}

function FieldBlock(props: {
  label: string
  helper: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-white">{props.label}</label>
        {props.required ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200">
            Required
          </span>
        ) : null}
      </div>
      {props.children}
      <p className="mt-2 text-xs text-slate-500">{props.helper}</p>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  helper: string
  tone: 'blue' | 'green' | 'amber' | 'fuchsia'
}) {
  const tones = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    green: 'border-emerald-500/20 bg-emerald-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    fuchsia: 'border-fuchsia-500/20 bg-fuchsia-500/5',
  }

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <div>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </div>
  )
}

function ProcessStep(props: { step: string; title: string; copy: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-100">
        {props.step}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{props.title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">{props.copy}</p>
      </div>
    </div>
  )
}

function Badge(props: { copy: string; tone: 'blue' | 'emerald' | 'slate' }) {
  const tones = {
    blue: 'border-blue-500/25 bg-blue-500/10 text-blue-100',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
    slate: 'border-slate-700 bg-slate-800 text-slate-300',
  }

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[props.tone]}`}>{props.copy}</span>
}

function TagGroup(props: { label: string; values: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.values.map((value) => (
          <span
            key={`${props.label}-${value}`}
            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function MetaRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{props.value}</p>
    </div>
  )
}
