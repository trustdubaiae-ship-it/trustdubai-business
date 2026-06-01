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

  useEffect(() => {
    if (company) fetchPortfolio()
  }, [company])

  async function fetchPortfolio() {
    try {
      const { data } = await supabase
        .from('portfolio_items')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      setItems(data || [])
    } catch (e) {
      toast.error('Could not load portfolio')
    } finally {
      setLoading(false)
    }
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
    if (filesToUpload.length < validFiles.length) {
      toast.error(`Only ${slotsLeft} slot${slotsLeft !== 1 ? 's' : ''} remaining — uploading first ${filesToUpload.length}`)
    }

    setUploading(true)
    let successCount = 0
    for (const file of filesToUpload) {
      try {
        const ext = file.name.split('.').pop()
        const path = `portfolio/${company.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('company-assets').upload(path, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
        await supabase.from('portfolio_items').insert({
          company_id: company.id,
          image_url: publicUrl,
          storage_path: path,
          title: file.name.replace(/\.[^.]+$/, ''),
          created_at: new Date().toISOString()
        })
        successCount++
      } catch (e) {
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded!`)
      await fetchPortfolio()
    }
    setUploading(false)
  }

  async function deleteItem(item) {
    try {
      if (item.storage_path) await supabase.storage.from('company-assets').remove([item.storage_path])
      await supabase.from('portfolio_items').delete().eq('id', item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Photo deleted')
    } catch (e) {
      toast.error('Could not delete photo')
    }
  }

  async function saveEdit(item) {
    try {
      await supabase.from('portfolio_items').update({ title: editTitle, description: editDesc }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: editTitle, description: editDesc } : i))
      setEditingId(null)
      toast.success('Updated!')
    } catch (e) {
      toast.error('Could not update')
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    if (isAtLimit) { setShowUpgradePopup(true); return }
    uploadFiles(e.dataTransfer.files)
  }
  function handleUploadClick() {
    if (isAtLimit) { setShowUpgradePopup(true); return }
    fileInputRef.current?.click()
  }

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Portfolio</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Showcase your best work to attract more clients</p>
        </div>
        <div style={{
          background: isAtLimit ? 'var(--red-bg)' : 'var(--gold-light)',
          border: `1px solid ${isAtLimit ? '#fecaca' : 'var(--gold-border)'}`,
          borderRadius: 8, padding: '8px 14px', fontSize: 12,
          color: isAtLimit ? 'var(--red)' : 'var(--gold-dark)',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <ImageIcon size={12} />
          {items.length} / {limitLabel} photos
          {isAtLimit && <span style={{ fontWeight: 600 }}>· Limit reached</span>}
        </div>
      </div>

      {/* limit bar */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 10, padding: '10px 16px', marginBottom: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />
          <span style={{ fontSize: 12, color: 'var(--gold-dark)', fontWeight: 600, textTransform: 'capitalize' }}>
            {plan} Plan: {limitLabel} photos
          </span>
        </div>
        {!isAtLimit
          ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{remaining} slot{remaining !== 1 && remaining !== '∞' ? 's' : ''} remaining</span>
          : <button onClick={() => setShowUpgradePopup(true)} style={{ fontSize: 12, color: 'var(--gold-dark)', background: 'var(--gold-light)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Upgrade Plan →</button>
        }
      </div>

      {/* upload zone */}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        style={{ marginBottom: 22, opacity: isAtLimit ? 0.6 : 1, cursor: isAtLimit ? 'not-allowed' : 'pointer' }}
        onClick={handleUploadClick}
        onDragOver={e => { e.preventDefault(); if (!isAtLimit) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} />
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Uploading photos...</div>
          </div>
        ) : isAtLimit ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--red-bg)', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={22} color="var(--red)" />
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--red)' }}>Photo limit reached</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Upgrade your plan to upload more photos</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: dragging ? 'var(--gold-light)' : 'var(--card-bg)', border: `1px solid ${dragging ? 'var(--gold)' : 'var(--card-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
              <Upload size={22} color={dragging ? 'var(--gold-dark)' : 'var(--text-muted)'} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{dragging ? 'Drop photos here' : 'Upload portfolio photos'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Drag & drop or click to select · JPG, PNG, WebP · Max 5MB each</div>
          </div>
        )}
      </div>

      {/* count line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> photos uploaded
          </span>
        </div>
        {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hover a photo to edit · likes come from public profile</span>}
      </div>

      {/* GRID */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📸</div>
          <h3>No photos yet</h3>
          <p>Upload your project photos to attract more clients</p>
        </div>
      ) : (
        <div className="portfolio-grid">
          {items.map(item => (
            <div key={item.id} className="portfolio-card">
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
                  <div className="portfolio-thumb">
                    <img src={item.image_url} alt={item.title || 'Portfolio'} />
                    <div className="portfolio-actions">
                      <button onClick={() => { setEditingId(item.id); setEditTitle(item.title || ''); setEditDesc(item.description || '') }} title="Edit">
                        <Edit3 size={14} />
                      </button>
                      <button className="danger" onClick={() => { if (confirm('Delete this photo?')) deleteItem(item) }} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="portfolio-body">
                    <div className="portfolio-title">{item.title || 'Untitled'}</div>
                    {item.description && <div className="portfolio-desc">{item.description}</div>}
                    <div className="portfolio-meta">
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

      {/* upgrade popup */}
      {showUpgradePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📸</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color:'var(--text-primary)' }}>Photo Limit Reached</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Your <strong style={{ textTransform: 'capitalize' }}>{plan}</strong> plan allows <strong>{limitLabel}</strong> photos.
              Upgrade to upload more portfolio photos and attract more clients.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setShowUpgradePopup(false); window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my TrustDubai plan', '_blank') }}>
                Upgrade Now
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowUpgradePopup(false)}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
