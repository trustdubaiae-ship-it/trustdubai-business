import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { MessageCircle, Send, Clock, Lock } from 'lucide-react'

export default function ReviewsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [showUpgradePopup, setShowUpgradePopup] = useState(false)

  const currentPlan = company?.plan || 'free'
  const canReply = currentPlan !== 'free'

  useEffect(() => { if (company) fetchReviews() }, [company])

  async function fetchReviews() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('reviews')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      setReviews(data || [])
    } catch (e) {
      toast.error('Could not load reviews')
    } finally {
      setLoading(false)
    }
  }

  async function submitReply(reviewId) {
    if (!replyText.trim()) return
    setSendingReply(true)
    try {
      await supabase.from('reviews').update({
        owner_reply: replyText,
        replied_at: new Date().toISOString()
      }).eq('id', reviewId)
      await fetchReviews()
      setReplyingTo(null)
      setReplyText('')
      toast.success('Reply posted!')
    } catch (e) {
      toast.error('Failed to post reply')
    } finally {
      setSendingReply(false)
    }
  }

  function handleReplyClick(review) {
    if (!canReply) {
      setShowUpgradePopup(true)
      return
    }
    setReplyingTo(review.id)
    setReplyText(review.owner_reply || '')
  }

  const filtered = reviews.filter(r => {
    if (filter === 'all') return true
    if (filter === 'unreplied') return !r.owner_reply
    if (filter === '5') return r.rating === 5
    if (filter === 'low') return r.rating <= 3
    return true
  })

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map(n => ({
    star: n,
    count: reviews.filter(r => r.rating === n).length
  }))

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Reviews & Comments</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Manage your customer reviews and responses</p>
        </div>
        {!canReply && (
          <div style={{ background: '#fef9ed', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={12} />
            Reply feature requires Silver plan or above
          </div>
        )}
      </div>

      {/* Rating overview */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 52, color: 'var(--text-primary)', lineHeight: 1 }}>{avgRating}</div>
            <div className="stars" style={{ justifyContent: 'center', margin: '6px 0' }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} className={'star ' + (s <= Math.round(avgRating) ? '' : 'empty')} style={{ fontSize: 18 }}>★</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{reviews.length} reviews</div>
          </div>

          <div style={{ flex: 1, borderLeft: '1px solid var(--card-border)', paddingLeft: 32 }}>
            {ratingCounts.map(({ star, count }) => (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 12 }}>{star}</span>
                <span className="star" style={{ fontSize: 12 }}>★</span>
                <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    width: reviews.length > 0 ? (count / reviews.length * 100) + '%' : '0%',
                    height: '100%',
                    background: star >= 4 ? 'var(--green)' : star === 3 ? 'var(--amber)' : 'var(--red)',
                    borderRadius: 99, transition: 'width 0.5s ease'
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {[
              { label: 'Replied', value: reviews.filter(r => r.owner_reply).length, color: 'var(--green)' },
              { label: 'Needs Reply', value: reviews.filter(r => !r.owner_reply).length, color: 'var(--amber)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'all',      label: 'All (' + reviews.length + ')' },
          { key: 'unreplied',label: 'Needs Reply (' + reviews.filter(r => !r.owner_reply).length + ')' },
          { key: '5',        label: '5 Stars' },
          { key: 'low',      label: '1-3 Stars' },
        ].map(({ key, label }) => (
          <button key={key}
            className={'btn btn-sm ' + (filter === key ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFilter(key)}
          >{label}</button>
        ))}
      </div>

      {/* Reviews list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">💬</div>
          <h3>No reviews found</h3>
          <p>Reviews matching this filter will appear here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(review => {
            const reviewText = review.review_text || review.comment || ''
            return (
              <div key={review.id} className="review-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div className="review-avatar">
                    {(review.reviewer_name || 'A')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{review.reviewer_name || 'Anonymous'}</span>
                      {review.is_verified && <span className="badge badge-green" style={{ fontSize: 10 }}>✓ Verified</span>}
                      {!review.owner_reply && <span className="badge badge-gold" style={{ fontSize: 10 }}>Needs Reply</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <div className="stars">
                        {[1,2,3,4,5].map(s => (
                          <span key={s} className={'star ' + (s <= review.rating ? '' : 'empty')}>★</span>
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} />
                        {new Date(review.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {reviewText && (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12, paddingLeft: 44 }}>
                    {reviewText}
                  </p>
                )}

                {review.owner_reply && (
                  <div style={{ background: 'var(--gold-light)', border: '1px solid var(--gold-border)', borderRadius: 8, padding: 12, marginBottom: 10, marginLeft: 44 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MessageCircle size={11} />
                      YOUR REPLY
                      {review.replied_at && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                          · {new Date(review.replied_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{review.owner_reply}</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, paddingLeft: 44 }}>
                  {replyingTo === review.id ? (
                    <div style={{ flex: 1 }}>
                      <textarea
                        className="form-input"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Write a professional reply..."
                        style={{ minHeight: 80, fontSize: 13.5, marginBottom: 8, width: '100%' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => submitReply(review.id)} disabled={sendingReply || !replyText.trim()}>
                          <Send size={13} /> {sendingReply ? 'Posting...' : 'Post Reply'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setReplyingTo(null); setReplyText('') }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleReplyClick(review)}>
                      {canReply ? <MessageCircle size={13} /> : <Lock size={13} />}
                      {review.owner_reply ? 'Edit Reply' : 'Reply'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upgrade Popup */}
      {showUpgradePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 32, width: 400, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Reply to Reviews</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Replying to customer reviews is available on <strong>Silver plan and above</strong>. Upgrade to build trust with your customers.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setShowUpgradePopup(false); window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my TrustDubai plan', '_blank') }}
              >
                Upgrade Now
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowUpgradePopup(false)}>
                Maybe Later
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Silver plan starts at AED 149/month
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
