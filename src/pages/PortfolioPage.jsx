import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Upload, Trash2, Edit3, X, Check, Image as ImageIcon, Lock, Heart } from 'lucide-react'

export default function PortfolioPage() {
  const { company, getLimit } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [showUpgradePopup, setShowUpgradePopup] = useState(false)
  const fileInputRef = useRef()

  const plan = company?.plan || 'free'
  const rawLimit = getLimit ? getLimit('portfolio_photos') : 3
  const isUnlimited = rawLimit >= 999
  const limit = isUnlimited ? Infinity : (rawLimit || 0)
  const isAtLimit = items.length >= limit
  const remaining = isUnlimited ? '∞' : Math.max(0, limit - items.length)
  const limitLabel = isUnlimited ? '∞' : limit

  useEffect(() => { if (company) fetchPortfolio() }, [company])

  async function fetchPortfolio() {
    try {
      const { data } = await supabase.from('portfolio_items').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
      setItems(data || [])
    } catch (e) { toast.error('Could not load portfolio') } finally { setLoading(false) }
  }

  async function uploadFiles(files) {
    if (!files || files.length === 0) return
    if (isAtLimit) { setShowUpgradePopup(true); return }
    const validFiles = Array.from(files).filter(f => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return false }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is too large (max 5MB)`); return false }
      return true
    })
    if (validFiles.length === 0) return
    const slotsLeft = isUnlimited ? validFiles.length : limit - items.length
    const filesToUpload = validFiles.slice(0, slotsLeft)
    if (filesToUpload.length < validFiles.length) toast.error(`Only ${slotsLeft} slot${slotsLeft !== 1 ? 's' : ''} remaining — uploading first ${filesToUpload.length}`)
    setUploading(true)
    let successCount = 0
    for (const file of filesToUpload) {
      try {
        const ext = file.name.split('.').pop()
        const path = `portfolio/${company.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('company-assets').upload(path, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
        await supabase.from('portfolio_items').insert({ company_id: company.id, image_url: publicUrl, storage_path: path, title: file.name.replace(/\.[^.]+$/, ''), created_at: new Date().toISOString() })
        successCount++
      } catch (e) { toast.error(`Failed to upload ${file.name}`) }
    }
    if (successCount > 0) { toast.success(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded!`); await fetchPortfolio() }
    setUploading(false)
  }

  async function deleteItem(item) {
    try {
      if (item.storage_path) await supabase.storage.from('company-assets').remove([item.storage_path])
      await supabase.from('portfolio_items').delete().eq('id', item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Photo deleted')
    } catch (e) { toast.error('Could not delete photo') }
  }

  async function saveEdit(item) {
    try {
      await supabase.from('portfolio_items').update({ title: editTitle, description: editDesc }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: editTitle, description: editDesc } : i))
      setEditingId(null)
      toast.success('Updated!')
    } catch (e) { toast.error('Could not update') }
  }

  function onDrop(e) { e.preventDefault(); setDragging(false); if (isAtLimit) { setShowUpgradePopup(true); return } uploadFiles(e.dataTransfer.files) }
  function handleUploadClick() { if (isAtLimit) { setShowUpgradePopup(true); return } fileInputRef.current?.click() }

  return (
    <div className="page-content animate-in">
      {/* SAARA CSS YAHIN — external pe depend nahi */}
      <style>{`
        .pf-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .pf-card { background:var(--card-bg,#fff); border:1px solid var(--card-border,#e2e8f0); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; transition:transform .15s, box-shadow .15s; }
        .pf-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(0,0,0,0.10); }
        .pf-thumb { position:relative; width:100%; aspect-ratio:1/1; overflow:hidden; background:var(--bg2,#f1f5f9); }
        .pf-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
        .pf-card:hover .pf-thumb img { transform:scale(1.05); }
        .pf-actions { position:absolute; top:8px; right:8px; display:flex; gap:6px; opacity:0; transition:opacity .15s; }
        .pf-card:hover .pf-actions { opacity:1; }
        .pf-actions button { width:30px; height:30px; border-radius:8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.95); color:#111; box-shadow:0 2px 8px rgba(0,0,0,0.2); }
        .pf-actions button.danger { background:rgba(239,68,68,0.95); color:#fff; }
        .pf-body { padding:11px 13px; display:flex; flex-direction:column; gap:4px; }
        .pf-title { font-size:13.5px; font-weight:600; color:var(--text,#0f172a); line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pf-desc { font-size:12px; color:var(--text3,#94a3b8); line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:34px; }
        .pf-meta { display:flex; align-items:center; gap:5px; margin-top:2px; font-size:12.5px; color:var(--text3,#94a3b8); font-weight:500; }
        @media (max-width:1024px){ .pf-grid{ grid-template-columns:repeat(3,1fr); } }
        @media (max-width:640px){ .pf-grid{ grid-template-columns:repeat(2,1fr); gap:10px; } }
        .pf-upload { border:1.5px dashed var(--border2,#cbd5e1); border-radius:12px; padding:26px 20px; text-align:center; background:var(--card-bg,#fff); }
        .pf-upload.drag { border-color:#e8b84b; background:#fffbeb; }
      `}</style>

      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Portfolio</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Showcase your best work to attract more clients</p>
        </div>
        <div style={{ background: isAtLimit ? '#fef2f2' : '#fffbeb', border: `1px solid ${isAtLimit ? '#fecaca' : '#fcd34d'}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, color: isAtLimit ? '#ef4444' : '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ImageIcon size={12} />
          {items.length} / {limitLabel} photos
          {isAtLimit && <span style={{ fontWeight: 600 }}>· Limit reached</span>}
        </div>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '10px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8b84b' }} />
          <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600, textTransform: 'capitalize' }}>{plan} Plan: {limitLabel} photos</span>
        </div>
        {!isAtLimit
          ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{remaining} slot{remaining !== 1 && remaining !== '∞' ? 's' : ''} remaining</span>
          : <button onClick={() => setShowUpgradePopup(true)} style={{ fontSize: 12, color: '#d97706', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Upgrade Plan →</button>}
      </div>

      <div className={`pf-upload ${dragging ? 'drag' : ''}`} style={{ marginBottom: 22, opacity: isAtLimit ? 0.6 : 1, cursor: isAtLimit ? 'not-allowed' : 'pointer' }}
        onClick={handleUploadClick} onDragOver={e => { e.preventDefault(); if (!isAtLimit) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} />
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Uploading photos...</div>
          </div>
        ) : isAtLimit ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={22} color="#ef4444" /></div>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#ef4444' }}>Photo limit reached</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Upgrade your plan to upload more photos</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: dragging ? '#fffbeb' : 'var(--card-bg)', border: `1px solid ${dragging ? '#e8b84b' : 'var(--card-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Upload size={22} color={dragging ? '#d97706' : 'var(--text-muted)'} /></div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{dragging ? 'Drop photos here' : 'Upload portfolio photos'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Drag & drop or click to select · JPG, PNG, WebP · Max 5MB each</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> photos uploaded</span>
        </div>
        {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hover to edit · likes come from your public profile</span>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : items.length === 0 ? (
        <div className="card empty-state"><div className="empty-state-icon">📸</div><h3>No photos yet</h3><p>Upload your project photos to attract more clients</p></div>
      ) : (
        <div className="pf-grid">
          {items.map(item => (
            <div key={item.id} className="pf-card">
              {editingId === item.id ? (
                <div style={{ padding: 12 }}>
                  <img src={item.image_url} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="e.g. Modern Living Room" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Description</label>
                    <textarea className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ minHeight: 56, fontSize: 13 }} placeholder="Short description..." />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item)}><Check size={13} />Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}><X size={13} />Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pf-thumb">
                    <img src={item.image_url} alt={item.title || 'Portfolio'} />
                    <div className="pf-actions">
                      <button onClick={() => { setEditingId(item.id); setEditTitle(item.title || ''); setEditDesc(item.description || '') }} title="Edit"><Edit3 size={14} /></button>
                      <button className="danger" onClick={() => { if (confirm('Delete this photo?')) deleteItem(item) }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="pf-body">
                    <div className="pf-title">{item.title || 'Untitled'}</div>
                    <div className="pf-desc">{item.description || 'No description added'}</div>
                    <div className="pf-meta">
                      <Heart size={13} color="#ef4444" fill={item.likes_count > 0 ? '#ef4444' : 'none'} />
                      <span>{item.likes_count || 0} like{(item.likes_count || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpgradePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📸</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color:'var(--text-primary)' }}>Photo Limit Reached</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>Your <strong style={{ textTransform: 'capitalize' }}>{plan}</strong> plan allows <strong>{limitLabel}</strong> photos. Upgrade to upload more.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowUpgradePopup(false); window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my Tritova plan', '_blank') }}>Upgrade Now</button>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowUpgradePopup(false)}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
