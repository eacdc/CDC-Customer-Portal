import { google } from 'googleapis';
import path from 'path';

let authClient = null;
let sheets = null;

/**
 * Helper function for logging with timestamps
 */
function logStep(step, startTime = null) {
  const now = Date.now();
  const timestamp = new Date().toISOString();
  if (startTime) {
    const duration = now - startTime;
    console.log(`[${timestamp}] ⏱️  [Sheets] ${step} - Duration: ${duration}ms`);
    return now;
  } else {
    console.log(`[${timestamp}] 📍 [Sheets] ${step}`);
    return now;
  }
}

/**
 * Initialize Google Sheets API client
 */
async function initializeSheets() {
  if (sheets) {
    logStep('Using cached Sheets client');
    return sheets;
  }

  const initStartTime = Date.now();
  logStep('Initializing Google Sheets API client');
  
  try {
    // Debug: Log which env vars are present (without exposing sensitive data)
    const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    const hasApiKey = !!process.env.GOOGLE_API_KEY;
    
    console.log('[Sheets] Environment variables check:', {
      hasServiceAccount,
      hasClientId,
      hasClientSecret,
      hasApiKey,
      serviceAccountLength: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.length || 0
    });
    
    // Option 1: Service Account (Recommended for server-side)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        
        // Validate required fields
        if (!serviceAccountKey.client_email) {
          throw new Error('Missing client_email in service account key');
        }
        if (!serviceAccountKey.private_key) {
          throw new Error('Missing private_key in service account key');
        }
        
        // Handle private key newlines - the key must have actual newline characters
        // When stored in JSON as a string, newlines are escaped as \n
        // After JSON.parse, they become literal \n (backslash + n), not actual newlines
        let privateKey = String(serviceAccountKey.private_key);
        
        // Replace literal backslash+n with actual newline
        // This handles the case where JSON had "\\n" which becomes "\n" after parse
        // Try multiple replacement strategies to handle different encodings
        if (privateKey.includes('\\n')) {
          // Replace literal backslash+n (two characters: \ and n)
          privateKey = privateKey.replace(/\\n/g, '\n');
        }
        // Also try replacing if it's stored as a different escape sequence
        if (privateKey.includes('\\\\n')) {
          privateKey = privateKey.replace(/\\\\n/g, '\n');
        }
        // Ensure we have actual newlines, not just the string "\n"
        // Double check by looking for the pattern without newlines
        if (!privateKey.match(/\n/) && privateKey.match(/BEGIN.*PRIVATE.*KEY/)) {
          // If we have BEGIN but no newlines, try to add them manually
          privateKey = privateKey
            .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
            .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n')
            .replace(/(.{64})/g, '$1\n') // Add newlines every 64 chars (PEM format)
            .replace(/\n\n+/g, '\n'); // Remove duplicate newlines
        }
        
        // Verify the key format
        const hasBeginMarker = privateKey.includes('-----BEGIN PRIVATE KEY-----');
        const hasEndMarker = privateKey.includes('-----END PRIVATE KEY-----');
        const hasActualNewlines = privateKey.includes('\n') && !privateKey.includes('\\n');
        
        // Final validation - ensure the key is properly formatted
        if (!hasBeginMarker || !hasEndMarker) {
          throw new Error('Invalid private key format: missing BEGIN or END markers');
        }
        
        // Trim any extra whitespace
        privateKey = privateKey.trim();
        
        // Verify we have actual newlines (not just the string "\n")
        const newlineCount = (privateKey.match(/\n/g) || []).length;
        const backslashNCount = (privateKey.match(/\\n/g) || []).length;
        
        console.log('[Sheets] Service account key parsed successfully:', {
          client_email: serviceAccountKey.client_email,
          has_private_key: !!privateKey,
          private_key_length: privateKey.length,
          has_begin_marker: hasBeginMarker,
          has_end_marker: hasEndMarker,
          actual_newline_count: newlineCount,
          literal_backslash_n_count: backslashNCount,
          private_key_first_60_chars: JSON.stringify(privateKey.substring(0, 60)),
          private_key_last_60_chars: JSON.stringify(privateKey.substring(Math.max(0, privateKey.length - 60)))
        });
        
        if (backslashNCount > 0) {
          console.warn('[Sheets] WARNING: Private key still contains literal \\n characters. Attempting additional fix...');
          privateKey = privateKey.replace(/\\n/g, '\n');
        }
        
        // Create JWT client using options object (recommended approach)
        // This is more reliable than positional arguments
        authClient = new google.auth.JWT({
          email: serviceAccountKey.client_email,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        // Verify the key is set on the client
        console.log('[Sheets] JWT client created, verifying key:', {
          hasKey: !!authClient.key,
          hasKeyFile: !!authClient.keyFile,
          email: authClient.email,
          keyType: typeof authClient.key,
          keyLength: authClient.key ? authClient.key.length : 0,
          keyFirstChars: authClient.key ? authClient.key.substring(0, 30) : 'N/A'
        });
        
        if (!authClient.key && !authClient.keyFile) {
          throw new Error('JWT client created but key is not set. Private key may be invalid.');
        }
        
        console.log('[Sheets] JWT client created successfully with key');
      } catch (parseError) {
        console.error('[Sheets] Error parsing GOOGLE_SERVICE_ACCOUNT_KEY:', parseError.message);
        console.error('[Sheets] Parse error details:', parseError);
        throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_KEY format. It must be a valid JSON string. Error: ${parseError.message}`);
      }
    }
    // Option 2: OAuth2 (Alternative)
    else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
      authClient = oauth2Client;
    }
    // Option 3: API Key (Read-only, limited)
    else if (process.env.GOOGLE_API_KEY) {
      authClient = process.env.GOOGLE_API_KEY;
    }
    else {
      throw new Error('No Google authentication method configured. Please set GOOGLE_SERVICE_ACCOUNT_KEY, OAuth2 credentials, or GOOGLE_API_KEY in environment variables.');
    }

    logStep('Authorizing with Google');
    await authClient.authorize();
    sheets = google.sheets({ version: 'v4', auth: authClient });
    logStep('Google Sheets API client initialized', initStartTime);
    return sheets;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ [Sheets] Error initializing Google Sheets:`, error);
    logStep('Google Sheets initialization failed', initStartTime);
    throw error;
  }
}

/**
 * Get range values from Google Sheets
 */
async function getRangeValues(sheetName, range) {
  const fetchStartTime = Date.now();
  logStep(`Fetching range ${sheetName}!${range} from Google Sheets`);
  
  try {
    const sheetsClient = await initializeSheets();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID_COMM_EST;

    if (!spreadsheetId) {
      throw new Error('GOOGLE_SPREADSHEET_ID_COMM_EST environment variable is not set');
    }

    const apiCallTime = Date.now();
    logStep(`Calling Google Sheets API for ${sheetName}!${range}`);
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!${range}`,
    });
    logStep('Google Sheets API call completed', apiCallTime);

    const data = response.data.values || [];
    logStep(`Range fetched (${data.length} rows)`, fetchStartTime);
    return data;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ [Sheets] Error getting range values:`, error);
    logStep('Range fetch failed', fetchStartTime);
    throw error;
  }
}

