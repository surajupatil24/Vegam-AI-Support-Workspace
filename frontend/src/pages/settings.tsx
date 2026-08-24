import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  LuBot,
  LuCheck,
  LuChevronLeft,
  LuClipboardList,
  LuDatabase,
  LuEye,
  LuEyeOff,
  LuGitBranch,
  LuRefreshCw,
  LuSave,
  LuSettings,
} from 'react-icons/lu'

import apiClient from '@/lib/api'
import { useAuthStore } from '@/lib/store'

const PROVIDER_OPTIONS = ['ChatGPT', 'Claude', 'Azure OpenAI'] as const

type ProviderOption = typeof PROVIDER_OPTIONS[number]
type SectionId = 'api' | 'common' | 'personal'
type SectionTone = 'blue' | 'violet' | 'emerald'
type SectionMode = 'api' | 'credentials'
type TabId = 'code' | 'database' | 'configuration' | 'projects' | 'ai'
type SecureTabId = 'code' | 'database' | 'configuration'

interface ConnectionState {
  provider: ProviderOption
  connected: boolean
  apiKey: string
  username: string
  password: string
  baseUrl: string
  model: string
  name: string
}

interface SourceConfigState {
  sourceUrl: string
  username: string
  password: string
  passwordConfigured: boolean
  connected: boolean
  updatedAt: string
  lastSyncedAt: string
  lastSyncCommit: string
}

interface SourcePanelState {
  config: SourceConfigState
  loading: boolean
  saving: boolean
  testing: boolean
  error: string
  message: string
}

interface RepositoryConfigResponse {
  repository_url: string
  username: string
  password_configured: boolean
  connected: boolean
  updated_at: string | null
  last_sync_at: string | null
  last_sync_commit: string | null
}

interface RepositoryConnectionTestResponse {
  success: boolean
  message: string
  latest_commit: string | null
  repository: RepositoryConfigResponse
}

interface CredentialSourceConfigResponse {
  source_url: string
  username: string
  password_configured: boolean
  connected: boolean
  updated_at: string | null
}

interface RedmineProjectItemResponse {
  id: number
  name: string
  identifier: string
  enabled: boolean
}

interface RedmineProjectsConfigResponse {
  projects: RedmineProjectItemResponse[]
  enabled_project_ids: number[]
  total: number
  configured: boolean
  updated_at: string | null
}

interface RedmineProjectsConfigRequest {
  enabled_project_ids: number[]
}

interface RedmineProjectsPanelState {
  projects: RedmineProjectItemResponse[]
  loading: boolean
  saving: boolean
  error: string
  message: string
  configured: boolean
  updatedAt: string
}

interface AIProviderSectionResponse {
  provider: ProviderOption
  connected: boolean
  api_key_configured: boolean
  username: string
  password_configured: boolean
  base_url: string
  model: string
  name: string
  updated_at: string | null
}

interface AIProviderSectionsResponse {
  api: AIProviderSectionResponse
  common: AIProviderSectionResponse
  personal: AIProviderSectionResponse
}

interface AIProviderSectionsRequest {
  api: {
    provider: ProviderOption
    connected: boolean
    api_key: string
    username: string
    password: string
    base_url: string
    model: string
    name: string
  }
  common: {
    provider: ProviderOption
    connected: boolean
    api_key: string
    username: string
    password: string
    base_url: string
    model: string
    name: string
  }
  personal: {
    provider: ProviderOption
    connected: boolean
    api_key: string
    username: string
    password: string
    base_url: string
    model: string
    name: string
  }
}

interface AIProviderConnectionTestResponse {
  success: boolean
  message: string
  section_id: SectionId
  config: AIProviderSectionResponse
}

type ConnectionsState = Record<SectionId, ConnectionState>
type PasswordVisibilityState = Record<SectionId, boolean>
type SecureTabVisibilityState = Record<SecureTabId, boolean>
type SettingsFeedback = { type: 'success' | 'error'; message: string } | null

const SECTION_META: Record<
  SectionId,
  {
    step: string
    title: string
    subtitle: string
    tone: SectionTone
    mode: SectionMode
  }
> = {
  api: {
    step: '1',
    title: 'Connect AI with API',
    subtitle: 'Use provider API credentials for production and automation flows.',
    tone: 'blue',
    mode: 'api',
  },
  common: {
    step: '2',
    title: 'Connect with Common AI',
    subtitle: 'Use shared team credentials for the common workspace connection.',
    tone: 'violet',
    mode: 'credentials',
  },
  personal: {
    step: '3',
    title: 'Connect with Personal AI',
    subtitle: 'Use personal account credentials for an individual AI connection.',
    tone: 'emerald',
    mode: 'credentials',
  },
}

const TAB_META: Record<
  TabId,
  {
    label: string
    helper: string
    accent: string
    icon: typeof LuGitBranch
  }
> = {
  code: {
    label: 'Active Code Source',
    helper: 'Vegam repository connection',
    accent: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
    icon: LuGitBranch,
  },
  database: {
    label: 'Database Source',
    helper: 'Live data connection details',
    accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    icon: LuDatabase,
  },
  configuration: {
    label: 'Configuration Source',
    helper: 'External config and setup source',
    accent: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    icon: LuSettings,
  },
  projects: {
    label: 'Redmine Projects',
    helper: 'Enable the projects this system should use',
    accent: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
    icon: LuClipboardList,
  },
  ai: {
    label: 'AI Provider Connections',
    helper: 'Model and provider setup',
    accent: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100',
    icon: LuBot,
  },
}

const DEFAULT_CONNECTIONS: ConnectionsState = {
  api: {
    provider: 'ChatGPT',
    connected: false,
    apiKey: '',
    username: '',
    password: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    name: 'API Workspace Connection',
  },
  common: {
    provider: 'Claude',
    connected: false,
    apiKey: '',
    username: '',
    password: '',
    baseUrl: 'https://portal.company-ai.local',
    model: '',
    name: 'Common Team Connection',
  },
  personal: {
    provider: 'Azure OpenAI',
    connected: false,
    apiKey: '',
    username: '',
    password: '',
    baseUrl: '',
    model: '',
    name: 'Personal AI Connection',
  },
}

const DEFAULT_SOURCE_CONFIG: SourceConfigState = {
  sourceUrl: '',
  username: '',
  password: '',
  passwordConfigured: false,
  connected: false,
  updatedAt: '',
  lastSyncedAt: '',
  lastSyncCommit: '',
}

const DEFAULT_SOURCE_PANEL_STATE: SourcePanelState = {
  config: DEFAULT_SOURCE_CONFIG,
  loading: true,
  saving: false,
  testing: false,
  error: '',
  message: '',
}

