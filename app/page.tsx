'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Account = { id: string; name: string }
type InventoryRow = { id: string; account_id: string; pet_name: string; quantity: number; account_name?: string }

function parseBulkText(text: string): { pet_name: string; quantity: number }[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\d+)x\s+(.+)$/i)
      if (!match) return null
      const qty = parseInt(match[1])
      const name = match[2].replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase()
      return { pet_name: name, quantity: qty }
    })
    .filter(Boolean) as { pet_name: string; quantity: number }[]
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-3 sm:p-4 flex flex-col gap-1">
      <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-xl sm:text-2xl font-bold text-white">{value}</span>
    </div>
  )
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [search, setSearch] = useState('')
  const [newAccount, setNewAccount] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkMode, setBulkMode] = useState<'single' | 'bulk' | 'replace'>('single')
  const [singlePet, setSinglePet] = useState('')
  const [singleQty, setSingleQty] = useState(1)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [cardSearch, setCardSearch] = useState<Record<string, string>>({})
  const [initializing, setInitializing] = useState(true)

  async function fetchAll() {
    const { data: accs } = await supabase.from('accounts').select('*').order('name')
    const { data: inv } = await supabase.from('inventory').select('*, accounts(name)').order('pet_name')
    setAccounts(accs || [])
    setInventory((inv || []).map((r: any) => ({ ...r, account_name: r.accounts?.name })))
    setInitializing(false)
  }

  useEffect(() => { fetchAll() }, [])

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function addAccount() {
    const name = newAccount.trim()
    if (!name) return
    const { error } = await supabase.from('accounts').insert({ name })
    if (error) return flash('Account already exists', 'error')
    setNewAccount('')
    flash('Account added!')
    fetchAll()
  }

  async function upsertPet(account_id: string, pet_name: string, quantity: number) {
    if (quantity < 0) quantity = 0
    const existing = inventory.find(i => i.account_id === account_id && i.pet_name === pet_name)
    if (existing) {
      await supabase.from('inventory').update({ quantity }).eq('id', existing.id)
    } else {
      await supabase.from('inventory').insert({ account_id, pet_name, quantity })
    }
  }

  async function addSinglePet() {
    if (!selectedAccount || !singlePet.trim()) return flash('Select account and enter pet name', 'error')
    setLoading(true)
    const name = singlePet.trim().toUpperCase()
    const existing = inventory.find(i => i.account_id === selectedAccount && i.pet_name === name)
    await upsertPet(selectedAccount, name, (existing?.quantity || 0) + singleQty)
    setSinglePet('')
    setSingleQty(1)
    flash('Pet added!')
    setLoading(false)
    fetchAll()
  }

  async function addBulkPets() {
    if (!selectedAccount) return flash('Select an account first', 'error')
    const parsed = parseBulkText(bulkText)
    if (!parsed.length) return flash('No valid lines found. Format: 2X PET NAME', 'error')
    setLoading(true)
    for (const { pet_name, quantity } of parsed) {
      const existing = inventory.find(i => i.account_id === selectedAccount && i.pet_name === pet_name)
      await upsertPet(selectedAccount, pet_name, (existing?.quantity || 0) + quantity)
    }
    setBulkText('')
    flash(`${parsed.length} pet(s) added!`)
    setLoading(false)
    fetchAll()
  }

  async function replaceAllStock() {
    if (!selectedAccount) return flash('Select an account first', 'error')
    const parsed = parseBulkText(bulkText)
    if (!parsed.length) return flash('No valid lines found. Format: 2X PET NAME', 'error')
    if (!confirm('This will delete all current pets in this account and replace with the new list. Continue?')) return
    setLoading(true)
    await supabase.from('inventory').delete().eq('account_id', selectedAccount)
    for (const { pet_name, quantity } of parsed) {
      await supabase.from('inventory').insert({ account_id: selectedAccount, pet_name, quantity })
    }
    setBulkText('')
    flash(`Stock replaced with ${parsed.length} pet(s)!`)
    setLoading(false)
    fetchAll()
  }

  async function deleteAccount(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its pets?`)) return
    await supabase.from('accounts').delete().eq('id', id)
    if (selectedAccount === id) setSelectedAccount('')
    flash('Account deleted!')
    fetchAll()
  }

  async function adjustQty(row: InventoryRow, delta: number) {
    await supabase.from('inventory').update({ quantity: Math.max(0, row.quantity + delta) }).eq('id', row.id)
    fetchAll()
  }

  const totalPets = inventory.reduce((s, r) => s + r.quantity, 0)
  const uniquePets = new Set(inventory.map(r => r.pet_name)).size

  const filtered = search.trim()
    ? inventory.filter(i => i.pet_name.toLowerCase().includes(search.toLowerCase()))
    : []

  const grouped = filtered.reduce<Record<string, InventoryRow[]>>((acc, row) => {
    if (!acc[row.pet_name]) acc[row.pet_name] = []
    acc[row.pet_name].push(row)
    return acc
  }, {})

  const inputCls = "w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
  const btnPrimary = "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"

  if (initializing) return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-4">
      <span className="text-4xl animate-bounce">🐾</span>
      <p className="text-white font-bold tracking-tight">Adopt Me Inventory</p>
      <p className="text-slate-500 text-xs">by Lyx</p>
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      {/* Topbar */}
      <div className="border-b border-[#1e2130] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐾</span>
          <span className="font-bold text-white tracking-tight text-sm sm:text-base">AdoptMe Inventory</span>
        </div>
        <span className="text-xs text-slate-600 hidden sm:block">by Lyx</span>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-5 sm:w-auto z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard label="Accounts" value={accounts.length} />
          <StatCard label="Unique Pets" value={uniquePets} />
          <StatCard label="Total Pets" value={totalPets} />
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            className="w-full bg-[#1a1d27] border border-[#2a2d3e] rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Search any pet across all accounts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Search Results */}
        {search.trim() && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Search Results</p>
            {Object.keys(grouped).length === 0 ? (
              <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-6 text-center text-slate-500 text-sm">No pets found for "{search}"</div>
            ) : (
              Object.entries(grouped).map(([petName, rows]) => {
                const total = rows.reduce((s, r) => s + r.quantity, 0)
                return (
                  <div key={petName} className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl overflow-hidden">
                    <div className="flex justify-between items-center px-5 py-3 border-b border-[#2a2d3e]">
                      <span className="font-semibold text-white">{petName}</span>
                      <span className="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                        {total} total
                      </span>
                    </div>
                    {rows.map(row => (
                      <div key={row.id} className="flex items-center justify-between px-5 py-2.5 border-b border-[#1e2130] last:border-0">
                        <span className="text-sm text-slate-400">{row.account_name}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => adjustQty(row, -1)} className="w-7 h-7 bg-[#2a2d3e] hover:bg-red-600/80 rounded-lg text-white text-sm font-bold transition-colors">−</button>
                          <span className="w-8 text-center font-mono text-sm text-white">{row.quantity}</span>
                          <button onClick={() => adjustQty(row, 1)} className="w-7 h-7 bg-[#2a2d3e] hover:bg-emerald-600/80 rounded-lg text-white text-sm font-bold transition-colors">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Add Account + Add Pets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Add Account */}
          <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-5 space-y-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Add Account</p>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Account name"
                value={newAccount}
                onChange={e => setNewAccount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAccount()}
              />
              <button onClick={addAccount} className={btnPrimary}>Add</button>
            </div>
            {accounts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {accounts.map(a => (
                  <div key={a.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 bg-[#0f1117] border border-[#2a2d3e] rounded-lg">
                    <span className="text-xs text-slate-400">{a.name}</span>
                    <button onClick={() => deleteAccount(a.id, a.name)} className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors text-xs leading-none">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Pets */}
          <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-widest">Add Pets</p>
              <div className="flex bg-[#0f1117] border border-[#2a2d3e] rounded-lg p-0.5 text-xs">
                <button onClick={() => setBulkMode('single')} className={`px-3 py-1 rounded-md transition-colors ${bulkMode === 'single' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>Single</button>
                <button onClick={() => setBulkMode('bulk')} className={`px-3 py-1 rounded-md transition-colors ${bulkMode === 'bulk' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>Bulk</button>
                <button onClick={() => setBulkMode('replace')} className={`px-3 py-1 rounded-md transition-colors ${bulkMode === 'replace' ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-white'}`}>Replace</button>
              </div>
            </div>

            <select
              className={inputCls + ' appearance-none'}
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
            >
              <option value="">— Select Account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {bulkMode === 'single' ? (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="Pet name (e.g. FR DRAGON)"
                  value={singlePet}
                  onChange={e => setSinglePet(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSinglePet()}
                />
                <input
                  type="number" min={1}
                  className="w-16 bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-2 text-sm text-center text-white focus:outline-none focus:border-indigo-500"
                  value={singleQty}
                  onChange={e => setSingleQty(parseInt(e.target.value) || 1)}
                />
                <button onClick={addSinglePet} disabled={loading} className={btnPrimary}>Add</button>
              </div>
            ) : bulkMode === 'bulk' ? (
              <div className="space-y-2">
                <textarea
                  className={inputCls + ' h-32 resize-none font-mono'}
                  placeholder={"2X EMPEROR GORILLA\n1X NFR FROST FURY\n4X FR KANGAROO"}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                />
                <button onClick={addBulkPets} disabled={loading} className={btnPrimary + ' w-full'}>
                  {loading ? 'Adding...' : 'Add Bulk Pets'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orange-400/80">⚠ This will delete all current pets in the selected account and replace with the list below.</p>
                <textarea
                  className={inputCls + ' h-32 resize-none font-mono border-orange-500/40 focus:border-orange-500'}
                  placeholder={"2X EMPEROR GORILLA\n1X NFR FROST FURY\n4X FR KANGAROO"}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                />
                <button onClick={replaceAllStock} disabled={loading} className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer">
                  {loading ? 'Replacing...' : 'Replace All Stock'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inventory by Account */}
        {!search.trim() && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest">All Inventory</p>
            {accounts.length === 0 && (
              <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-8 text-center text-slate-500 text-sm">
                No accounts yet — add one above to get started.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => {
              const pets = inventory.filter(i => i.account_id === account.id)
              const total = pets.reduce((s, p) => s + p.quantity, 0)
              return (
                <div key={account.id} className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl overflow-hidden">
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2d3e]">
                    <span className="text-sm font-semibold text-white truncate max-w-[120px]">{account.name}</span>
                    <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                      <span className="hidden sm:inline">{pets.length} types</span>
                      <span className="text-indigo-400 font-mono font-semibold">{total}</span>
                      <button onClick={() => deleteAccount(account.id, account.name)} className="px-2 py-1 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete</button>
                    </div>
                  </div>
                  {/* Per-card search */}
                  <div className="px-4 py-2 border-b border-[#2a2d3e]">
                    <input
                      className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Search pet..."
                      value={cardSearch[account.id] || ''}
                      onChange={e => setCardSearch(prev => ({ ...prev, [account.id]: e.target.value }))}
                    />
                  </div>
                  {pets.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-slate-600">No pets yet.</div>
                  ) : (
                    <div className="overflow-y-auto max-h-64 sm:max-h-72 p-3 sm:p-5">
                      <div className="grid grid-cols-2 gap-3">
                        {pets.filter(row => row.pet_name.toLowerCase().includes((cardSearch[account.id] || '').toLowerCase())).map(row => (
                          <div key={row.id} className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg p-3 flex flex-col gap-3 min-h-[90px]">
                            <span className="text-xs text-slate-300 font-medium leading-snug break-words">{row.pet_name}</span>
                            <div className="flex items-center justify-between mt-auto pt-1 border-t border-[#2a2d3e]">
                              <button onClick={() => adjustQty(row, -1)} className="w-7 h-7 bg-[#1a1d27] hover:bg-red-600/70 border border-[#2a2d3e] rounded-md text-white font-bold text-sm transition-colors">−</button>
                              <span className="font-mono text-white text-sm">{row.quantity}</span>
                              <button onClick={() => adjustQty(row, 1)} className="w-7 h-7 bg-[#1a1d27] hover:bg-emerald-600/70 border border-[#2a2d3e] rounded-md text-white font-bold text-sm transition-colors">+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
