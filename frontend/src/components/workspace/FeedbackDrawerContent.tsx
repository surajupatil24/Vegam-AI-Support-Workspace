import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { LuDownload, LuRefreshCw, LuUpload } from 'react-icons/lu'

import apiClient from '@/lib/api'
import { formatStableDateTime } from '@/lib/datetime'

type FeedbackImpactLevel = 'Blocker' | 'High' | 'Medium' | 'Low'

interface FeedbackEntryResponse {
  id: number
  title: string
  area_screen: string
  what_happened: string
  how_should_improve: string
  impact_level: FeedbackImpactLevel | null
  attachment_name: string
  attachment_download_url: string
  submitted_by_username: string
  submitted_by_name: string
  created_at: string
  updated_at: string
}

interface FeedbackListResponse {
  total: number
  feedback: FeedbackEntryResponse[]
}

interface FeedbackFormState {
  title: string
  areaScreen: string
  whatHappened: string
  howShouldImprove: string
  impactLevel: '' | FeedbackImpactLevel
  attachment: File | null
}

const DEFAULT_FORM_STATE: FeedbackFormState = {
  title: '',
  areaScreen: '',
  whatHappened: '',
  howShouldImprove: '',
  impactLevel: '',
  attachment: null,
}

function impactPillClass(impactLevel: FeedbackImpactLevel) {
  if (impactLevel === 'Blocker') {
    return 'border-[#991B1B] bg-[#7F1D1D]/30 text-[#FECACA]'
  }

  if (impactLevel === 'High') {
    return 'border-[#B45309] bg-[#78350F]/30 text-[#FDE68A]'
  }

  if (impactLevel === 'Medium') {
    return 'border-[#1D4ED8] bg-[#1E3A8A]/25 text-[#BFDBFE]'
  }

  return 'border-[#14532D] bg-[#14532D]/20 text-[#BBF7D0]'
}