const DEFAULT_REDMINE_PROJECTS_PANEL_STATE: RedmineProjectsPanelState = {
  projects: [],
  loading: true,
  saving: false,
  error: '',
  message: '',
  configured: false,
  updatedAt: '',
}

function getToneClasses(tone: SectionTone) {
  if (tone === 'violet') {
    return {
      number: 'border-[#A855F7]/60 bg-[#A855F7]/12 text-[#D8B4FE]',
      active: 'border-[#A855F7]/55 bg-[#A855F7]/12 text-[#F5F3FF]',
      button: 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] hover:from-[#8B5CF6] hover:to-[#C084FC]',
      ring: 'border-[#A855F7]/45 shadow-[0_18px_45px_rgba(76,29,149,0.24)]',
      focus: 'focus:border-[#A855F7]',
    }
  }

  if (tone === 'emerald') {
    return {
      number: 'border-[#22C55E]/60 bg-[#22C55E]/12 text-[#86EFAC]',
      active: 'border-[#22C55E]/55 bg-[#22C55E]/12 text-[#F0FDF4]',
      button: 'bg-gradient-to-r from-[#059669] to-[#22C55E] hover:from-[#10B981] hover:to-[#4ADE80]',
      ring: 'border-[#22C55E]/45 shadow-[0_18px_45px_rgba(4,120,87,0.24)]',
      focus: 'focus:border-[#22C55E]',
    }
  }

  return {
    number: 'border-[#3B82F6]/60 bg-[#3B82F6]/12 text-[#93C5FD]',
    active: 'border-[#3B82F6]/55 bg-[#3B82F6]/12 text-[#EFF6FF]',
    button: 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:from-[#3B82F6] hover:to-[#60A5FA]',
    ring: 'border-[#3B82F6]/45 shadow-[0_18px_45px_rgba(37,99,235,0.24)]',
    focus: 'focus:border-[#3B82F6]',
  }
}

function getDefaultBaseUrl(provider: ProviderOption): string {
  if (provider === 'Claude') {
    return 'https://api.anthropic.com'
  }

  if (provider === 'Azure OpenAI') {
    return 'https://your-resource.openai.azure.com'
  }

  return 'https://api.openai.com/v1'
}

function getDefaultModel(provider: ProviderOption): string {
  if (provider === 'Claude') {
    return 'claude-3-5-sonnet'
  }

  if (provider === 'Azure OpenAI') {
    return 'gpt-4o-deployment'
  }

  return 'gpt-4o'
}

function getApiKeyLabel(provider: ProviderOption): string {
  if (provider === 'Azure OpenAI') {
    return 'API Key / Access Key'
  }

  return 'API Key'
}

function getConnectionPlaceholder(sectionId: SectionId, provider: ProviderOption): string {
  if (sectionId === 'personal') {
    return `${provider} - Personal Connection`
  }

  if (sectionId === 'common') {
    return `${provider} - Common Team Connection`
  }

  return `${provider} - API Workspace`
}

function getCredentialHelpText(sectionId: SectionId): string {
  if (sectionId === 'common') {
    return 'One provider should be connected for the shared team workspace. The other provider options stay blurred for quick identification.'
  }

  return 'One provider should be connected for this personal section. The other provider options stay blurred for quick identification.'
}

function formatSavedAt(value: string) {
  if (!value) {
    return 'Not saved yet'
  }

  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'Not saved yet'
  }
}

function isLocalCodeSourcePath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  return !/^https?:\/\//i.test(trimmed)
}

function formatCodeSyncAt(value: string) {
  if (!value) {
    return 'Not synced yet'
  }

  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'Not synced yet'
  }
}

function normalizeRepositoryResponse(data: RepositoryConfigResponse): SourceConfigState {
  return {
    sourceUrl: data.repository_url || '',
    username: data.username || '',
    password: '',
    passwordConfigured: Boolean(data.password_configured),
    connected: Boolean(data.connected),
    updatedAt: data.updated_at || '',
    lastSyncedAt: data.last_sync_at || '',
    lastSyncCommit: data.last_sync_commit || '',
  }
}

function normalizeCredentialResponse(data: CredentialSourceConfigResponse): SourceConfigState {
  return {
    sourceUrl: data.source_url || '',
    username: data.username || '',
    password: '',
    passwordConfigured: Boolean(data.password_configured),
    connected: Boolean(data.connected),
    updatedAt: data.updated_at || '',
    lastSyncedAt: '',
    lastSyncCommit: '',
  }
}

function normalizeAIProviderSection(data: AIProviderSectionResponse, sectionId: SectionId): ConnectionState {
  const provider = PROVIDER_OPTIONS.includes(data.provider) ? data.provider : DEFAULT_CONNECTIONS[sectionId].provider

  return {
    provider,
    connected: Boolean(data.connected),
    apiKey: '',
    username: data.username || '',
    password: '',
    baseUrl: data.base_url || getDefaultBaseUrl(provider),
    model: data.model || (sectionId === 'api' ? getDefaultModel(provider) : ''),
    name: data.name || getConnectionPlaceholder(sectionId, provider),
  }
}

function normalizeAIProviderSections(data: AIProviderSectionsResponse): ConnectionsState {
  return {
    api: normalizeAIProviderSection(data.api, 'api'),
    common: normalizeAIProviderSection(data.common, 'common'),
    personal: normalizeAIProviderSection(data.personal, 'personal'),
  }
}

function buildAIProviderRequestPayload(connections: ConnectionsState): AIProviderSectionsRequest {
  return {
    api: {
      provider: connections.api.provider,
      connected: connections.api.connected,
      api_key: connections.api.apiKey,
      username: connections.api.username,
      password: connections.api.password,
      base_url: connections.api.baseUrl,
      model: connections.api.model,
      name: connections.api.name,
    },
    common: {
      provider: connections.common.provider,
      connected: connections.common.connected,
      api_key: connections.common.apiKey,
      username: connections.common.username,
      password: connections.common.password,
      base_url: connections.common.baseUrl,
      model: connections.common.model,
      name: connections.common.name,
    },
    personal: {
      provider: connections.personal.provider,
      connected: connections.personal.connected,
      api_key: connections.personal.apiKey,
      username: connections.personal.username,
      password: connections.personal.password,
      base_url: connections.personal.baseUrl,
      model: connections.personal.model,
      name: connections.personal.name,
    },
  }
}

