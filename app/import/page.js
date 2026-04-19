'use client'
import { useState, useEffect } from 'react'
import { deriveKey, encrypt, decrypt, hashPassword } from '../lib/crypto'
import { syncVaultToCloud } from '../lib/supabase'

export default function ImportPage() {
  const [pwd, setPwd] = useState('')
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState('')
  const [count, setCount] = useState(0)
  const [importData, setImportData] = useState(null)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash) {
      try {
        const decoded = JSON.parse(atob(hash))
        setImportData(decoded)
        setCount(decoded.length)
        window.location.hash = '' // clear from URL immediately
      } catch {}
    }
  }, [])

  async function handleImport() {
    if (!pwd || !importData) return
    setStatus('loading')
    setMsg('Verificando master password...')
    try {
      const meta = JSON.parse(localStorage.getItem('vl2_meta') || '{}')
      if (!meta.salt) throw new Error('No hay bóveda activa. Crea una primero.')
      const pwdHash = await hashPassword(pwd)
      if (pwdHash !== meta.pwdHash) throw new Error('Master password incorrecta.')
      setMsg('Derivando clave AES-256...')
      const key = await deriveKey(pwd, meta.salt)
      const vid = await hashPassword(pwd + '_vault_id')
      let existing = []
      const blob = localStorage.getItem('vl2_blob')
      if (blob) { try { existing = await decrypt(blob, key) } catch {} }
      const existingNames = new Set(existing.map(e => e.name.toLowerCase()))
      const toAdd = importData.filter(e => !existingNames.has(e.name.toLowerCase()))
        .map(e => ({ ...e, id: crypto.randomUUID(), createdAt: Date.now() }))
      const merged = [...existing, ...toAdd]
      setMsg(`Cifrando ${merged.length} entradas...`)
      const encrypted = await encrypt(merged, key)
      localStorage.setItem('vl2_blob', encrypted)
      setMsg('Sincronizando con Supabase...')
      await syncVaultToCloud(vid, encrypted, meta.salt)
      setStatus('done')
      setMsg(`✅ ${toAdd.length} entradas importadas. ${existing.length} ya existían.`)
    } catch(e) {
      setStatus('error')
      setMsg('❌ ' + e.message)
      setStatus('error')
    }
  }

  const msgColor = status === 'done' ? '#44ff88' : status === 'error' ? '#ff4444' : '#d4ff00'
  const msgBg = status === 'done' ? 'rgba(68,255,136,0.08)' : status === 'error' ? 'rgba(255,68,68,0.08)' : 'rgba(212,255,0,0.06)'

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080808',padding:24,fontFamily:"'Space Mono',monospace"}}>
      <div style={{width:'100%',maxWidth:440}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontSize:44,marginBottom:12}}>📥</div>
          <h1 style={{color:'#f0ede8',fontSize:21,fontWeight:700,marginBottom:8}}>Importar credenciales</h1>
          {importData
            ? <p style={{color:'#888',fontSize:13,lineHeight:1.6}}><span style={{color:'#d4ff00',fontWeight:700}}>{count} entradas</span> listas para importar.<br/>Ingresa tu master password para cifrarlas.</p>
            : <p style={{color:'#ff4444',fontSize:13}}>No hay datos de importación. Usa el launcher HTML.</p>
          }
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleImport()} placeholder="Master password" autoFocus
            style={{background:'#1a1a1a',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'12px 16px',color:'#f0ede8',fontSize:14,outline:'none'}}
            onFocus={e=>e.target.style.borderColor='#d4ff00'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'} />
          {msg && <div style={{padding:'12px 16px',borderRadius:8,fontSize:13,lineHeight:1.5,background:msgBg,border:`1px solid ${msgColor}33`,color:msgColor}}>{msg}</div>}
          {status !== 'done' && (
            <button onClick={handleImport} disabled={status==='loading'||!pwd||!importData}
              style={{background:status==='loading'||!pwd||!importData?'#1a1a1a':'#d4ff00',color:status==='loading'||!pwd||!importData?'#444':'#000',border:'none',borderRadius:10,padding:'14px',fontWeight:700,fontSize:14,cursor:'pointer',transition:'all 0.2s'}}>
              {status==='loading'?'Importando...':importData?`Importar ${count} entradas →`:'Sin datos'}
            </button>
          )}
          {status === 'done' && <a href="/" style={{display:'block',textAlign:'center',background:'#d4ff00',color:'#000',borderRadius:10,padding:'14px',fontWeight:700,fontSize:14,textDecoration:'none'}}>Abrir VaultLock →</a>}
        </div>
      </div>
    </div>
  )
}
