import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Upload, Trash2, Edit3, X, Check, Image as ImageIcon } from 'lucide-react'

export default function PortfolioPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const fileInputRef = useRef()

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
    const validFiles = Array.from(files).filter(f => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return false }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is too large (max 5MB)`); return false }
      return true
    })
    if (validFiles.length === 0) return

    setUploading(true)
    let successCount = 0
    for (const file of validFiles) {
      try {
        const ext = file.name.split('.').pop()
        const path = `portfolio/${company.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('company-assets')
          .upload(path, file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('company-assets')
          .getPublicUrl(path)

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
      if (item.storage_path) {
        await supabase.storage.from('company-assets').remove([item.storage_path])
      }
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
    e.preventDefault()
    setDragging(false)
    uploadFiles(e.dataTransfer.files)
  }

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Portfolio</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Showcase your best work to attract more clients</p>
      </div>

      {/* Upload zone */}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        style={{ marginBottom: 24 }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => uploadFiles(e.target.files)}
        />
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Uploading photos...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: dragging ? 'var(--gold-light)' : 'var(--card-bg)',
              border: `1px solid ${dragging ? 'var(--gold)' : 'var(--card-border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              <Upload size={22} color={dragging ? 'var(--gold-dark)' : 'var(--text-muted)'} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              {dragging ? 'Drop photos here' : 'Upload portfolio photos'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Drag & drop or click to select · JPG, PNG, WebP · Max 5MB each
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, padding: '8px 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> photos uploaded
          </span>
        </div>
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Click on a photo to edit details
          </span>
        )}
      </div>

      {/* Portfolio grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📸</div>
          <h3>No photos yet</h3>
          <p>Upload your project photos to attract more clients</p>
        </div>
      ) : (
        <div className="portfolio-grid">
          {items.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              {editingId === item.id ? (
                /* Edit form */
                <div className="card" style={{ aspectRatio: 'auto' }}>
                  <div style={{ marginBottom: 10 }}>
                    <img src={item.image_url} alt="" style={{
                      width: '100%', height: 100, objectFit: 'cover', borderRadius: 8
                    }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Description</label>
                    <textarea className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ minHeight: 60, fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item)}>
                      <Check size={13} />Save
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                      <X size={13} />Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="portfolio-item">
                  <img src={item.image_url} alt={item.title || 'Portfolio'} />
                  {item.title && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      padding: '8px 10px',
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                      fontSize: 12, color: 'white', fontWeight: 500
                    }}>
                      {item.title}
                    </div>
                  )}
                  <div className="portfolio-item-overlay">
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(255,255,255,0.9)', color: '#111' }}
                      onClick={() => { setEditingId(item.id); setEditTitle(item.title || ''); setEditDesc(item.description || '') }}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}
                      onClick={() => {
                        if (confirm('Delete this photo?')) deleteItem(item)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