/**
 * Get Calculate_1 sheet data
 */
async function getCalculateSheetData() {
  const mainTable = await getRangeValues('Calculate_1', 'A2:Q2'); // Row 2, columns 1-17
  const inputTable = await getRangeValues('Calculate_1', 'A5:Q10'); // Rows 5-10, columns 1-17
  const displayTable = await getRangeValues('Calculate_1', 'A15:H21'); // Rows 15-21, columns 1-8
  
  return {
    mainTable: mainTable[0] || [],
    inputTable: inputTable,
    displayTable: displayTable
  };
}

/**
 * Get Options sheet data
 */
async function getOptionsSheetData() {
  const costarr = await getRangeValues('Options', 'A2:O'); // From row 2, columns 1-15
  const overHeadPerOps = await getRangeValues('Options', 'Z1:Z1'); // Cell Z1
  const opsTable = await getRangeValues('Options', 'P2:Q'); // From row 2, columns 16-17
  const opsTable1 = await getRangeValues('Options', 'A1:AC16'); // Rows 1-16, columns 1-29
  const opsTable2 = await getRangeValues('Options', 'A17:AC32'); // Rows 17-32, columns 1-29
  
  return {
    costarr: costarr,
    overHeadPerOps: overHeadPerOps[0]?.[0] || 0,
    opsTable: opsTable,
    opsTable1: opsTable1,
    opsTable2: opsTable2
  };
}

export {
  initializeSheets,
  getRangeValues,
  getCalculateSheetData,
  getOptionsSheetData
};
