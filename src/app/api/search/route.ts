import { NextResponse } from 'next/server';

interface ParsedContact {
  name: string;
  company: string;
  headline: string;
  snippet: string;
  email: string | null;
  profileUrl: string;
  confidence: 'High' | 'Likely' | 'Predicted';
}

function cleanCompanyName(company: string) {
  if (!company) return '';
  return company
    .replace(/\b(ltd|limited|inc|incorporated|co|gmbh|solutions|corp|corporation|llc|plc|group|india|pvt|private)\b/gi, '')
    .replace(/[,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function predictEmail(name: string, company: string) {
  if (!name || !company) return { email: null, pattern: 'unknown' };
  const cleanName = name.toLowerCase().replace(/[^a-z\s.-]/g, '').trim();
  const parts = cleanName.split(/[\s.-]+/);
  if (parts.length === 0) return { email: null, pattern: 'unknown' };

  const first = parts[0];
  const last = parts[parts.length - 1] || '';
  
  let domain = cleanCompanyName(company)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  
  if (!domain) domain = 'company';
  const domainUrl = `${domain}.com`;

  if (last) {
    return {
      email: `${first}.${last}@${domainUrl}`,
      pattern: `first.last@${domainUrl}`
    };
  } else {
    return {
      email: `${first}@${domainUrl}`,
      pattern: `first@${domainUrl}`
    };
  }
}

function isValidPersonName(name: string) {
  if (!name) return false;
  const lower = name.toLowerCase();
  const blacklist = [
    'profile', 'linkedin', 'directory', 'jobs', 'recruitment', 
    'careers', 'hiring', 'log in', 'sign up', 'search', 
    'results', 'members', 'people', 'find', 'connections'
  ];
  if (blacklist.some(keyword => lower.includes(keyword))) return false;
  if (name.length < 3 || name.split(/\s+/).length > 4) return false;
  return true;
}

function isValidEmail(email: string | null): boolean {
  if (!email) return false;
  // Format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;
  // Ignore obviously broken placeholders or generic fallbacks
  if (email.includes('company.com') || email.includes('..') || email.includes('@company') || email.includes('undefined')) return false;
  return true;
}

export async function POST(request: Request) {
  try {
    const { query, role, gl, num } = await request.json();
    
    // Support Serper Key from backend env variables or client header
    const apiKey = process.env.SERPER_API_KEY || request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ 
        message: 'Serper API Key is required. Please set SERPER_API_KEY in Vercel env or enter it in the UI.' 
      }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ message: 'Search query is required' }, { status: 400 });
    }

    // Parallel calls helper
    const searchSerper = async (q: string, depth: number | null) => {
      const url = "https://google.serper.dev/search";
      const payload: any = { q, gl: gl || 'in' };
      if (depth && depth !== 10) {
        payload.num = depth;
      }

      let response = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errMsg = `Serper HTTP error ${response.status}`;
        try {
          const errorData = await response.json();
          errMsg = errorData.message || errMsg;
        } catch (e) {}

        // Retry without num parameter if the request fails due to tier restrictions
        if (payload.num && (response.status === 400 || errMsg.toLowerCase().includes('free') || errMsg.toLowerCase().includes('pattern'))) {
          console.warn("Retrying query without 'num' parameter due to account tier constraints...");
          delete payload.num;
          response = await fetch(url, {
            method: "POST",
            headers: {
              "X-API-KEY": apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            let retryErrMsg = `Serper HTTP error ${response.status}`;
            try {
              const errorData = await response.json();
              retryErrMsg = errorData.message || retryErrMsg;
            } catch (e) {}
            throw new Error(retryErrMsg);
          }
        } else {
          throw new Error(errMsg);
        }
      }
      return await response.json();
    };

    // Construct the search query
    // Support arbitrary searches cleanly
    let linkedinQuery = `site:linkedin.com/in/ ${query}`;
    let webQuery = `${query} contact email`;

    if (role && role !== 'None') {
      linkedinQuery = `site:linkedin.com/in/ "${query}" "${role}"`;
      webQuery = `"${query}" "${role}" contact email`;
    }

    let linkedinData: any = { organic: [] };
    let webData: any = { organic: [] };

    // Execute LinkedIn search with fallback
    try {
      linkedinData = await searchSerper(linkedinQuery, num);
    } catch (err: any) {
      try {
        const fallbackQuery = role && role !== 'None' ? `"${query}" "${role}" profile` : `"${query}" profile`;
        linkedinData = await searchSerper(fallbackQuery, num);
      } catch (fallbackErr) {
        console.error("Fallback query failed:", fallbackErr);
      }
    }

    // Execute Web search
    try {
      webData = await searchSerper(webQuery, num);
    } catch (err) {
      console.error("Web search failed:", err);
    }

    const cleanContacts: ParsedContact[] = [];
    const seenLinks = new Set<string>();

    const allItems = [
      ...(linkedinData.organic || []),
      ...(webData.organic || [])
    ];

    allItems.forEach((item: any) => {
      const link = item.link || '';
      if (!link || seenLinks.has(link)) return;
      seenLinks.add(link);

      const title = item.title || '';
      const snippet = item.snippet || '';

      // Skip junk
      const junkPatterns = /pdf|job|post|vacancy|salary|opening|career|instagram|facebook/i;
      if (junkPatterns.test(title) || junkPatterns.test(link)) {
        return;
      }

      // Extract Name
      let fullName = title.split(/[|\-·]/)[0].trim();
      fullName = fullName.replace(/,.*$/, '').replace(/\(.*\)/, '').trim();

      if (!isValidPersonName(fullName)) {
        return;
      }

      // Headline
      const headline = title.split(/[|\-·]/)[1]?.trim() || 'HR Professional';

      // Company
      let companyName = title.split(/[|\-·]/)[2]?.trim() || '';
      if (!companyName) {
        const atMatch = title.match(/(?:at|@)\s+([^,|:-]+)/i);
        if (atMatch) {
          companyName = atMatch[1].trim();
        }
      }
      if (!companyName) {
        // Infer from query if not found
        companyName = query;
      }
      companyName = cleanCompanyName(companyName);

      // Email Extraction
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      const foundEmails = snippet.match(emailRegex) || title.match(emailRegex);
      const discoveredEmail = foundEmails ? foundEmails[0] : null;

      let email = discoveredEmail;
      let confidence: 'High' | 'Likely' | 'Predicted' = 'High';

      if (!email) {
        const prediction = predictEmail(fullName, companyName);
        email = prediction.email;
        confidence = 'Predicted';
      } else {
        confidence = 'High';
      }

      // Verify email validity using the new verification framework
      if (!isValidEmail(email)) {
        email = null;
      }

      cleanContacts.push({
        name: fullName,
        company: companyName ? companyName.toUpperCase() : 'COMPANY',
        headline: headline,
        snippet: snippet,
        email: email,
        profileUrl: link,
        confidence: confidence
      });
    });

    return NextResponse.json(cleanContacts);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