export default function FeedbackDrawerContent(props: { open: boolean }) {
  const [form, setForm] = useState<FeedbackFormState>(DEFAULT_FORM_STATE)
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntryResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [downloadId, setDownloadId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!props.open) {
      return
    }

    void loadFeedback()
  }, [props.open])

  const loadFeedback = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get<FeedbackListResponse>('/feedback')
      setFeedbackEntries(response.data.feedback || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load feedback entries.')
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (field: keyof Omit<FeedbackFormState, 'attachment'>, value: string) => {
    setSuccessMessage('')
    setError('')
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSuccessMessage('')
    setError('')
    const nextFile = event.target.files?.[0] || null
    setForm((current) => ({
      ...current,
      attachment: nextFile,
    }))
  }

  const resetForm = () => {
    setForm(DEFAULT_FORM_STATE)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccessMessage('')
    setError('')

    if (!form.attachment) {
      setError('Screenshot / attachment upload is required.')
      return
    }

    setSubmitting(true)

    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('area_screen', form.areaScreen)
      payload.append('what_happened', form.whatHappened)
      payload.append('how_should_improve', form.howShouldImprove)
      payload.append('impact_level', form.impactLevel)
      payload.append('attachment', form.attachment)

      const response = await apiClient.post<FeedbackEntryResponse>('/feedback', payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setFeedbackEntries((current) => [response.data, ...current])
      setSuccessMessage('Feedback saved successfully and is now visible to all users.')
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save feedback.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownload = async (entry: FeedbackEntryResponse) => {
    setDownloadId(entry.id)
    setError('')

    try {
      const response = await apiClient.get(`/feedback/${entry.id}/download`, {
        responseType: 'blob',
      })

      const blobUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = entry.attachment_name
      link.click()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download the attachment.')
    } finally {
      setDownloadId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#1E3047] bg-[#0D1726] p-4">
        <h4 className="text-lg font-semibold text-[#F8FAFC]">Share Product Feedback</h4>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          Submit UX, workflow, or bug feedback from the investigation workspace. Every saved item is shared with all Samixa users.
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-[#EF4444]/35 bg-[#451A1A]/25 px-4 py-3 text-sm text-[#FECACA]">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-2xl border border-[#22C55E]/35 bg-[#14532D]/20 px-4 py-3 text-sm text-[#BBF7D0]">
            {successMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#E2E8F0]">Feedback Title</label>
              <span className="text-xs text-[#64748B]">{`${form.title.length}/50`}</span>
            </div>
            <input
              type="text"
              maxLength={50}
              required
              value={form.title}
              onChange={(event) => handleFieldChange('title', event.target.value)}
              className="w-full rounded-xl border border-[#24364E] bg-[#08111F] px-3 py-2.5 text-sm text-[#F8FAFC] outline-none transition placeholder:text-[#475569] focus:border-[#3B82F6]"
              placeholder="Short title for the issue or idea"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#E2E8F0]">Area / Screen</label>
              <span className="text-xs text-[#64748B]">{`${form.areaScreen.length}/25`}</span>
            </div>
            <input
              type="text"
              maxLength={25}
              required
              value={form.areaScreen}
              onChange={(event) => handleFieldChange('areaScreen', event.target.value)}
              className="w-full rounded-xl border border-[#24364E] bg-[#08111F] px-3 py-2.5 text-sm text-[#F8FAFC] outline-none transition placeholder:text-[#475569] focus:border-[#3B82F6]"
              placeholder="Example: Investigation tab"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#E2E8F0]">Screenshot / Attachment Upload</label>
              <span className="text-xs text-[#64748B]">Required</span>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#24364E] bg-[#08111F] px-3 py-3 text-sm text-[#CBD5E1] transition hover:border-[#3B82F6]/45 hover:bg-[#0B1526]">
              <LuUpload className="h-4 w-4 text-[#60A5FA]" />
              <span className="min-w-0 flex-1 truncate">
                {form.attachment ? form.attachment.name : 'Choose screenshot or attachment'}
              </span>
              <input
                type="file"
                required
                onChange={handleAttachmentChange}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#E2E8F0]">What happened?</label>
              <span className="text-xs text-[#64748B]">{`${form.whatHappened.length}/400`}</span>
            </div>
            <textarea
              maxLength={400}
              required
              rows={5}
              value={form.whatHappened}
              onChange={(event) => handleFieldChange('whatHappened', event.target.value)}
              className="w-full rounded-xl border border-[#24364E] bg-[#08111F] px-3 py-2.5 text-sm text-[#F8FAFC] outline-none transition placeholder:text-[#475569] focus:border-[#3B82F6]"
              placeholder="Describe the issue or friction clearly."
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#E2E8F0]">How should Samixa improve?</label>
              <span className="text-xs text-[#64748B]">{`${form.howShouldImprove.length}/100`}</span>
            </div>
            <textarea
              maxLength={100}
              rows={3}
              value={form.howShouldImprove}
              onChange={(event) => handleFieldChange('howShouldImprove', event.target.value)}
              className="w-full rounded-xl border border-[#24364E] bg-[#08111F] px-3 py-2.5 text-sm text-[#F8FAFC] outline-none transition placeholder:text-[#475569] focus:border-[#3B82F6]"
              placeholder="Optional improvement idea"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#E2E8F0]">Impact on your work</label>
            <select
              value={form.impactLevel}
              onChange={(event) => handleFieldChange('impactLevel', event.target.value as FeedbackFormState['impactLevel'])}
              className="w-full rounded-xl border border-[#24364E] bg-[#08111F] px-3 py-2.5 text-sm text-[#F8FAFC] outline-none transition focus:border-[#3B82F6]"
            >
              <option value="">Optional</option>
              <option value="Blocker">Blocker</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#7F1D1D] bg-[#C1121F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-70"
          >
          {submitting ? <LuRefreshCw className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Saving Feedback...' : 'Save Feedback'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#1E3047] bg-[#0D1726] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-[#F8FAFC]">Shared Feedback Feed</h4>
            <p className="mt-1 text-sm text-[#94A3B8]">Visible to all logged-in users.</p>
          </div>
          {loading ? <LuRefreshCw className="h-4 w-4 animate-spin text-[#60A5FA]" /> : null}
        </div>

        <div className="mt-4 space-y-3">
          {!loading && feedbackEntries.length === 0 ? (
            <div className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-6 text-sm text-[#94A3B8]">
              No feedback has been submitted yet.
            </div>
          ) : null}

          {feedbackEntries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F8FAFC]">{entry.title}</p>
                  <p className="mt-1 text-xs font-medium text-[#BFDBFE]">
                    {`User : ${entry.submitted_by_username || entry.submitted_by_name || 'Unknown user'}`}
                  </p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{`Area / Screen: ${entry.area_screen}`}</p>
                  {entry.submitted_by_name && entry.submitted_by_name !== entry.submitted_by_username ? (
                    <p className="mt-1 text-xs text-[#94A3B8]">{`Display name: ${entry.submitted_by_name}`}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.impact_level ? (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${impactPillClass(entry.impact_level)}`}>
                      {entry.impact_level}
                    </span>
                  ) : null}
                  <span className="text-[0.68rem] text-[#64748B]">{formatStableDateTime(entry.created_at)}</span>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#CBD5E1]">{entry.what_happened}</p>

              {entry.how_should_improve ? (
                <p className="mt-3 text-sm leading-6 text-[#94A3B8]">
                  <span className="font-medium text-[#E2E8F0]">Suggested improvement:</span>{' '}
                  {entry.how_should_improve}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="truncate text-xs text-[#60A5FA]">{entry.attachment_name}</p>
                <button
                  onClick={() => void handleDownload(entry)}
                  disabled={downloadId === entry.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#24364E] bg-[#0D1726] px-3 py-2 text-xs font-medium text-[#CBD5E1] transition hover:border-[#3B82F6]/45 hover:text-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {downloadId === entry.id ? <LuRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LuDownload className="h-3.5 w-3.5" />}
                  {downloadId === entry.id ? 'Downloading...' : 'Download Attachment'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
