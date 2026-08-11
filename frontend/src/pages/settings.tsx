import React, { useState } from 'react'
import { LuChevronLeft, LuEye, LuEyeOff } from 'react-icons/lu'
import { useRouter } from 'next/router'

export default function SettingsPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState({
    openai: false,
    claude: false,
    chatgpt: false
  })

  const [providers, setProviders] = useState({
    openai: {
      type: 'OpenAI (ChatGPT)',
      connected: false,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      name: 'OpenAI - Production'
    },
    claude: {
      type: 'Anthropic (Claude)',
      connected: false,
      username: '',
      password: '',
      baseUrl: 'https://api.anthropic.com',
      name: 'Claude - Enterprise'
    },
    chatgpt: {
      type: 'ChatGPT (Web)',
      connected: false,
      username: '',
      password: '',
      name: 'ChatGPT - Personal Account'
    }
  })

  const handleInputChange = (provider: string, field: string, value: string) => {
    setProviders(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider as keyof typeof providers],
        [field]: value
      }
    }))
  }

  const handleTestConnection = (provider: string) => {
    // Simulate connection test
    setProviders(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider as keyof typeof providers],
        connected: true
      }
    }))
  }

  const handleSaveSettings = () => {
    // Save settings to localStorage
    localStorage.setItem('ai_providers', JSON.stringify(providers))
    alert('Settings saved successfully!')
    router.push('/investigation/90857')
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <button
            onClick={() => router.back()}
            className="rounded-lg hover:bg-slate-800 p-2 transition"
          >
            <LuChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-slate-400">Configure AI providers and system settings</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* AI Provider Connections Section */}
        <section className="mb-12">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">AI Provider Connections</h2>
            <p className="text-slate-400">Configure and manage your AI provider connections. Choose the connection type that best suits your needs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* OpenAI Connection */}
            <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/50 hover:bg-slate-800/70 transition">
              <div className="flex items-start gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500">
                  <span className="text-blue-400 font-bold text-lg">1</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold">Connect AI with API</h3>
                  <p className="text-xs text-slate-400 mt-1">Recommended</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Provider</label>
                  <select
                    value="openai"
                    onChange={(e) => handleInputChange('openai', 'type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option>OpenAI (ChatGPT)</option>
                    <option>Azure OpenAI</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    API Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={providers.openai.apiKey}
                    onChange={(e) => handleInputChange('openai', 'apiKey', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Base URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={providers.openai.baseUrl}
                    onChange={(e) => handleInputChange('openai', 'baseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Model</label>
                  <select
                    value={providers.openai.model}
                    onChange={(e) => handleInputChange('openai', 'model', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option>gpt-4o</option>
                    <option>gpt-4-turbo</option>
                    <option>gpt-4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="OpenAI - Production"
                    value={providers.openai.name}
                    onChange={(e) => handleInputChange('openai', 'name', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={() => handleTestConnection('openai')}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  <span>⚡</span> Test Connection
                </button>

                <div className={`text-xs text-center py-2 rounded ${providers.openai.connected ? 'text-green-400 bg-green-900/20' : 'text-slate-500'}`}>
                  {providers.openai.connected ? '✓ Connected' : '○ Not Connected'}
                </div>
              </div>
            </div>

            {/* Anthropic Claude Connection */}
            <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/50 hover:bg-slate-800/70 transition">
              <div className="flex items-start gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500">
                  <span className="text-purple-400 font-bold text-lg">2</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold">Connect with Common AI</h3>
                  <p className="text-xs text-slate-400 mt-1">For common AI platforms</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Provider</label>
                  <select
                    value="claude"
                    onChange={(e) => handleInputChange('claude', 'type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option>Anthropic (Claude)</option>
                    <option>Cohere</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Username / Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="company@yourcompany.com"
                    value={providers.claude.username}
                    onChange={(e) => handleInputChange('claude', 'username', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword.claude ? 'text' : 'password'}
                      placeholder="••••••••••"
                      value={providers.claude.password}
                      onChange={(e) => handleInputChange('claude', 'password', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => setShowPassword(prev => ({ ...prev, claude: !prev.claude }))}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showPassword.claude ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Base URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="https://api.anthropic.com"
                    value={providers.claude.baseUrl}
                    onChange={(e) => handleInputChange('claude', 'baseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="Claude - Enterprise"
                    value={providers.claude.name}
                    onChange={(e) => handleInputChange('claude', 'name', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={() => handleTestConnection('claude')}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  <span>⚡</span> Test Connection
                </button>

                <div className={`text-xs text-center py-2 rounded ${providers.claude.connected ? 'text-green-400 bg-green-900/20' : 'text-slate-500'}`}>
                  {providers.claude.connected ? '✓ Connected' : '○ Not Connected'}
                </div>
              </div>
            </div>

            {/* ChatGPT Web Connection */}
            <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/50 hover:bg-slate-800/70 transition">
              <div className="flex items-start gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-600/20 border border-green-500">
                  <span className="text-green-400 font-bold text-lg">3</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold">Connect with Personal AI</h3>
                  <p className="text-xs text-slate-400 mt-1">Account credentials</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Provider</label>
                  <select
                    value="chatgpt"
                    onChange={(e) => handleInputChange('chatgpt', 'type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  >
                    <option>ChatGPT (Web)</option>
                    <option>Claude (Web)</option>
                    <option>Gemini (Web)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Username / Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="testuser@gmail.com"
                    value={providers.chatgpt.username}
                    onChange={(e) => handleInputChange('chatgpt', 'username', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword.chatgpt ? 'text' : 'password'}
                      placeholder="••••••••••"
                      value={providers.chatgpt.password}
                      onChange={(e) => handleInputChange('chatgpt', 'password', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    />
                    <button
                      onClick={() => setShowPassword(prev => ({ ...prev, chatgpt: !prev.chatgpt }))}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showPassword.chatgpt ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="ChatGPT - Personal Account"
                    value={providers.chatgpt.name}
                    onChange={(e) => handleInputChange('chatgpt', 'name', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="pt-2"></div>

                <button
                  onClick={() => handleTestConnection('chatgpt')}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  <span>⚡</span> Test Connection
                </button>

                <div className={`text-xs text-center py-2 rounded ${providers.chatgpt.connected ? 'text-green-400 bg-green-900/20' : 'text-slate-500'}`}>
                  {providers.chatgpt.connected ? '✓ Connected' : '○ Not Connected'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end pt-8 border-t border-slate-700">
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveSettings}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Save Settings
          </button>
        </div>
      </main>
    </div>
  )
}
