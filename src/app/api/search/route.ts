import { NextRequest, NextResponse } from 'next/server';

interface ParsedContact {
  name: string;
  company: string;
  headline: string;
  snippet: string;
  email: string | null;
  profileUrl: string;
  confidence: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    // Support Serper Key from backend env variables or client header
    const apiKey = process.env.SERPER_API_KEY || request.headers.get('x-api-key') || '';

    if (!apiKey) {
      return NextResponse.json({ 
        message: 'Serper API Key is required. Please set SERPER_API_KEY in Vercel env or enter it in the UI.' 
      }, { status: 400 });
    }

    // 1. Programmatic X-Ray Logic Injection targeting professional profiles
    const targetQuery = `site:linkedin.com/in/ AND ${query} AND (HR OR Recruiter OR "Talent Acquisition" OR "Hiring Manager") -inurl:dir/ -inurl:jobs/ -inurl:posts/`;

    const serperResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: targetQuery,
        num: 20
      })
    });

    if (!serperResponse.ok) {
      let errMsg = `Serper HTTP error ${serperResponse.status}`;
      try {
        const errorData = await serperResponse.json();
        errMsg = errorData.message || errMsg;
      } catch (e) {}
      return NextResponse.json({ message: errMsg }, { status: serperResponse.status });
    }

    const data = await serperResponse.json();
    const organicResults = data.organic || [];
    const cleanContacts: ParsedContact[] = [];

    // Blacklist filter patterns to instantly drop generic directories, maps, or junk results
    const junkPatterns = /pdf|job|post|vacancy|salary|opening|career|instagram|facebook|trends|contact\.us|campus/i;

    for (const item of organicResults) {
      const title = item.title || '';
      const snippet = item.snippet || '';
      const link = item.link || '';

      if (junkPatterns.test(title) || junkPatterns.test(link)) continue;

      // Profile Name Splitting & Extraction Logic
      let computedName = title.split(/[|\-·–]/)[0].trim();
      computedName = computedName.replace(/\(.*?\)/g, '').trim(); // Strip bracket metadata e.g. (He/Him)

      // Skip anomalies (e.g. "Contact Us", "Hyderabad Campus", or weird title aggregations)
      if (
        computedName.split(' ').length > 3 || 
        computedName.split(' ').length < 2 || 
        /recruiter|hr|talent|manager|campus|contact|india|microsoft/i.test(computedName)
      ) {
        continue; 
      }

      // 2. ISOLATE CURRENT EXPERIENCE: Clean historical career info to prevent false matches
      let textToScan = `${title} ${snippet}`.toLowerCase();
      const pastExperiencePatterns = /(?:ex[图形\-\s]|former|previously\s+at|alumni\s+of)\s*[a-z0-9\s]+/gi;
      textToScan = textToScan.replace(pastExperiencePatterns, '');

      // Identify active, current employer anchor sequences
      const currentIndicators = /(?:at|@|recruiter\s*·|talent\s*·|leader\s*·|head\s+of\s+hr\s+at)\s*([a-z0-9\s.&]+)/i;
      const match = textToScan.match(currentIndicators);
      
      let companyName = '';
      let domainSlug = 'company.com';

      if (match && match[1]) {
        companyName = match[1].split(/[,\-·|]/)[0].trim();
        
        // Anti-Hallucination Guard: Remove common geographic words, platforms, and garbage metadata string loops
        companyName = companyName.replace(/hyderabad|bengaluru|mumbai|pune|india|remote|usa|global|london|tech|linkedin|hr\s+at|campus|development|unitedhealth/i, '').trim();
        
        // Clean out trailing connective conjunctions (like "amp", "and")
        companyName = companyName.replace(/\b(and|amp|or)\b.*/i, '').trim();

        const cleanSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanSlug && cleanSlug.length > 2) {
          domainSlug = `${cleanSlug}.com`;
        }
      }

      // Fallback fallback: Parse query context to guess domain if the snippet context is heavily garbled
      if (domainSlug === 'company.com') {
        const queryTokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        // Look for common corporate terms passed inside your search bar query
        const knownTarget = queryTokens.find(t => !['hr', 'recruiter', 'talent', 'acquisition', 'manager', 'hyderabad', 'pune', 'bengaluru', 'india'].includes(t));
        if (knownTarget) {
          companyName = knownTarget;
          domainSlug = `${knownTarget}.com`;
        }
      }

      let verifiedEmail = null;
      let confidenceLevel = 'Predicted';

      // 3. ENRICHMENT LAYER: Hit Apollo's data pipeline with the direct profile link
      if (process.env.APOLLO_API_KEY && link.includes('linkedin.com/in/')) {
        try {
          const apolloRes = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
              'Cache-Control': 'no-cache',
              'Content-Type': 'application/json',
              'Api-Key': process.env.APOLLO_API_KEY
            },
            body: JSON.stringify({ 
              linkedin_url: link,
              reveal_personal_emails: false 
            })
          });

          if (apolloRes.ok) {
            const apolloData = await apolloRes.json();
            if (apolloData.person && apolloData.person.email) {
              verifiedEmail = apolloData.person.email;
              confidenceLevel = 'Verified Database Record';
              
              if (apolloData.person.organization?.name) {
                companyName = apolloData.person.organization.name;
              }
            }
          }
        } catch (enrichError) {
          console.error('Apollo enrichment skipped for current card:', enrichError);
        }
      }

      // 4. ALGORITHMIC FALLBACK: Run structural first.last mapping if database query missed
      if (!verifiedEmail) {
        const nameTokens = computedName.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
        if (nameTokens.length >= 2) {
          verifiedEmail = `${nameTokens[0].trim()}.${nameTokens[nameTokens.length - 1].trim()}@${domainSlug}`;
        } else if (nameTokens.length === 1) {
          verifiedEmail = `${nameTokens[0].trim()}@${domainSlug}`;
        }
      }

      // Only push structured human profile entities down to the dashboard array stream
      if (
        domainSlug !== 'company.com' && 
        verifiedEmail && 
        !verifiedEmail.includes('linkedin.com') && 
        !verifiedEmail.includes('hratmicrosoft') &&
        !verifiedEmail.includes('hyderabad') &&
        !verifiedEmail.includes('india') &&
        !verifiedEmail.includes('unitedhealth')
      ) {
        cleanContacts.push({
          name: computedName,
          company: companyName.toUpperCase() || 'TARGET CORP',
          headline: title.split(/[|\-·–]/)[1]?.trim() || 'Talent Acquisition Professional',
          snippet: snippet,
          email: verifiedEmail,
          profileUrl: link,
          confidence: confidenceLevel
        });
      }
    }

    return NextResponse.json({ contacts: cleanContacts });

  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ message: error.message || 'Search Pipeline Interrupted' }, { status: 500 });
  }
}