export default function SettingsPage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)

  const [activeTab, setActiveTab] = useState<TabId>('code')
  const [showPassword, setShowPassword] = useState<PasswordVisibilityState>({
    api: false,
    common: false,
    personal: false,
  })
  const [showSourcePassword, setShowSourcePassword] = useState<SecureTabVisibilityState>({
    code: false,
    database: false,
    configuration: false,
  })
  const [connections, setConnections] = useState<ConnectionsState>(DEFAULT_CONNECTIONS)
  const [authLoading, setAuthLoading] = useState(true)
  const [repoPanel, setRepoPanel] = useState<SourcePanelState>(DEFAULT_SOURCE_PANEL_STATE)
  const [databasePanel, setDatabasePanel] = useState<SourcePanelState>(DEFAULT_SOURCE_PANEL_STATE)
  const [configurationPanel, setConfigurationPanel] = useState<SourcePanelState>(DEFAULT_SOURCE_PANEL_STATE)
  const [redmineProjectsPanel, setRedmineProjectsPanel] = useState<RedmineProjectsPanelState>(
    DEFAULT_REDMINE_PROJECTS_PANEL_STATE
  )
  const [settingsFeedback, setSettingsFeedback] = useState<SettingsFeedback>(null)

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
        console.error('Failed to restore settings session:', err)
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

    void Promise.allSettled([
      loadRepositoryConfig(),
      loadDatabaseSourceConfig(),
      loadConfigurationSourceConfig(),
      loadRedmineProjectsConfig(),
      loadAIProviderConnections(),
    ])
  }, [authLoading, user])

  const connectedTabs = useMemo(
    () => ({
      code: repoPanel.config.connected,
      database: databasePanel.config.connected,
      configuration: configurationPanel.config.connected,
      projects: redmineProjectsPanel.configured || redmineProjectsPanel.projects.some((project) => project.enabled),
      ai: Object.values(connections).some((connection) => connection.connected),
    }),
    [
      configurationPanel.config.connected,
      connections,
      databasePanel.config.connected,
      redmineProjectsPanel.configured,
      redmineProjectsPanel.projects,
      repoPanel.config.connected,
    ]
  )

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    void router.push('/dashboard')
  }

  const handleInputChange = (sectionId: SectionId, field: keyof ConnectionState, value: string) => {
    setSettingsFeedback(null)
    setConnections((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        [field]: value,
        connected: false,
      },
    }))
  }

  const handleProviderSelect = (sectionId: SectionId, provider: ProviderOption) => {
    setSettingsFeedback(null)
    setConnections((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        provider,
        connected: false,
        baseUrl: sectionId === 'api' ? getDefaultBaseUrl(provider) : prev[sectionId].baseUrl,
        model: sectionId === 'api' ? getDefaultModel(provider) : prev[sectionId].model,
        name: getConnectionPlaceholder(sectionId, provider),
      },
    }))
  }

  const loadAIProviderConnections = async () => {
    try {
      const response = await apiClient.get<AIProviderSectionsResponse>('/admin/ai-providers')
      setConnections(normalizeAIProviderSections(response.data))
    } catch (err) {
      console.error('Failed to load AI provider connections:', err)
      setSettingsFeedback({
        type: 'error',
        message: 'Failed to load AI provider connections.',
      })
    }
  }

  const handleTestConnection = async (sectionId: SectionId) => {
    setSettingsFeedback(null)

    try {
      const response = await apiClient.post<AIProviderConnectionTestResponse>('/admin/ai-providers/test', {
        section_id: sectionId,
        config: {
          provider: connections[sectionId].provider,
          connected: connections[sectionId].connected,
          api_key: connections[sectionId].apiKey,
          username: connections[sectionId].username,
          password: connections[sectionId].password,
          base_url: connections[sectionId].baseUrl,
          model: connections[sectionId].model,
          name: connections[sectionId].name,
        },
      })

      setConnections((prev) => ({
        ...prev,
        [sectionId]: normalizeAIProviderSection(response.data.config, sectionId),
      }))
      setSettingsFeedback({
        type: 'success',
        message: response.data.message,
      })
    } catch (err: any) {
      console.error('Failed to test AI provider connection:', err)
      setSettingsFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to test AI provider connection.',
      })
    }
  }

  const handleSaveSettings = async () => {
    setSettingsFeedback(null)

    try {
      const response = await apiClient.post<AIProviderSectionsResponse>(
        '/admin/ai-providers',
        buildAIProviderRequestPayload(connections)
      )
      setConnections(normalizeAIProviderSections(response.data))
      setSettingsFeedback({
        type: 'success',
        message: 'AI provider settings saved successfully.',
      })
    } catch (err: any) {
      console.error('Failed to save AI provider settings:', err)
      setSettingsFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to save AI provider settings.',
      })
    }
  }

  const handleSourceFieldChange = (
    tabId: SecureTabId,
    field: keyof SourceConfigState,
    value: string
  ) => {
    const setter = getSourceSetter(tabId)
    setter((prev) => ({
      ...prev,
      error: '',
      message: '',
      config: {
        ...prev.config,
        [field]: value,
        connected: false,
        lastSyncedAt: tabId === 'code' ? '' : prev.config.lastSyncedAt,
        lastSyncCommit: tabId === 'code' ? '' : prev.config.lastSyncCommit,
      },
    }))
  }

  const loadRepositoryConfig = async () => {
    setRepoPanel((prev) => ({ ...prev, loading: true, error: '', message: '' }))

    try {
      const response = await apiClient.get<RepositoryConfigResponse>('/admin/vegam-repository')
      setRepoPanel((prev) => ({
        ...prev,
        loading: false,
        config: normalizeRepositoryResponse(response.data),
      }))
    } catch (err: any) {
      console.error('Failed to load Vegam repository config:', err)
      setRepoPanel((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.detail || 'Failed to load Vegam repository configuration',
      }))
    }
  }

  const loadDatabaseSourceConfig = async () => {
    setDatabasePanel((prev) => ({ ...prev, loading: true, error: '', message: '' }))

    try {
      const response = await apiClient.get<CredentialSourceConfigResponse>('/admin/database-source')
      setDatabasePanel((prev) => ({
        ...prev,
        loading: false,
        config: normalizeCredentialResponse(response.data),
      }))
    } catch (err: any) {
      console.error('Failed to load database source config:', err)
      setDatabasePanel((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.detail || 'Failed to load database source configuration',
      }))
    }
  }

  const loadConfigurationSourceConfig = async () => {
    setConfigurationPanel((prev) => ({ ...prev, loading: true, error: '', message: '' }))

    try {
      const response = await apiClient.get<CredentialSourceConfigResponse>('/admin/configuration-source')
      setConfigurationPanel((prev) => ({
        ...prev,
        loading: false,
        config: normalizeCredentialResponse(response.data),
      }))
    } catch (err: any) {
      console.error('Failed to load configuration source config:', err)
      setConfigurationPanel((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.detail || 'Failed to load configuration source configuration',
      }))
    }
  }

  const loadRedmineProjectsConfig = async () => {
    setRedmineProjectsPanel((prev) => ({
      ...prev,
      loading: true,
      error: '',
      message: '',
    }))

    try {
      const response = await apiClient.get<RedmineProjectsConfigResponse>('/admin/redmine-projects')
      setRedmineProjectsPanel({
        projects: response.data.projects || [],
        loading: false,
        saving: false,
        error: '',
        message: '',
        configured: Boolean(response.data.configured),
        updatedAt: response.data.updated_at || '',
      })
    } catch (err: any) {
      console.error('Failed to load Redmine projects config:', err)
      setRedmineProjectsPanel((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.detail || 'Failed to load Redmine projects configuration',
      }))
    }
  }

  const handleToggleRedmineProject = (projectId: number) => {
    setRedmineProjectsPanel((prev) => ({
      ...prev,
      error: '',
      message: '',
      projects: prev.projects.map((project) =>
        project.id === projectId ? { ...project, enabled: !project.enabled } : project
      ),
    }))
  }

  const handleSetAllRedmineProjects = (enabled: boolean) => {
    setRedmineProjectsPanel((prev) => ({
      ...prev,
      error: '',
      message: '',
      projects: prev.projects.map((project) => ({ ...project, enabled })),
    }))
  }

  const handleSaveRedmineProjects = async () => {
    setRedmineProjectsPanel((prev) => ({
      ...prev,
      saving: true,
      error: '',
      message: '',
    }))

    try {
      const enabledProjectIds = redmineProjectsPanel.projects
        .filter((project) => project.enabled)
        .map((project) => project.id)

      const response = await apiClient.post<RedmineProjectsConfigResponse, { data: RedmineProjectsConfigResponse }, RedmineProjectsConfigRequest>(
        '/admin/redmine-projects',
        {
          enabled_project_ids: enabledProjectIds,
        }
      )

      setRedmineProjectsPanel({
        projects: response.data.projects || [],
        loading: false,
        saving: false,
        error: '',
        message: 'Redmine project selection saved successfully.',
        configured: Boolean(response.data.configured),
        updatedAt: response.data.updated_at || '',
      })
    } catch (err: any) {
      console.error('Failed to save Redmine projects config:', err)
      setRedmineProjectsPanel((prev) => ({
        ...prev,
        saving: false,
        error: err.response?.data?.detail || 'Failed to save Redmine projects configuration',
      }))
    }
  }

  const handleSaveSourceConfig = async (tabId: SecureTabId) => {
    const panel = getSourcePanel(tabId)
    const setter = getSourceSetter(tabId)
    const isLocalCodeSource = tabId === 'code' && isLocalCodeSourcePath(panel.config.sourceUrl)
    const endpoint =
      tabId === 'code'
        ? '/admin/vegam-repository'
        : tabId === 'database'
          ? '/admin/database-source'
          : '/admin/configuration-source'
    const urlLabel =
      tabId === 'code'
        ? 'Repository URL'
        : tabId === 'database'
          ? 'Database source URL'
          : 'Configuration source URL'
    const usernameLabel =
      tabId === 'code'
        ? 'Repository username'
        : tabId === 'database'
          ? 'Database source username'
          : 'Configuration source username'
    const passwordLabel =
      tabId === 'code'
        ? 'Repository password'
        : tabId === 'database'
          ? 'Database source password'
          : 'Configuration source password'

    setter((prev) => ({ ...prev, error: '', message: '', saving: true }))

    if (!panel.config.sourceUrl.trim()) {
      setter((prev) => ({
        ...prev,
        saving: false,
        error: `${urlLabel} is required.`,
      }))
      return
    }

    if (!isLocalCodeSource && !panel.config.username.trim()) {
      setter((prev) => ({
        ...prev,
        saving: false,
        error: `${usernameLabel} is required.`,
      }))
      return
    }

    if (!isLocalCodeSource && !panel.config.password.trim() && !panel.config.passwordConfigured) {
      setter((prev) => ({
        ...prev,
        saving: false,
        error: `${passwordLabel} is required for the first save.`,
      }))
      return
    }

    try {
      if (tabId === 'code') {
        const response = await apiClient.post<RepositoryConfigResponse>(endpoint, {
          repository_url: panel.config.sourceUrl.trim(),
          username: panel.config.username.trim(),
          password: panel.config.password,
        })

        setter((prev) => ({
          ...prev,
          saving: false,
          config: normalizeRepositoryResponse(response.data),
          message: 'Active code source saved successfully.',
        }))
        return
      }

      const response = await apiClient.post<CredentialSourceConfigResponse>(endpoint, {
        source_url: panel.config.sourceUrl.trim(),
        username: panel.config.username.trim(),
        password: panel.config.password,
      })

      setter((prev) => ({
        ...prev,
        saving: false,
        config: normalizeCredentialResponse(response.data),
        message:
          tabId === 'database'
            ? 'Database source saved successfully.'
            : 'Configuration source saved successfully.',
      }))
    } catch (err: any) {
      console.error(`Failed to save ${tabId} config:`, err)
      setter((prev) => ({
        ...prev,
        saving: false,
        error:
          err.response?.data?.detail ||
          (tabId === 'database'
            ? 'Failed to save database source configuration'
            : tabId === 'configuration'
              ? 'Failed to save configuration source configuration'
              : 'Failed to save Vegam repository configuration'),
      }))
    }
  }

  const handleTestRepositoryConnection = async () => {
    const isLocalCodeSource = isLocalCodeSourcePath(repoPanel.config.sourceUrl)

    setRepoPanel((prev) => ({
      ...prev,
      testing: true,
      error: '',
      message: '',
    }))

    if (!repoPanel.config.sourceUrl.trim()) {
      setRepoPanel((prev) => ({
        ...prev,
        testing: false,
        error: 'Repository URL is required for connection testing.',
      }))
      return
    }

    if (!isLocalCodeSource && !repoPanel.config.username.trim()) {
      setRepoPanel((prev) => ({
        ...prev,
        testing: false,
        error: 'Repository username is required for connection testing.',
      }))
      return
    }

    if (!isLocalCodeSource && !repoPanel.config.password.trim() && !repoPanel.config.passwordConfigured) {
      setRepoPanel((prev) => ({
        ...prev,
        testing: false,
        error: 'Repository password is required for connection testing.',
      }))
      return
    }

    try {
      const response = await apiClient.post<RepositoryConnectionTestResponse>('/admin/vegam-repository/test', {
        repository_url: repoPanel.config.sourceUrl.trim(),
        username: repoPanel.config.username.trim(),
        password: repoPanel.config.password,
      })

      setRepoPanel((prev) => ({
        ...prev,
        testing: false,
        config: normalizeRepositoryResponse(response.data.repository),
        message: response.data.message,
      }))
    } catch (err: any) {
      console.error('Failed to test Vegam repository connection:', err)
      setRepoPanel((prev) => ({
        ...prev,
        testing: false,
        error: err.response?.data?.detail || 'Failed to test Vegam repository connection',
      }))
    }
  }

  const getSourcePanel = (tabId: SecureTabId) => {
    if (tabId === 'code') {
      return repoPanel
    }

    if (tabId === 'database') {
      return databasePanel
    }

    return configurationPanel
  }

  const getSourceSetter = (tabId: SecureTabId) => {
    if (tabId === 'code') {
      return setRepoPanel
    }

    if (tabId === 'database') {
      return setDatabasePanel
    }

    return setConfigurationPanel
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050B14] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#3B82F6]"></div>
          <p className="text-sm text-[#94A3B8]">Restoring your settings workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050B14] text-white">
      <header className="sticky top-0 z-40 border-b border-[#1E3047] bg-[#0B1220]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="rounded-lg p-2 text-[#94A3B8] transition hover:bg-[#111D2D] hover:text-white"
            >
              <LuChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Settings</h1>
              <p className="text-sm text-[#94A3B8]">Configure one source at a time with clear tabs</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#334155] bg-[#111D2D] px-4 py-2 text-right">
            <p className="text-sm font-medium text-white">{user?.full_name || user?.username}</p>
            <p className="text-xs text-[#94A3B8]">{user?.email}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-8 rounded-3xl border border-[#1E3047] bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(8,15,28,0.96))] px-6 py-6">
          <p className="text-sm leading-6 text-[#94A3B8]">
            Each configuration area is now separated into its own tab so your team can switch directly to the relevant
            source without scrolling through unrelated settings.
          </p>

          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {(Object.keys(TAB_META) as TabId[]).map((tabId) => {
                const meta = TAB_META[tabId]
                const Icon = meta.icon
                const isActive = activeTab === tabId
                const isConnected = connectedTabs[tabId]

                return (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`min-w-[270px] rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? 'border-[#3B82F6] bg-[#13233A] shadow-[0_14px_32px_rgba(37,99,235,0.18)]'
                        : 'border-[#1E3047] bg-[#0D1726]/88 hover:border-[#334155] hover:bg-[#111D2D]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-xl border px-3 py-3 ${meta.accent}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          isConnected
                            ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]'
                            : 'border-[#334155] bg-[#0B1220] text-[#94A3B8]'
                        }`}
                      >
                        {isConnected ? 'Configured' : 'Pending'}
                      </span>
                    </div>

                    <h2 className="mt-4 text-base font-semibold text-white">{meta.label}</h2>
                    <p className="mt-1 text-sm text-[#94A3B8]">{meta.helper}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {activeTab === 'code' ? (
          <SourceConfigTab
            badge="Active Code Source"
            title="Vegam Repository Connection"
            description="Configure either a live Vegam repository URL or a local Vegam code folder so this project can use actively updated source code during future investigation and code-analysis flows."
            panel={repoPanel}
            showPassword={showSourcePassword.code}
            urlLabel="Repository URL / Local Path"
            urlPlaceholder="https://git.vegam.co/your-team/vegam-repo.git or D:\\Vegam Code\\vegam4icomplete"
            usernameLabel="Username (remote Git only)"
            usernamePlaceholder="Enter repository username only for remote Git access"
            usernameRequired={false}
            passwordRequired={false}
            passwordPlaceholder={
              repoPanel.config.passwordConfigured
                ? 'Saved on server. Enter only to replace it.'
                : 'Enter repository password only for remote Git access'
            }
            passwordHelpText="For local folder mode, username and password can stay blank. For remote Git mode, the saved password is never shown again and can be replaced by entering a new one."
            statusLabel="Repository Status"
            statusMessage="This source becomes the active code base Samixa can target for future repository-driven analysis. Local folder mode does not require Git credentials."
            extraStatusRows={[
              {
                label: 'Last code sync',
                value: formatCodeSyncAt(repoPanel.config.lastSyncedAt),
              },
            ]}
            onTestConnection={() => void handleTestRepositoryConnection()}
            testConnectionBusy={repoPanel.testing}
            testConnectionLabel="Test Connection"
            onUrlChange={(value) => handleSourceFieldChange('code', 'sourceUrl', value)}
            onUsernameChange={(value) => handleSourceFieldChange('code', 'username', value)}
            onPasswordChange={(value) => handleSourceFieldChange('code', 'password', value)}
            onTogglePassword={() =>
              setShowSourcePassword((prev) => ({ ...prev, code: !prev.code }))
            }
            onReload={() => void loadRepositoryConfig()}
            onSave={() => void handleSaveSourceConfig('code')}
          />
        ) : null}

        {activeTab === 'database' ? (
          <SourceConfigTab
            badge="Database Source"
            title="Live Database Source"
            description="Store the database connection source your team wants Samixa to use later for live lookups, structured data access, and investigation support."
            panel={databasePanel}
            showPassword={showSourcePassword.database}
            urlLabel="Database URL / Connection String"
            urlPlaceholder="postgresql://host:5432/database-name"
            usernameLabel="Username"
            usernamePlaceholder="Enter database username"
            passwordPlaceholder={
              databasePanel.config.passwordConfigured
                ? 'Saved on server. Enter only to replace it.'
                : 'Enter database password'
            }
            statusLabel="Database Status"
            statusMessage="This tab is prepared for future live database access flows. For now it securely stores the source details server-side."
            onUrlChange={(value) => handleSourceFieldChange('database', 'sourceUrl', value)}
            onUsernameChange={(value) => handleSourceFieldChange('database', 'username', value)}
            onPasswordChange={(value) => handleSourceFieldChange('database', 'password', value)}
            onTogglePassword={() =>
              setShowSourcePassword((prev) => ({ ...prev, database: !prev.database }))
            }
            onReload={() => void loadDatabaseSourceConfig()}
            onSave={() => void handleSaveSourceConfig('database')}
          />
        ) : null}

        {activeTab === 'configuration' ? (
          <SourceConfigTab
            badge="Configuration Source"
            title="External Configuration Source"
            description="Configure where Samixa should look for active system configurations, deployment settings, or environment-level setup material in the future."
            panel={configurationPanel}
            showPassword={showSourcePassword.configuration}
            urlLabel="Configuration Source URL / Path"
            urlPlaceholder="https://config.vegam.co/source or \\\\server\\config-share"
            usernameLabel="Username"
            usernamePlaceholder="Enter configuration source username"
            passwordPlaceholder={
              configurationPanel.config.passwordConfigured
                ? 'Saved on server. Enter only to replace it.'
                : 'Enter configuration source password'
            }
            statusLabel="Configuration Status"
            statusMessage="This tab stores the active configuration-source details so future flows can compare runtime setup against the configured source."
            onUrlChange={(value) => handleSourceFieldChange('configuration', 'sourceUrl', value)}
            onUsernameChange={(value) => handleSourceFieldChange('configuration', 'username', value)}
            onPasswordChange={(value) => handleSourceFieldChange('configuration', 'password', value)}
            onTogglePassword={() =>
              setShowSourcePassword((prev) => ({ ...prev, configuration: !prev.configuration }))
            }
            onReload={() => void loadConfigurationSourceConfig()}
            onSave={() => void handleSaveSourceConfig('configuration')}
          />
        ) : null}

        {activeTab === 'projects' ? (
          <RedmineProjectsTab
            panel={redmineProjectsPanel}
            onReload={() => void loadRedmineProjectsConfig()}
            onSave={() => void handleSaveRedmineProjects()}
            onToggleProject={(projectId) => handleToggleRedmineProject(projectId)}
            onEnableAll={() => handleSetAllRedmineProjects(true)}
            onClearAll={() => handleSetAllRedmineProjects(false)}
          />
        ) : null}

        {activeTab === 'ai' ? (
          <section>
            <div className="mb-8 rounded-3xl border border-[#1E3047] bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(8,15,28,0.96))] px-6 py-6">
              <h2 className="text-2xl font-bold text-white">AI Provider Connections</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#94A3B8]">
                This tab is dedicated only to model/provider setup, so your team can manage provider credentials
                separately from repository, database, and configuration sources.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              {(Object.keys(SECTION_META) as SectionId[]).map((sectionId) => {
                const meta = SECTION_META[sectionId]
                const connection = connections[sectionId]
                const tone = getToneClasses(meta.tone)

                return (
                  <section
                    key={sectionId}
                    className={`rounded-3xl border bg-[#0D1726]/88 p-6 transition ${
                      connection.connected ? tone.ring : 'border-[#1E3047] shadow-[0_14px_34px_rgba(1,6,16,0.32)]'
                    }`}
                  >
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-lg font-bold ${tone.number}`}>
                          {meta.step}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{meta.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-[#94A3B8]">{meta.subtitle}</p>
                        </div>
                      </div>

                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          connection.connected
                            ? 'border-[#22C55E]/40 bg-[#22C55E]/12 text-[#86EFAC]'
                            : 'border-[#334155] bg-[#0B1220] text-[#94A3B8]'
                        }`}
                      >
                        {connection.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>

                    <div className="mb-4">
                      <label className="mb-3 block text-sm font-medium text-white">Provider</label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {PROVIDER_OPTIONS.map((provider) => {
                          const isActive = connection.provider === provider
                          const shouldBlur = connection.connected && !isActive

                          return (
                            <button
                              key={provider}
                              onClick={() => handleProviderSelect(sectionId, provider)}
                              className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                                isActive
                                  ? tone.active
                                  : 'border-[#334155] bg-[#0B1220] text-[#CBD5E1] hover:border-[#475569] hover:text-white'
                              } ${shouldBlur ? 'opacity-45 blur-[0.7px] saturate-50' : ''}`}
                            >
                              <span className="block">{provider}</span>
                              <span className="mt-1 block text-[0.7rem] font-normal text-[#94A3B8]">
                                {connection.connected && isActive ? 'Connected provider' : 'Available'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[#64748B]">
                        {meta.mode === 'api'
                          ? 'One provider should be connected in this API section. The remaining providers blur after connection.'
                          : getCredentialHelpText(sectionId)}
                      </p>
                    </div>

                    <div className="space-y-4">
                      {meta.mode === 'api' ? (
                        <>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">
                              {getApiKeyLabel(connection.provider)} <span className="text-[#F87171]">*</span>
                            </label>
                            <input
                              type="password"
                              placeholder="Enter provider API key"
                              value={connection.apiKey}
                              onChange={(event) => handleInputChange(sectionId, 'apiKey', event.target.value)}
                              className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">Base URL</label>
                            <input
                              type="text"
                              placeholder={getDefaultBaseUrl(connection.provider)}
                              value={connection.baseUrl}
                              onChange={(event) => handleInputChange(sectionId, 'baseUrl', event.target.value)}
                              className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">
                              {connection.provider === 'Azure OpenAI' ? 'Deployment / Model' : 'Model'}
                            </label>
                            <input
                              type="text"
                              placeholder={getDefaultModel(connection.provider)}
                              value={connection.model}
                              onChange={(event) => handleInputChange(sectionId, 'model', event.target.value)}
                              className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">
                              Username / Email <span className="text-[#F87171]">*</span>
                            </label>
                            <input
                              type="email"
                              placeholder={sectionId === 'common' ? 'team@company.com' : 'yourname@example.com'}
                              value={connection.username}
                              onChange={(event) => handleInputChange(sectionId, 'username', event.target.value)}
                              className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">
                              Password <span className="text-[#F87171]">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword[sectionId] ? 'text' : 'password'}
                                placeholder="Enter password"
                                value={connection.password}
                                onChange={(event) => handleInputChange(sectionId, 'password', event.target.value)}
                                className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))}
                                className="absolute right-3 top-3 text-[#94A3B8] transition hover:text-white"
                              >
                                {showPassword[sectionId] ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-white">Base URL (Optional)</label>
                            <input
                              type="text"
                              placeholder="Optional provider gateway URL"
                              value={connection.baseUrl}
                              onChange={(event) => handleInputChange(sectionId, 'baseUrl', event.target.value)}
                              className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="mb-2 block text-sm font-medium text-white">Connection Name</label>
                        <input
                          type="text"
                          placeholder={getConnectionPlaceholder(sectionId, connection.provider)}
                          value={connection.name}
                          onChange={(event) => handleInputChange(sectionId, 'name', event.target.value)}
                          className={`w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] ${tone.focus}`}
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                      <button
                        onClick={() => handleTestConnection(sectionId)}
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${tone.button}`}
                      >
                        Test Connection
                      </button>

                      <div
                        className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm ${
                          connection.connected
                            ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#86EFAC]'
                            : 'border-[#334155] bg-[#0B1220] text-[#94A3B8]'
                        }`}
                      >
                        {connection.connected ? (
                          <>
                            <LuCheck className="h-4 w-4" />
                            <span>{`${connection.provider} connected in this section`}</span>
                          </>
                        ) : (
                          <span>No provider connected in this section</span>
                        )}
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>

            {settingsFeedback ? (
              <div
                className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                  settingsFeedback.type === 'success'
                    ? 'border-[#22C55E]/30 bg-[#14532D]/20 text-[#BBF7D0]'
                    : 'border-[#EF4444]/30 bg-[#451A1A]/25 text-[#FECACA]'
                }`}
              >
                {settingsFeedback.message}
              </div>
            ) : null}

            <div className="mt-8 flex justify-end gap-4 border-t border-[#1E3047] pt-8">
              <button
                onClick={handleBack}
                className="rounded-xl border border-[#334155] bg-[#111D2D] px-6 py-3 text-sm font-medium text-white transition hover:border-[#475569] hover:bg-[#172236]"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveSettings()}
                className="rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#3B82F6]"
              >
                Save AI Settings
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

function RedmineProjectsTab(props: {
  panel: RedmineProjectsPanelState
  onReload: () => void
  onSave: () => void
  onToggleProject: (projectId: number) => void
  onEnableAll: () => void
  onClearAll: () => void
}) {
  const enabledCount = props.panel.projects.filter((project) => project.enabled).length
  const sortedProjects = useMemo(
    () =>
      [...props.panel.projects].sort((leftProject, rightProject) => {
        if (leftProject.enabled !== rightProject.enabled) {
          return leftProject.enabled ? -1 : 1
        }

        return leftProject.name.localeCompare(rightProject.name, undefined, { sensitivity: 'base' })
      }),
    [props.panel.projects]
  )
  const enabledProjects = useMemo(
    () => sortedProjects.filter((project) => project.enabled),
    [sortedProjects]
  )
  const disabledProjects = useMemo(
    () => sortedProjects.filter((project) => !project.enabled),
    [sortedProjects]
  )

  return (
    <section className="rounded-3xl border border-[#1E3047] bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(8,15,28,0.96))] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#06B6D4]/30 bg-[#06B6D4]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#CFFAFE]">
            Redmine Projects
          </div>
          <h2 className="mt-4 text-2xl font-bold text-white">Project Visibility Control</h2>
          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
            Only the checked Redmine projects will be considered in ticket loading, team rows, and related investigation flows.
            The list below is scrollable so your team can manage many projects in one place.
          </p>
        </div>

        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            props.panel.configured
              ? 'border-[#22C55E]/40 bg-[#22C55E]/12 text-[#86EFAC]'
              : 'border-[#334155] bg-[#0B1220] text-[#94A3B8]'
          }`}
        >
          {props.panel.configured ? 'Configured' : 'Using Default List'}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <section className="rounded-3xl border border-[#1E3047] bg-[#0D1726]/88 p-6 shadow-[0_14px_34px_rgba(1,6,16,0.32)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Available Redmine Projects</h3>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Enabled: {enabledCount} of {props.panel.projects.length}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={props.onEnableAll}
                className="rounded-xl border border-[#334155] bg-[#111D2D] px-3 py-2 text-xs font-semibold text-white transition hover:border-[#475569] hover:bg-[#172236]"
              >
                Enable All
              </button>
              <button
                onClick={props.onClearAll}
                className="rounded-xl border border-[#334155] bg-[#111D2D] px-3 py-2 text-xs font-semibold text-white transition hover:border-[#475569] hover:bg-[#172236]"
              >
                Clear All
              </button>
            </div>
          </div>

          {props.panel.error ? (
            <div className="mt-4 rounded-2xl border border-[#EF4444]/30 bg-[#451A1A]/25 px-4 py-3 text-sm text-[#FECACA]">
              {props.panel.error}
            </div>
          ) : null}

          {props.panel.message ? (
            <div className="mt-4 rounded-2xl border border-[#22C55E]/30 bg-[#14532D]/20 px-4 py-3 text-sm text-[#BBF7D0]">
              {props.panel.message}
            </div>
          ) : null}

          {props.panel.loading ? (
            <div className="mt-6 rounded-2xl border border-[#1E3047] bg-[#0B1220] px-4 py-10 text-center text-sm text-[#94A3B8]">
              Loading Redmine projects...
            </div>
          ) : (
            <div className="mt-6 max-h-[560px] overflow-y-auto pr-2">
              <div className="space-y-3">
                {enabledProjects.length ? (
                  <>
                    <div className="rounded-2xl border border-[#22C55E]/20 bg-[#14532D]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#86EFAC]">
                      Enabled Projects
                    </div>
                    {enabledProjects.map((project) => (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#1E3047] bg-[#0B1220] px-4 py-3 transition hover:border-[#334155] hover:bg-[#111D2D]"
                      >
                        <input
                          type="checkbox"
                          checked={project.enabled}
                          onChange={() => props.onToggleProject(project.id)}
                          className="mt-1 h-4 w-4 rounded border-[#334155] bg-[#0B1220] text-[#2563EB] focus:ring-[#3B82F6]"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{project.name}</p>
                          <p className="mt-1 text-xs text-[#94A3B8]">
                            Identifier: {project.identifier || `project-${project.id}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </>
                ) : null}

                {disabledProjects.length ? (
                  <>
                    <div className="rounded-2xl border border-[#334155] bg-[#0B1220] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
                      Disabled Projects
                    </div>
                    {disabledProjects.map((project) => (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#1E3047] bg-[#0B1220] px-4 py-3 transition hover:border-[#334155] hover:bg-[#111D2D]"
                      >
                        <input
                          type="checkbox"
                          checked={project.enabled}
                          onChange={() => props.onToggleProject(project.id)}
                          className="mt-1 h-4 w-4 rounded border-[#334155] bg-[#0B1220] text-[#2563EB] focus:ring-[#3B82F6]"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{project.name}</p>
                          <p className="mt-1 text-xs text-[#94A3B8]">
                            Identifier: {project.identifier || `project-${project.id}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </>
                ) : null}

                {!props.panel.projects.length ? (
                  <div className="rounded-2xl border border-[#1E3047] bg-[#0B1220] px-4 py-8 text-center text-sm text-[#94A3B8]">
                    No Redmine projects were returned from the server.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={props.onSave}
              disabled={props.panel.loading || props.panel.saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LuSave className="h-4 w-4" />
              {props.panel.saving ? 'Saving...' : 'Save Project Selection'}
            </button>
            <button
              onClick={props.onReload}
              disabled={props.panel.loading || props.panel.saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#334155] bg-[#111D2D] px-4 py-3 text-sm font-medium text-white transition hover:border-[#475569] hover:bg-[#172236] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LuRefreshCw className="h-4 w-4" />
              Reload
            </button>
          </div>
        </section>

        <aside className="rounded-3xl border border-[#1E3047] bg-[#0D1726]/88 p-6 shadow-[0_14px_34px_rgba(1,6,16,0.32)]">
          <h3 className="text-lg font-semibold text-white">Project Filter Status</h3>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-[#24364E] bg-[#0B1220] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748B]">Total Projects</p>
              <p className="mt-2 text-lg font-semibold text-white">{props.panel.projects.length}</p>
            </div>

            <div className="rounded-2xl border border-[#24364E] bg-[#0B1220] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748B]">Enabled Projects</p>
              <p className="mt-2 text-lg font-semibold text-white">{enabledCount}</p>
            </div>

            <div className="rounded-2xl border border-[#24364E] bg-[#0B1220] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748B]">Last Updated</p>
              <p className="mt-2 text-sm font-medium text-white">{formatSavedAt(props.panel.updatedAt)}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#24364E] bg-[#101A2A] px-4 py-4 text-sm leading-7 text-[#94A3B8]">
            If you do not save a custom selection yet, the system will continue using the current default allowed-project list.
          </div>
        </aside>
      </div>
    </section>
  )
}

function SourceConfigTab(props: {
  badge: string
  title: string
  description: string
  panel: SourcePanelState
  showPassword: boolean
  urlLabel: string
  urlPlaceholder: string
  usernameLabel: string
  usernamePlaceholder: string
  passwordPlaceholder: string
  usernameRequired?: boolean
  passwordRequired?: boolean
  passwordHelpText?: string
  statusLabel: string
  statusMessage: string
  extraStatusRows?: Array<{ label: string; value: string }>
  onTestConnection?: () => void
  testConnectionBusy?: boolean
  testConnectionLabel?: string
  onUrlChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onReload: () => void
  onSave: () => void
}) {
  return (
    <section className="rounded-3xl border border-[#1E3047] bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(8,15,28,0.96))] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#BFDBFE]">
            {props.badge}
          </div>
          <h2 className="mt-4 text-2xl font-bold text-white">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">{props.description}</p>
        </div>

        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            props.panel.config.connected
              ? 'border-[#22C55E]/40 bg-[#22C55E]/12 text-[#86EFAC]'
              : 'border-[#334155] bg-[#0B1220] text-[#94A3B8]'
          }`}
        >
          {props.panel.config.connected ? 'Configured' : 'Not Configured'}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <section className="rounded-3xl border border-[#1E3047] bg-[#0D1726]/88 p-6 shadow-[0_14px_34px_rgba(1,6,16,0.32)]">
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                {props.urlLabel} <span className="text-[#F87171]">*</span>
              </label>
              <input
                type="text"
                placeholder={props.urlPlaceholder}
                value={props.panel.config.sourceUrl}
                onChange={(event) => props.onUrlChange(event.target.value)}
                className="w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] focus:border-[#3B82F6]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                {props.usernameLabel} {props.usernameRequired === false ? null : <span className="text-[#F87171]">*</span>}
              </label>
              <input
                type="text"
                placeholder={props.usernamePlaceholder}
                value={props.panel.config.username}
                onChange={(event) => props.onUsernameChange(event.target.value)}
                className="w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#64748B] focus:border-[#3B82F6]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Password {props.passwordRequired === false ? null : <span className="text-[#F87171]">*</span>}
              </label>
              <div className="relative">
                <input
                  type={props.showPassword ? 'text' : 'password'}
                  placeholder={props.passwordPlaceholder}
                  value={props.panel.config.password}
                  onChange={(event) => props.onPasswordChange(event.target.value)}
                  className="w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-[#64748B] focus:border-[#3B82F6]"
                />
                <button
                  type="button"
                  onClick={props.onTogglePassword}
                  className="absolute right-3 top-3 text-[#94A3B8] transition hover:text-white"
                >
                  {props.showPassword ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                {props.passwordHelpText || 'For safety, the saved password is never shown again. Leave it blank when you want to keep the existing server-side password.'}
              </p>
            </div>
          </div>

          {props.panel.error ? (
            <div className="mt-5 rounded-2xl border border-[#EF4444]/30 bg-[#7F1D1D]/20 px-4 py-3 text-sm text-[#FECACA]">
              {props.panel.error}
            </div>
          ) : null}

          {props.panel.message ? (
            <div className="mt-5 rounded-2xl border border-[#22C55E]/30 bg-[#14532D]/20 px-4 py-3 text-sm text-[#BBF7D0]">
              {props.panel.message}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={props.onSave}
              disabled={props.panel.saving || props.panel.loading || props.panel.testing}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {props.panel.saving ? <LuRefreshCw className="h-4 w-4 animate-spin" /> : <LuSave className="h-4 w-4" />}
              {props.panel.saving ? 'Saving...' : 'Save Configuration'}
            </button>

            {props.onTestConnection ? (
              <button
                onClick={props.onTestConnection}
                disabled={props.panel.loading || props.panel.saving || props.testConnectionBusy}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#22C55E]/35 bg-[#0F2B1F] px-5 py-3 text-sm font-semibold text-[#BBF7D0] transition hover:border-[#22C55E]/55 hover:bg-[#123523] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LuCheck className={`h-4 w-4 ${props.testConnectionBusy ? 'animate-pulse' : ''}`} />
                {props.testConnectionBusy ? 'Testing...' : props.testConnectionLabel || 'Test Connection'}
              </button>
            ) : null}

            <button
              onClick={props.onReload}
              disabled={props.panel.loading || props.panel.saving || props.panel.testing}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#334155] bg-[#111D2D] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#475569] hover:bg-[#172236] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LuRefreshCw className={`h-4 w-4 ${props.panel.loading ? 'animate-spin' : ''}`} />
              Reload
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-[#1E3047] bg-[#0D1726]/88 p-6 shadow-[0_14px_34px_rgba(1,6,16,0.32)]">
          <h3 className="text-lg font-semibold text-white">{props.statusLabel}</h3>
          <div className="mt-5 space-y-4">
            <StatusRow label={props.urlLabel} value={props.panel.config.sourceUrl || 'Not configured yet'} />
            <StatusRow label={props.usernameLabel} value={props.panel.config.username || 'Not configured yet'} />
            <StatusRow
              label="Password"
              value={props.panel.config.passwordConfigured ? 'Saved on server' : 'Not configured yet'}
            />
            <StatusRow label="Last updated" value={formatSavedAt(props.panel.config.updatedAt)} />
            {props.extraStatusRows?.map((row) => (
              <StatusRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[#1E3047] bg-[#0B1220] p-4 text-sm leading-6 text-[#94A3B8]">
            {props.statusMessage}
          </div>
        </section>
      </div>
    </section>
  )
}

function StatusRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1E3047] bg-[#0B1220] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">{props.label}</p>
      <p className="mt-1 break-words text-sm text-white">{props.value}</p>
    </div>
  )
}
