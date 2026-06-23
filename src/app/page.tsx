"use client";

import React, { useState, useEffect, useRef } from 'react';

interface Contact {
  name: string;
  company: string;
  headline: string;
  snippet: string;
  email: string | null;
  profileUrl: string;
  confidence: 'High' | 'Likely' | 'Predicted';
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [query, setQuery] = useState('');
  
  const [isSearching, setIsSearching] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [currentResults, setCurrentResults] = useState<Contact[]>([]);
  const [currentLayout, setCurrentLayout] = useState<'list' | 'grid'>('list');
  
  const [selectedLeadIndex, setSelectedLeadIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [composerType, setComposerType] = useState<'job' | 'networking' | 'followup'>('job');
  const [composerText, setComposerText] = useState('');
  
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load API Key & Theme on Mount
  useEffect(() => {
    const savedKey = localStorage.getItem('serper_api_key') || '';
    setApiKey(savedKey);

    const savedTheme = localStorage.getItem('theme_mode') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme_mode', nextTheme);
    triggerToast(`Theme switched to ${nextTheme} mode!`);
  };

  const saveKey = () => {
    localStorage.setItem('serper_api_key', apiKey.trim());
    triggerToast('API Key saved successfully!');
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  const addLog = (text: string) => {
    setLogs(prev => [`${text}`, ...prev]);
  };

  const executeSearch = async () => {
    if (!query.trim()) {
      alert('Please specify a target company or keyword.');
      return;
    }

    setIsSearching(true);
    setLogs([]);
    setActiveStepIndex(0);

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      addLog('Structuring geo-targeted search parameters...');
      setStatusMessage('Scanning Target Directory');
      await sleep(400);

      setActiveStepIndex(1);
      addLog(`Initiating Serverless Directory Scan for: "${query.trim()}"`);
      setStatusMessage('Querying Serper Database');

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim()
        },
        body: JSON.stringify({
          query: query.trim(),
          role: null,
          gl: 'in',
          num: null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || `HTTP error ${res.status}`);
      }

      setActiveStepIndex(2);
      addLog('Extracting entities & matching profile payloads...');
      setStatusMessage('Sanitizing Leads Profiles');
      await sleep(400);

      const data = await res.json();
      const contactsArray = Array.isArray(data) ? data : (data.contacts || []);

      setActiveStepIndex(3);
      addLog('Drafting email format predictions & structuring analytics...');
      setStatusMessage('Finalizing Leads Syntheses');
      await sleep(350);

      setActiveStepIndex(4);
      setCurrentResults(prev => {
        const seen = new Set(prev.map(c => c.profileUrl));
        const newUnique = contactsArray.filter((c: Contact) => !seen.has(c.profileUrl));
        return [...prev, ...newUnique];
      });
      setIsSearching(false);

      if (contactsArray.length === 0) {
        addLog('No contacts found matching the search criteria.');
      } else {
        addLog(`Successfully parsed ${contactsArray.length} recruiter records.`);
      }

    } catch (err: any) {
      console.error(err);
      setIsSearching(false);
      alert(`Scout failed: ${err.message}`);
    }
  };

  const buildTemplate = (type: 'job' | 'networking' | 'followup', lead: Contact) => {
    const firstName = lead.name.split(' ')[0] || 'there';
    const cleanCompany = lead.company;
    const snippetDetails = lead.snippet ? `Regarding your focus on: "${lead.snippet.substring(0, 150)}..."` : 'Regarding your active hiring requirements';

    if (type === 'job') {
      return `Subject: Direct Inquiry re: ${cleanCompany} Engineering & Hiring Needs

Hi ${firstName},

I hope this email finds you well.

I recently came across your profile and noticed that you manage Talent Acquisition and Recruitment as a ${lead.headline} at ${cleanCompany}. ${snippetDetails}

With my background in software development and agentic systems design, I believe I could bring significant value to your engineering initiatives at ${cleanCompany}. I have attached my resume for your review.

Would you be open to a brief 5-minute chat next week to discuss how my background aligns with your current team needs?

Thank you for your time,

Best regards,
[Your Name]
[Your Phone]
[Your Portfolio Link]`;
    } else if (type === 'networking') {
      return `Subject: Quick Question: Informational Interview request - ${cleanCompany}\n\nHi ${firstName},\n\nI hope your week is off to a great start.\n\nI'm currently looking to expand my network within the tech recruitment sphere, and I admire your background as a ${lead.headline} at ${cleanCompany}.\n\nIf you have 10 minutes to spare, I would love to schedule a quick virtual coffee to learn more about your career journey, culture at ${cleanCompany}, and any advice you might have for someone with my skill set entering the market.\n\nI understand you are busy, so if now is not a good time, no worries at all.\n\nThank you for considering,\n\nWarmly,\n[Your Name]`;
    } else {
      return `Subject: Quick connection request - [Your Name]\n\nHi ${firstName},\n\nI hope you are having a productive week.\n\nI wanted to reach out and connect directly. I noticed you handle recruiting for ${cleanCompany} and wanted to put myself on your radar for any upcoming senior engineering or technical roles.\n\nI'd love to send over my portfolio if you have any active headcount matching my profile. Let me know if we can sync up!\n\nBest,\n[Your Name]`;
    }
  };

  const openLeadModal = (index: number) => {
    setSelectedLeadIndex(index);
    const lead = currentResults[index];
    const initialText = buildTemplate('job', lead);
    setComposerType('job');
    setComposerText(initialText);
    setIsModalOpen(true);
  };

  const handleTemplateSwitch = (type: 'job' | 'networking' | 'followup') => {
    if (selectedLeadIndex === null) return;
    setComposerType(type);
    const text = buildTemplate(type, currentResults[selectedLeadIndex]);
    setComposerText(text);
  };

  const copyComposerText = () => {
    navigator.clipboard.writeText(composerText).then(() => {
      triggerToast('Email draft copied to clipboard!');
    });
  };

  const copySingleEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      triggerToast(`Email copied: ${email}`);
    });
  };

  const copyAllEmails = () => {
    const emails = currentResults.filter(c => c.email).map(c => c.email).join('\n');
    if (!emails) {
      triggerToast('No emails found to copy.');
      return;
    }
    navigator.clipboard.writeText(emails).then(() => {
      triggerToast('All emails copied to clipboard!');
    });
  };

  const exportCSV = () => {
    if (!currentResults.length) return;
    const headers = ['Name', 'Headline', 'Company', 'Predicted Email', 'LinkedIn URL', 'Confidence'];
    const rows = currentResults.map(c => [
      c.name, c.headline, c.company,
      c.email || '', c.profileUrl || '',
      c.confidence
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(','));
    
    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads-export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast('CSV export initialized successfully!');
  };

  const AVATAR_COLORS = [
    ['rgba(37,99,235,0.08)', '#2563eb'],
    ['rgba(139,92,246,0.08)', '#8b5cf6'],
    ['rgba(16,185,129,0.08)', '#10b981'],
    ['rgba(245,158,11,0.08)', '#f59e0b'],
    ['rgba(239,68,68,0.08)', '#ef4444']
  ];

  // Removed unused roles list

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header>
        <a href="#" className="brand-logo">
          <img src="/logo.png" alt="HR Finder Logo" className="brand-logo-img" />
          <div className="brand-logo-text">
            <h1>HR Finder</h1>
          </div>
        </a>
        <div className="header-actions">
          <button className="btn-theme-toggle" onClick={toggleTheme} title="Toggle Light/Dark Theme">
            <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`}></i>
          </button>
          <a href="https://github.com/varadrz/HR-Search" target="_blank" className="btn-github" rel="noreferrer">
            <i className="ti ti-brand-github"></i> GitHub
          </a>
          <div className="badge-license">
            <i className="ti ti-gavel"></i> MIT + Custom
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero-banner">
          <h2>Recruiter & <span>Talent Scout Radar</span></h2>
          <p>Perform direct Google Search lookups powered by Serper API to target local hiring teams, HR professionals, and recruiters. Get predictions of corporate email formats instantly.</p>
        </section>

        <div className="layout-grid">
          {/* API Credentials Panel */}
          <section className="panel">
            <div className="panel-header-layout">
              <div className="panel-icon-box">
                <i className="ti ti-key"></i>
              </div>
              <div className="panel-title-area">
                <div className="panel-title-line">
                  <span className="panel-title-text">Serper API Credentials</span>
                  <div className={`api-badge ${apiKey.trim().length > 10 ? 'connected' : 'disconnected'}`}>
                    <i className="ti ti-circle-dot"></i> {apiKey.trim().length > 10 ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
                <p className="panel-desc-text">
                  A Serper API key is required to query Google search index dynamically. Get 2,500 searches free at <a href="https://serper.dev" target="_blank" rel="noreferrer">serper.dev</a>. Your credential remains secured inside local storage.
                </p>
              </div>
            </div>

            <div className="input-row">
              <div className="input-container-inner">
                <i className="ti ti-shield-lock"></i>
                <input 
                  type={showKey ? "text" : "password"} 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Serper API Key (e.g. 0f7bcb722...)" 
                />
              </div>
              <button className="btn-icon-only" onClick={() => setShowKey(!showKey)} title="Show/Hide API Key">
                <i className={`ti ${showKey ? 'ti-eye-off' : 'ti-eye'}`}></i>
              </button>
              <button className="btn btn-primary" onClick={saveKey}>
                <i className="ti ti-key"></i> Save Key
              </button>
            </div>
            
          </section>

          {/* Search Target Panel */}
          <section className="panel">
            <div className="panel-section-title">1 Target / Focus Query String</div>
            <div className="target-field-row">
              <div className="input-container-inner">
                <i className="ti ti-building"></i>
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') executeSearch(); }}
                  placeholder="e.g. HR at JP Morgan Hyderabad" 
                />
              </div>
              <button className="btn btn-primary" onClick={executeSearch} disabled={isSearching}>
                <i className="ti ti-radar"></i> Scan Radar
              </button>
            </div>
          </section>

          {/* Checklist loading animation */}
          {isSearching && (
            <section className="checklist-loading-box">
              <div className="checklist-items-col">
                <div className="panel-section-title" style={{ marginBottom: '8px' }}>Scanning Progress</div>
                
                <div className={`checklist-step ${activeStepIndex > 0 ? 'completed' : activeStepIndex === 0 ? 'active' : ''}`}>
                  <div className="checklist-step-icon">
                    {activeStepIndex > 0 ? <i className="ti ti-circle-check"></i> : <i className="ti ti-loader-quarter"></i>}
                  </div>
                  <span>Configure search parameters & target profiles</span>
                </div>

                <div className={`checklist-step ${activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 ? 'active' : ''}`}>
                  <div className="checklist-step-icon">
                    {activeStepIndex > 1 ? <i className="ti ti-circle-check"></i> : activeStepIndex === 1 ? <i className="ti ti-loader-quarter"></i> : <i className="ti ti-circle"></i>}
                  </div>
                  <span>Query Serper Google Index database</span>
                </div>

                <div className={`checklist-step ${activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 ? 'active' : ''}`}>
                  <div className="checklist-step-icon">
                    {activeStepIndex > 2 ? <i className="ti ti-circle-check"></i> : activeStepIndex === 2 ? <i className="ti ti-loader-quarter"></i> : <i className="ti ti-circle"></i>}
                  </div>
                  <span>Parse profiles, names, & job roles</span>
                </div>

                <div className={`checklist-step ${activeStepIndex > 3 ? 'completed' : activeStepIndex === 3 ? 'active' : ''}`}>
                  <div className="checklist-step-icon">
                    {activeStepIndex > 3 ? <i className="ti ti-circle-check"></i> : activeStepIndex === 3 ? <i className="ti ti-loader-quarter"></i> : <i className="ti ti-circle"></i>}
                  </div>
                  <span>Predict email syntheses & build templates</span>
                </div>
              </div>
              
              <div className="checklist-console-col">
                <div className="checklist-console-header">Terminal Console Output</div>
                <div className="checklist-console-output">
                  {logs.map((log, index) => (
                    <div key={index}>&gt; {log}</div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </section>
          )}

          {/* Leads Matrix Content */}
          <section>
            {currentResults.length > 0 && (
              <div className="results-control-row">
                <span className="results-label-qty">Scouted {currentResults.length} Contact{currentResults.length > 1 ? 's' : ''}</span>
                <div className="switcher-pills">
                  <button 
                    className={`btn-switch-layout ${currentLayout === 'list' ? 'active' : ''}`} 
                    onClick={() => setCurrentLayout('list')} 
                    title="List View"
                  >
                    <i className="ti ti-list"></i>
                  </button>
                  <button 
                    className={`btn-switch-layout ${currentLayout === 'grid' ? 'active' : ''}`} 
                    onClick={() => setCurrentLayout('grid')} 
                    title="Grid View"
                  >
                    <i className="ti ti-layout-grid"></i>
                  </button>
                </div>
              </div>
            )}

            {!isSearching && currentResults.length === 0 && (
              <div className="placeholder-radar-container">
                <div className="placeholder-radar-graphic">
                  <div className="placeholder-radar-circle1"></div>
                  <div className="placeholder-radar-circle2"></div>
                  <div className="placeholder-radar-glass">
                    <img src="/logo.png" alt="HR Finder Logo" className="placeholder-logo-img" />
                  </div>
                </div>
                <h3>No Scan Conducted</h3>
                <p>Configure your Serper key and enter a target company above to find verified HR personnel.</p>
              </div>
            )}

            <div className={`leads-container-box ${currentLayout === 'grid' ? 'grid-layout' : ''}`}>
              {currentResults.map((c, i) => {
                const initials = c.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const colIndex = Math.abs(c.name.charCodeAt(0) + (c.company ? c.company.charCodeAt(0) : 0)) % AVATAR_COLORS.length;
                const col = AVATAR_COLORS[colIndex];
                const confLabel = c.confidence;

                return (
                  <div key={i} className="lead-item-card" onClick={() => openLeadModal(i)}>
                    <div className="lead-card-header">
                      <div className="lead-card-avatar" style={{ background: col[0], color: col[1] }}>
                        {initials}
                        <div className="lead-card-badge-icon type-linkedin">
                          <i className="ti ti-brand-linkedin"></i>
                        </div>
                      </div>
                      <div className="lead-card-body-details">
                        <div className="lead-card-top-row">
                          <div className="lead-card-name">{c.name}</div>
                          <span className={`confidence-indicator-badge ${c.confidence.toLowerCase()}`}>{confLabel}</span>
                        </div>
                        <div className="lead-card-subheadline">
                          {c.headline} &middot; <span>{c.company}</span>
                        </div>
                      </div>
                    </div>
                    {c.snippet && <div className="lead-card-snippet">{c.snippet}</div>}
                    {c.email && (
                      <div className="lead-card-email-row" onClick={(e) => e.stopPropagation()}>
                        <span className="lead-card-email-txt">{c.email}</span>
                        <button className="btn-icon-only" style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => copySingleEmail(c.email!)}>
                          <i className="ti ti-copy"></i>
                        </button>
                      </div>
                    )}
                    <div className="lead-card-footer" onClick={(e) => e.stopPropagation()}>
                      <a href={c.profileUrl} target="_blank" rel="noreferrer">
                        <i className="ti ti-brand-linkedin"></i> Direct Profile Link
                      </a>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: '11px', height: 'auto', background: 'rgba(37,99,235,0.08)', color: 'var(--primary)', border: '1px solid rgba(37,99,235,0.2)' }} onClick={() => openLeadModal(i)}>
                        <i className="ti ti-pencil"></i> Draft Pitch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sticky Export Actions Panel */}
          {currentResults.length > 0 && (
            <section className="sticky-footer-exports">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{currentResults.length} Contact{currentResults.length > 1 ? 's' : ''} Scouted</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Leads are ready for immediate contact routing</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-icon-only" onClick={copyAllEmails} style={{ padding: '10px 16px', fontSize: '13px' }} title="Copy all emails to clipboard">
                  <i className="ti ti-copy"></i> Copy All
                </button>
                <button className="btn btn-primary" onClick={exportCSV} style={{ padding: '10px 20px', fontSize: '13px' }}>
                  <i className="ti ti-download"></i> Export CSV
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Details & Composer Modal */}
      {isModalOpen && selectedLeadIndex !== null && (
        <div className="backdrop-blur-curtain" onClick={() => setIsModalOpen(false)}>
          <div className="lead-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lead-detail-modal-header">
              <span>Lead Profile Intelligence</span>
              <button className="modal-close-cross-btn" onClick={() => setIsModalOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="lead-detail-modal-body">
              <div className="modal-lead-profile-header">
                <div className="avatar-shape" style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--primary)' }}>
                  {currentResults[selectedLeadIndex].name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <h3 className="modal-lead-name">{currentResults[selectedLeadIndex].name}</h3>
                  <p className="modal-lead-meta">
                    {currentResults[selectedLeadIndex].headline} &middot; <span style={{ color: 'var(--primary)' }}>{currentResults[selectedLeadIndex].company}</span>
                  </p>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Source Metadata</span>
                <div className="modal-snippet-content">
                  {currentResults[selectedLeadIndex].snippet || 'No profile snippet details parsed from Google Search results.'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Guessed Email Details</span>
                <div className="modal-email-card">
                  <div>
                    <span className="modal-email-title-label">{currentResults[selectedLeadIndex].email || 'No email pattern predicted'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn" style={{ padding: '8px 14px', fontSize: '11px', background: 'var(--bg-surface)', borderColor: 'var(--border)' }} onClick={() => copySingleEmail(currentResults[selectedLeadIndex].email!)}>
                      <i className="ti ti-copy"></i> Copy
                    </button>
                    <a href={`mailto:${currentResults[selectedLeadIndex].email}`} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '11px', textDecoration: 'none' }}>
                      <i className="ti ti-mail-fast"></i> Email
                    </a>
                  </div>
                </div>
              </div>

              {/* Cold Email Composer */}
              <div className="modal-draft-composer">
                <div className="modal-draft-header-actions">
                  <span>Cold Email Generator</span>
                  <span className="modal-draft-copy-trigger" onClick={copyComposerText}><i className="ti ti-copy"></i> Copy Email Text</span>
                </div>
                <div className="modal-draft-template-tabs">
                  <button className={`btn-draft-tab ${composerType === 'job' ? 'active' : ''}`} onClick={() => handleTemplateSwitch('job')}>Job Application</button>
                  <button className={`btn-draft-tab ${composerType === 'networking' ? 'active' : ''}`} onClick={() => handleTemplateSwitch('networking')}>Informational Interview</button>
                  <button className={`btn-draft-tab ${composerType === 'followup' ? 'active' : ''}`} onClick={() => handleTemplateSwitch('followup')}>Quick Connect</button>
                </div>
                <textarea className="modal-draft-textarea" value={composerText} onChange={(e) => setComposerText(e.target.value)}></textarea>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: 'auto' }}>
        <div className="footer-wrapper">
          <div className="footer-columns">
            <div className="footer-branding">
              <a href="#" className="brand-logo" style={{ marginBottom: '12px' }}>
                <img src="/logo.png" alt="HR Finder Logo" className="brand-logo-img-small" />
                <h1 style={{ fontSize: '16px' }}>HR Finder</h1>
              </a>
              <p>An enterprise-grade client-side lead capture tool mapping recruiter directories using direct API lookups.</p>
            </div>
            <div className="footer-license">
              <h4>Dual Licensing Supplement</h4>
              <p>This codebase is subject to a dual-licensing scheme containing both the **MIT License** and the **HR Finder Custom License Supplement**. Hosting commercial, subscription-paywalled access points is strictly prohibited. Attribution to the original repository must be visible in public forks.</p>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; 2026 Varad D. Open source release.</span>
            <div className="footer-links">
              <a href="https://github.com/varadrz/HR-Search" target="_blank" rel="noreferrer">Repository</a>
              <a href="https://serper.dev" target="_blank" rel="noreferrer">Serper.dev</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toaster Notification */}
      <div className={`ui-notification-toaster ${showToast ? 'show' : ''}`}>
        <i className="ti ti-circle-check"></i>
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}
